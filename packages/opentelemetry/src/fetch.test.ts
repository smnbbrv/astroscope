import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { instrumentFetch } from './fetch';

// mock OpenTelemetry API
const mockSpan = {
  setAttribute: mock(() => {}),
  setStatus: mock(() => {}),
  end: mock(() => {}),
};

const mockTracer = {
  startSpan: mock(() => mockSpan),
};

mock.module('@opentelemetry/api', () => ({
  SpanKind: { CLIENT: 1 },
  SpanStatusCode: { OK: 0, ERROR: 1 },
  context: { active: () => ({}) },
  propagation: { inject: mock(() => {}) },
  trace: {
    getTracer: () => mockTracer,
    setSpan: (_ctx: unknown, span: unknown) => span,
  },
}));

// mock metrics
mock.module('./metrics.js', () => ({
  recordFetchRequestDuration: mock(() => {}),
}));

describe('instrumentFetch', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock(() => Promise.resolve(new Response('ok', { status: 200 })));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    // reset mocks
    mockSpan.setAttribute.mockClear();
    mockSpan.setStatus.mockClear();
    mockSpan.end.mockClear();
    mockTracer.startSpan.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('wraps global fetch', () => {
    instrumentFetch();

    expect(globalThis.fetch).not.toBe(mockFetch);
  });

  test('prevents double instrumentation', () => {
    instrumentFetch();
    const firstWrapped = globalThis.fetch;

    instrumentFetch();
    const secondWrapped = globalThis.fetch;

    expect(firstWrapped).toBe(secondWrapped);
  });

  test('calls original fetch with URL string', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/api');
  });

  test('calls original fetch with URL object', async () => {
    instrumentFetch();

    await globalThis.fetch(new URL('https://example.com/api'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('calls original fetch with Request object', async () => {
    instrumentFetch();

    const request = new Request('https://example.com/api', { method: 'POST' });
    await globalThis.fetch(request);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [passedRequest] = mockFetch.mock.calls[0] as [Request, RequestInit];
    expect(passedRequest).toBe(request);
  });

  test('preserves all RequestInit options', async () => {
    instrumentFetch();

    const controller = new AbortController();
    await globalThis.fetch('https://example.com/api', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-cache',
      redirect: 'follow',
      signal: controller.signal,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-cache');
    expect(init.redirect).toBe('follow');
    expect(init.signal).toBe(controller.signal);
  });

  test('adds duplex option when body is present in init', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(init.duplex).toBe('half');
  });

  test('adds duplex option when Request has body', async () => {
    instrumentFetch();

    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' }),
      // @ts-expect-error duplex is required for Request with body in Node.js
      duplex: 'half',
    });
    await globalThis.fetch(request);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [Request, RequestInit & { duplex?: string }];
    expect(init.duplex).toBe('half');
  });

  test('does not add duplex option for GET requests', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(init.duplex).toBeUndefined();
  });

  test('preserves body stream from Request object', async () => {
    instrumentFetch();

    const bodyContent = JSON.stringify({ test: 'data' });
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: bodyContent,
      // @ts-expect-error duplex is required for Request with body in Node.js
      duplex: 'half',
    });

    await globalThis.fetch(request);

    // the original request should be passed, not a new one
    const [passedRequest] = mockFetch.mock.calls[0] as [Request, RequestInit];
    expect(passedRequest).toBe(request);
  });

  test('injects trace headers', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toBeInstanceOf(Headers);
  });

  test('merges existing headers with trace headers', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer token');
  });

  test('creates span with correct attributes for GET', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api/users?page=1');

    expect(mockTracer.startSpan).toHaveBeenCalledTimes(1);
    const [name, options] = mockTracer.startSpan.mock.calls[0] as unknown as [
      string,
      { attributes: Record<string, unknown> },
    ];
    expect(name).toBe('FETCH GET');
    expect(options.attributes['http.request.method']).toBe('GET');
    expect(options.attributes['url.full']).toBe('https://example.com/api/users?page=1');
    expect(options.attributes['url.path']).toBe('/api/users');
    expect(options.attributes['server.address']).toBe('example.com');
    expect(options.attributes['server.port']).toBe(443);
  });

  test('creates span with correct attributes for POST', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api/users', { method: 'POST' });

    const [name] = mockTracer.startSpan.mock.calls[0] as unknown as [string];
    expect(name).toBe('FETCH POST');
  });

  test('detects method from Request object', async () => {
    instrumentFetch();

    const request = new Request('https://example.com/api', { method: 'PUT' });
    await globalThis.fetch(request);

    const [name] = mockTracer.startSpan.mock.calls[0] as unknown as [string];
    expect(name).toBe('FETCH PUT');
  });

  test('sets span status OK for successful response', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 200);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 }); // SpanStatusCode.OK
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  test('sets span status ERROR for 4xx response', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(new Response('not found', { status: 404 })));
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 404);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1, message: 'HTTP 404' }); // SpanStatusCode.ERROR
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  test('sets span status ERROR for 5xx response', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(new Response('error', { status: 500 })));
    instrumentFetch();

    await globalThis.fetch('https://example.com/api');

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 500);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1, message: 'HTTP 500' }); // SpanStatusCode.ERROR
  });

  test('sets span status ERROR and rethrows on fetch failure', async () => {
    const error = new Error('Network error');
    mockFetch.mockImplementation(() => Promise.reject(error));
    instrumentFetch();

    await expect(globalThis.fetch('https://example.com/api')).rejects.toThrow('Network error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1, message: 'Network error' }); // SpanStatusCode.ERROR
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  test('handles non-Error exceptions', async () => {
    mockFetch.mockImplementation(() => Promise.reject('string error'));
    instrumentFetch();

    await expect(globalThis.fetch('https://example.com/api')).rejects.toBe('string error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1, message: 'Unknown error' });
  });

  test('detects correct port for http URLs', async () => {
    instrumentFetch();

    await globalThis.fetch('http://example.com/api');

    const [, options] = mockTracer.startSpan.mock.calls[0] as unknown as [
      string,
      { attributes: Record<string, unknown> },
    ];
    expect(options.attributes['server.port']).toBe(80);
    expect(options.attributes['url.scheme']).toBe('http');
  });

  test('uses explicit port when provided', async () => {
    instrumentFetch();

    await globalThis.fetch('https://example.com:8443/api');

    const [, options] = mockTracer.startSpan.mock.calls[0] as unknown as [
      string,
      { attributes: Record<string, unknown> },
    ];
    expect(options.attributes['server.port']).toBe(8443);
  });

  test('extracts headers from Request object when no init headers', async () => {
    instrumentFetch();

    const request = new Request('https://example.com/api', {
      headers: { 'X-Custom': 'value' },
    });
    await globalThis.fetch(request);

    const [, init] = mockFetch.mock.calls[0] as [Request, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('X-Custom')).toBe('value');
  });

  test('preserves static properties from original fetch (e.g., preconnect)', () => {
    // add a static property to mock fetch
    (mockFetch as any).preconnect = mock(() => {});
    (mockFetch as any).customProperty = 'test';

    instrumentFetch();

    // static properties should be copied to instrumented fetch
    expect((globalThis.fetch as any).preconnect).toBeDefined();
    expect((globalThis.fetch as any).customProperty).toBe('test');
  });
});
