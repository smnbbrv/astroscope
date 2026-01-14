import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { recordFetchRequestDuration } from './metrics.js';

const LIB_NAME = '@astroscope/opentelemetry';
const INSTRUMENTED = Symbol.for('@astroscope/opentelemetry/fetch');

/**
 * Instruments the global fetch to create OpenTelemetry spans for outgoing HTTP requests.
 * Call this once at application startup (e.g., in your boot.ts onStartup hook).
 *
 * @example
 * ```ts
 * // src/boot.ts
 * import { NodeSDK } from "@opentelemetry/sdk-node";
 * import { instrumentFetch } from "@astroscope/opentelemetry";
 *
 * const sdk = new NodeSDK({ ... });
 *
 * export function onStartup() {
 *   sdk.start();
 *   instrumentFetch();
 * }
 * ```
 */
export function instrumentFetch(): void {
  // prevent double instrumentation (e.g., during HMR)
  if ((globalThis.fetch as any)[INSTRUMENTED]) {
    return;
  }

  const originalFetch = globalThis.fetch;

  async function instrumentedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const tracer = trace.getTracer(LIB_NAME);
    const activeContext = context.active();

    // extract URL and method without consuming the body
    let url: URL;
    let method: string;

    if (input instanceof Request) {
      url = new URL(input.url);
      method = input.method;
    } else {
      url = new URL(input.toString(), globalThis.location?.href);
      method = init?.method ?? 'GET';
    }

    const span = tracer.startSpan(
      `FETCH ${method}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.request.method': method,
          'url.full': url.href,
          'url.path': url.pathname,
          'url.scheme': url.protocol.replace(':', ''),
          'server.address': url.hostname,
          'server.port': url.port ? parseInt(url.port) : url.protocol === 'https:' ? 443 : 80,
        },
      },
      activeContext,
    );

    // inject trace headers
    const carrier: Record<string, string> = {};
    propagation.inject(trace.setSpan(activeContext, span), carrier);

    // merge headers without consuming the request
    const existingHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(existingHeaders);

    for (const [key, value] of Object.entries(carrier)) {
      headers.set(key, value);
    }

    // build new init, preserving all original options
    const hasBody = init?.body !== undefined || (input instanceof Request && input.body !== null);
    const newInit: RequestInit = {
      ...init,
      headers,
      // required in node.js 18.13+
      ...(hasBody && { duplex: 'half' }),
    };

    const startTime = performance.now();

    try {
      // pass original input to preserve body stream
      const response = await originalFetch(input, newInit);

      span.setAttribute('http.response.status_code', response.status);

      if (response.status >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();

      recordFetchRequestDuration(
        { method, host: url.hostname, status: response.status },
        performance.now() - startTime,
      );

      return response;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      span.end();

      recordFetchRequestDuration({ method, host: url.hostname, status: 0 }, performance.now() - startTime);

      throw error;
    }
  }

  (instrumentedFetch as any)[INSTRUMENTED] = true;
  globalThis.fetch = Object.assign(instrumentedFetch, originalFetch);
}
