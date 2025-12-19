import type { APIContext, MiddlewareHandler } from "astro";
import type { CsrfOptions, ExcludePattern } from "./types.js";

const FORBIDDEN_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  context: APIContext,
  exclude: CsrfOptions["exclude"]
): boolean {
  if (!exclude) return false;

  if (typeof exclude === "function") {
    return exclude(context);
  }

  const path = context.url.pathname;
  return exclude.some((pattern) => matchesPattern(path, pattern));
}

function normalizeOrigins(input: string | string[]): Set<string> {
  const origins = Array.isArray(input) ? input : [input];
  return new Set(origins.map((o) => new URL(o).origin));
}

/**
 * Creates a CSRF protection middleware with the given options.
 *
 * @example
 * ```ts
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { createCsrfMiddleware } from '@astroscope/csrf';
 *
 * export const onRequest = sequence(
 *   createCsrfMiddleware({
 *     origin: 'https://example.com',
 *     exclude: [{ prefix: '/auth/' }],
 *   }),
 * );
 * ```
 */
export function createCsrfMiddleware(options: CsrfOptions): MiddlewareHandler {
  // Pre-compute allowed origins if static
  const staticAllowedOrigins =
    typeof options.origin !== "function"
      ? normalizeOrigins(options.origin)
      : null;

  return (context, next) => {
    // Skip excluded paths
    if (shouldExclude(context, options.exclude)) {
      return next();
    }

    // Only check state-changing methods
    if (!FORBIDDEN_METHODS.has(context.request.method)) {
      return next();
    }

    const origin = context.request.headers.get("origin");
    const allowedOrigins =
      staticAllowedOrigins ??
      normalizeOrigins((options.origin as () => string | string[])());

    if (!origin || !allowedOrigins.has(origin)) {
      return new Response(
        `Cross-site ${context.request.method} request forbidden`,
        { status: 403 }
      );
    }

    return next();
  };
}
