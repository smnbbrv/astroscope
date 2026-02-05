import { shouldExclude } from '@astroscope/excludes';
import type { MiddlewareHandler } from 'astro';
import { generateReqId, log, runWithLogger } from './logger.js';
import type { PinoMiddlewareOptions } from './types.js';

const roundTime = (n: number) => Math.round(n * 100) / 100;

/**
 * Creates a pino-http-alike logging middleware for Astro.
 *
 * @example
 * ```ts
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { createPinoMiddleware } from '@astroscope/pino';
 * import { RECOMMENDED_EXCLUDES } from '@astroscope/excludes';
 *
 * export const onRequest = sequence(
 *   createPinoMiddleware({
 *     exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }],
 *   }),
 * );
 * ```
 */
export function createPinoMiddleware(options: PinoMiddlewareOptions = {}): MiddlewareHandler {
  const { extended = false } = options;

  return async (ctx, next) => {
    if (shouldExclude(ctx, options.exclude)) {
      return next();
    }

    const startTime = performance.now();
    const reqId = generateReqId();

    const req: Record<string, unknown> = {
      method: ctx.request.method,
      url: ctx.url.pathname,
    };

    // extended logging includes potentially sensitive data
    if (extended) {
      req.query = Object.fromEntries(ctx.url.searchParams);
      req.headers = Object.fromEntries(ctx.request.headers);
      req.remoteAddress = ctx.clientAddress;
    }

    const requestLogger = log.root.child({ reqId, req });

    const finalize = (status: number, ttfb: number, responseSize: number, error?: Error | undefined) => {
      const responseTime = performance.now() - startTime;

      let level: 'info' | 'warn' | 'error' = 'info';

      if (status >= 500 || error) {
        level = 'error';
      } else if (status >= 400) {
        level = 'warn';
      }

      const data = {
        res: { statusCode: status },
        responseTime: roundTime(responseTime),
        ttfb: roundTime(ttfb),
        responseSize,
        ...(error && { err: error }),
      };

      requestLogger[level](data, error ? 'request errored' : 'request completed');
    };

    return runWithLogger(requestLogger, async () => {
      try {
        const response = await next();
        const ttfb = performance.now() - startTime;

        if (!response.body) {
          finalize(response.status, ttfb, 0);

          return response;
        }

        let responseSize = 0;

        const transform = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            responseSize += chunk.length;
            controller.enqueue(chunk);
          },
          flush() {
            finalize(response.status, ttfb, responseSize);
          },
        });

        return new Response(response.body.pipeThrough(transform), {
          status: response.status,
          headers: response.headers,
        });
      } catch (error) {
        const ttfb = performance.now() - startTime;

        finalize(500, ttfb, 0, error instanceof Error ? error : new Error(String(error)));

        throw error;
      }
    });
  };
}
