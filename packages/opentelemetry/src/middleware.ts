import { shouldExclude } from '@astroscope/excludes';
import { SpanKind, type SpanOptions, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { type RPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import type { MiddlewareHandler } from 'astro';
import { recordActionDuration, recordHttpRequestDuration, recordHttpRequestStart } from './metrics.js';
import type { OpenTelemetryMiddlewareOptions } from './types.js';

const LIB_NAME = '@astroscope/opentelemetry';
const ACTIONS_PREFIX = '/_actions/';

function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    // no native ip address access in Astro available
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
export function createOpenTelemetryMiddleware(options: OpenTelemetryMiddlewareOptions = {}): MiddlewareHandler {
  const tracer = trace.getTracer(LIB_NAME);

  return async (ctx, next) => {
    if (shouldExclude(ctx, options.exclude)) {
      return next();
    }

    const startTime = performance.now();

    const { request, url, routePattern } = ctx;
    const input = { traceparent: request.headers.get('traceparent'), tracestate: request.headers.get('tracestate') };
    const parentContext = propagation.extract(context.active(), input);
    const contentLength = request.headers.get('content-length');
    const clientIp = getClientIp(request);

    const spanOptions: SpanOptions = {
      attributes: {
        'http.request.method': request.method,
        'http.route': routePattern,
        'url.full': request.url,
        'url.path': url.pathname,
        'url.query': url.search.slice(1),
        'url.scheme': url.protocol.replace(':', ''),
        'server.address': url.hostname,
        'server.port': url.port ? parseInt(url.port) : url.protocol === 'https:' ? 443 : 80,
        'user_agent.original': request.headers.get('user-agent') ?? '',
        ...(contentLength && { 'http.request.body.size': parseInt(contentLength) }),
        ...(clientIp && { 'client.address': clientIp }),
      },
      kind: SpanKind.SERVER,
    };

    const isAction = url.pathname.startsWith(ACTIONS_PREFIX);
    const actionName = url.pathname.slice(ACTIONS_PREFIX.length).replace(/\/$/, '');
    const spanName = isAction ? `ACTION ${actionName}` : `${request.method} ${routePattern}`;
    const span = tracer.startSpan(spanName, spanOptions, parentContext);
    const spanContext = trace.setSpan(parentContext, span);
    const rpcMetadata: RPCMetadata = { type: RPCType.HTTP, span };

    const endActiveRequest = recordHttpRequestStart({ method: request.method, route: routePattern });

    return context.with(setRPCMetadata(spanContext, rpcMetadata), async () => {
      const finalize = (status: number, responseSize: number) => {
        span.setAttribute('http.response.status_code', status);
        span.setAttribute('http.response.body.size', responseSize);

        if (status >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${status}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        span.end();

        endActiveRequest();

        const duration = performance.now() - startTime;

        recordHttpRequestDuration({ method: request.method, route: routePattern, status }, duration);

        if (isAction) {
          recordActionDuration({ name: actionName, status }, duration);
        }
      };

      try {
        const response = await next();

        if (!response.body) {
          finalize(response.status, 0);
          return response;
        }

        const [measureStream, clientStream] = response.body.tee();

        let responseSize = 0;

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
          message: e instanceof Error ? e.message : 'Unknown error',
        });

        span.end();

        endActiveRequest();

        const duration = performance.now() - startTime;

        recordHttpRequestDuration({ method: request.method, route: routePattern, status: 500 }, duration);

        if (isAction) {
          recordActionDuration({ name: actionName, status: 500 }, duration);
        }

        throw e;
      }
    });
  };
}
