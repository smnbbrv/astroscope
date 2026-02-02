import { shouldExclude } from '@astroscope/excludes';
import type { MiddlewareHandler } from 'astro';
import { generateReqId, log, runWithLogger } from './logger.js';
import type { PinoMiddlewareOptions } from './types.js';

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

    const finalize = (status: number, error?: Error) => {
      const responseTime = performance.now() - startTime;

      let level: 'info' | 'warn' | 'error' = 'info';

      if (status >= 500 || error) {
        level = 'error';
      } else if (status >= 400) {
        level = 'warn';
      }

      const data = {
        res: { statusCode: status },
        responseTime: Math.round(responseTime * 100) / 100,
        ...(error && { err: error }),
      };

      requestLogger[level](data, error ? 'request errored' : 'request completed');
    };

    return runWithLogger(requestLogger, async () => {
      try {
        const response = await next();

        finalize(response.status);

        return response;
      } catch (error) {
        finalize(500, error instanceof Error ? error : new Error(String(error)));

        throw error;
      }
    });
  };
}
