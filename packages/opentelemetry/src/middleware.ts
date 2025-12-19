import type { APIContext, MiddlewareHandler } from "astro";
import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
  type SpanOptions,
} from "@opentelemetry/api";
import { type RPCMetadata, RPCType, setRPCMetadata } from "@opentelemetry/core";
import type { OpenTelemetryMiddlewareOptions, ExcludePattern } from "./types.js";

const LIB_NAME = "@astroscope/opentelemetry";

function matchesPattern(path: string, pattern: ExcludePattern): boolean {
  if ("pattern" in pattern) {
    return pattern.pattern.test(path);
  }
  if ("prefix" in pattern) {
    return path.startsWith(pattern.prefix);
  }
  return path === pattern.exact;
}

function shouldExclude(
  ctx: APIContext,
  exclude: OpenTelemetryMiddlewareOptions["exclude"]
): boolean {
  if (!exclude) return false;

  if (typeof exclude === "function") {
    return exclude(ctx);
  }

  const path = ctx.url.pathname;
  return exclude.some((pattern) => matchesPattern(path, pattern));
}

function getClientIp(request: Request): string | undefined {
  // Try common proxy headers in order of preference
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ?? // Cloudflare
    undefined
  );
}

/**
 * Creates an OpenTelemetry tracing middleware.
 *
 * @example
 * ```ts
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { createOpenTelemetryMiddleware, RECOMMENDED_EXCLUDES } from '@astroscope/opentelemetry';
 *
 * export const onRequest = sequence(
 *   createOpenTelemetryMiddleware({
 *     exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }],
 *   }),
 * );
 * ```
 */
export function createOpenTelemetryMiddleware(
  options: OpenTelemetryMiddlewareOptions = {}
): MiddlewareHandler {
  const tracer = trace.getTracer(LIB_NAME);

  return async (ctx, next) => {
    if (shouldExclude(ctx, options.exclude)) {
      return next();
    }

    const { request, url } = ctx;

    // Extract trace context from incoming headers
    const input = {
      traceparent: request.headers.get("traceparent"),
      tracestate: request.headers.get("tracestate"),
    };
    const parentContext = propagation.extract(context.active(), input);

    const clientIp = getClientIp(request);

    const contentLength = request.headers.get("content-length");

    const spanOptions: SpanOptions = {
      attributes: {
        "http.request.method": request.method,
        "url.full": request.url,
        "url.path": url.pathname,
        "url.query": url.search.slice(1), // Remove leading "?"
        "url.scheme": url.protocol.replace(":", ""),
        "server.address": url.hostname,
        "server.port": url.port ? parseInt(url.port) : (url.protocol === "https:" ? 443 : 80),
        "user_agent.original": request.headers.get("user-agent") ?? "",
        ...(contentLength && { "http.request.body.size": parseInt(contentLength) }),
        ...(clientIp && { "client.address": clientIp }),
      },
      kind: SpanKind.SERVER,
    };

    const span = tracer.startSpan(
      `${request.method} ${url.pathname}`,
      spanOptions,
      parentContext
    );

    const spanContext = trace.setSpan(parentContext, span);
    const rpcMetadata: RPCMetadata = { type: RPCType.HTTP, span };

    return context.with(
      setRPCMetadata(spanContext, rpcMetadata),
      async () => {
        const finalize = (status: number, responseSize: number) => {
          span.setAttribute("http.response.status_code", status);
          span.setAttribute("http.response.body.size", responseSize);

          if (status >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${status}`,
            });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }

          span.end();
        };

        try {
          const response = await next();

          // No body - finalize immediately
          if (!response.body) {
            finalize(response.status, 0);
            return response;
          }

          // Stream body - tee to measure size
          const [measureStream, clientStream] = response.body.tee();

          let responseSize = 0;

          // Consume measure stream in background (non-blocking)
          (async () => {
            const reader = measureStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                responseSize += value.length;
              }
            } finally {
              finalize(response.status, responseSize);
            }
          })();

          return new Response(clientStream, {
            status: response.status,
            headers: response.headers,
          });
        } catch (e) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: e instanceof Error ? e.message : "Unknown error",
          });
          span.end();
          throw e;
        }
      }
    );
  };
}
