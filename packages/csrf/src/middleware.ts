import { shouldExclude } from '@astroscope/excludes';
import type { MiddlewareHandler } from 'astro';
import type { CsrfOptions } from './types.js';

const FORBIDDEN_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Creates a CSRF protection middleware with the given options.
 *
 * Compares the request's Origin header against context.url.origin.
 * Configure `security.allowedDomains` in your Astro config to ensure context.url is correct.
 *
 * @example
 * ```ts
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { createCsrfMiddleware } from '@astroscope/csrf';
 *
 * export const onRequest = sequence(
 *   createCsrfMiddleware({
 *     exclude: [{ prefix: '/auth/' }],
 *   }),
 * );
 * ```
 */
export function createCsrfMiddleware(options: CsrfOptions = {}): MiddlewareHandler {
  return (context, next) => {
    if (options.enabled === false) {
      return next();
    }

    if (shouldExclude(context, options.exclude)) {
      return next();
    }

    if (!FORBIDDEN_METHODS.has(context.request.method)) {
      return next();
    }

    const origin = context.request.headers.get('origin');

    if (!origin || origin !== context.url.origin) {
      return new Response(`Cross-site ${context.request.method} request forbidden`, { status: 403 });
    }

    return next();
  };
}
