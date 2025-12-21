import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";
import { recordFetchRequestDuration } from "./metrics.js";

const LIB_NAME = "@astroscope/opentelemetry";

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
  const originalFetch = globalThis.fetch;

  async function instrumentedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const tracer = trace.getTracer(LIB_NAME);
    const activeContext = context.active();

    // Parse request details
    const request = new Request(input, init);
    const url = new URL(request.url);

    const span = tracer.startSpan(
      `FETCH ${request.method}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.request.method": request.method,
          "url.full": request.url,
          "url.path": url.pathname,
          "url.scheme": url.protocol.replace(":", ""),
          "server.address": url.hostname,
          "server.port": url.port
            ? parseInt(url.port)
            : url.protocol === "https:"
              ? 443
              : 80,
        },
      },
      activeContext
    );

    // Inject trace context into outgoing headers
    const headers = new Headers(request.headers);
    const carrier: Record<string, string> = {};
    propagation.inject(trace.setSpan(activeContext, span), carrier);

    for (const [key, value] of Object.entries(carrier)) {
      headers.set(key, value);
    }

    const startTime = performance.now();

    try {
      const response = await originalFetch(request.url, {
        ...init,
        method: request.method,
        headers,
        body: request.body,
      });

      span.setAttribute("http.response.status_code", response.status);

      if (response.status >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();

      // Record fetch metrics
      recordFetchRequestDuration(
        { method: request.method, host: url.hostname, status: response.status },
        performance.now() - startTime
      );

      return response;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      span.end();

      // Record fetch metrics for errors
      recordFetchRequestDuration(
        { method: request.method, host: url.hostname, status: 0 },
        performance.now() - startTime
      );

      throw error;
    }
  }

  // Preserve any additional properties on the original fetch (e.g., preconnect)
  globalThis.fetch = Object.assign(instrumentedFetch, originalFetch);
}
