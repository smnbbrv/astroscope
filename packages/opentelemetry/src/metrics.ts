import { ValueType, metrics } from '@opentelemetry/api';

const LIB_NAME = '@astroscope/opentelemetry';

// lazy initialization to avoid errors if metrics SDK isn't configured
let httpRequestDuration: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']> | null = null;
let httpActiveRequests: ReturnType<ReturnType<typeof metrics.getMeter>['createUpDownCounter']> | null = null;
let fetchRequestDuration: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']> | null = null;
let actionDuration: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']> | null = null;

function getHttpRequestDuration() {
  if (!httpRequestDuration) {
    const meter = metrics.getMeter(LIB_NAME);

    httpRequestDuration = meter.createHistogram('http.server.request.duration', {
      description: 'Duration of HTTP server requests',
      unit: 's',
      valueType: ValueType.DOUBLE,
    });
  }
  return httpRequestDuration;
}

function getHttpActiveRequests() {
  if (!httpActiveRequests) {
    const meter = metrics.getMeter(LIB_NAME);

    httpActiveRequests = meter.createUpDownCounter('http.server.active_requests', {
      description: 'Number of active HTTP server requests',
      unit: '{request}',
      valueType: ValueType.INT,
    });
  }
  return httpActiveRequests;
}

function getFetchRequestDuration() {
  if (!fetchRequestDuration) {
    const meter = metrics.getMeter(LIB_NAME);

    fetchRequestDuration = meter.createHistogram('http.client.request.duration', {
      description: 'Duration of HTTP client requests (fetch)',
      unit: 's',
      valueType: ValueType.DOUBLE,
    });
  }
  return fetchRequestDuration;
}

function getActionDuration() {
  if (!actionDuration) {
    const meter = metrics.getMeter(LIB_NAME);

    actionDuration = meter.createHistogram('astro.action.duration', {
      description: 'Duration of Astro action executions',
      unit: 's',
      valueType: ValueType.DOUBLE,
    });
  }
  return actionDuration;
}

/**
 * Attributes for HTTP server request metrics.
 */
export interface HttpMetricsAttributes {
  method: string;
  route: string;
  status: number;
}

/**
 * Record the start of an HTTP request.
 * Returns a function to call when the request ends.
 */
export function recordHttpRequestStart(attributes: { method: string; route: string }): () => void {
  getHttpActiveRequests().add(1, {
    'http.request.method': attributes.method,
    'http.route': attributes.route,
  });

  return () => {
    getHttpActiveRequests().add(-1, {
      'http.request.method': attributes.method,
      'http.route': attributes.route,
    });
  };
}

/**
 * Record HTTP request duration.
 */
export function recordHttpRequestDuration(attributes: HttpMetricsAttributes, durationMs: number): void {
  getHttpRequestDuration().record(durationMs / 1000, {
    'http.request.method': attributes.method,
    'http.route': attributes.route,
    'http.response.status_code': attributes.status,
  });
}

/**
 * Attributes for fetch request metrics.
 */
export interface FetchMetricsAttributes {
  method: string;
  host: string;
  status: number;
}

/**
 * Record fetch request duration.
 */
export function recordFetchRequestDuration(attributes: FetchMetricsAttributes, durationMs: number): void {
  getFetchRequestDuration().record(durationMs / 1000, {
    'http.request.method': attributes.method,
    'server.address': attributes.host,
    'http.response.status_code': attributes.status,
  });
}

/**
 * Attributes for Astro action metrics.
 */
export interface ActionMetricsAttributes {
  name: string;
  status: number;
}

/**
 * Record Astro action duration.
 */
export function recordActionDuration(attributes: ActionMetricsAttributes, durationMs: number): void {
  getActionDuration().record(durationMs / 1000, {
    'astro.action.name': attributes.name,
    'http.response.status_code': attributes.status,
  });
}
