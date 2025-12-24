import type { APIContext } from 'astro';

export type ExcludePattern = { pattern: RegExp } | { prefix: string } | { exact: string };

/**
 * Vite/Astro dev server paths - only relevant in development.
 */
export const DEV_EXCLUDES: ExcludePattern[] = [
  { prefix: '/@id/' },
  { prefix: '/@fs/' },
  { prefix: '/@vite/' },
  { prefix: '/src/' },
  { prefix: '/node_modules/' },
];

/**
 * Astro internal paths for static assets and image optimization.
 */
export const ASTRO_STATIC_EXCLUDES: ExcludePattern[] = [{ prefix: '/_astro/' }, { prefix: '/_image' }];

/**
 * Common static asset paths.
 */
export const STATIC_EXCLUDES: ExcludePattern[] = [
  { exact: '/favicon.ico' },
  { exact: '/robots.txt' },
  { exact: '/sitemap.xml' },
  { exact: '/browserconfig.xml' },
  { exact: '/manifest.json' },
  { exact: '/manifest.webmanifest' },
];

/**
 * Recommended excludes for middleware.
 * Includes dev paths, Astro internals, and common static assets.
 *
 * @example
 * ```ts
 * createPinoMiddleware({
 *   exclude: [
 *     ...RECOMMENDED_EXCLUDES,
 *     { exact: "/health" }, // your health endpoint
 *   ],
 * })
 * ```
 */
export const RECOMMENDED_EXCLUDES: ExcludePattern[] = [...DEV_EXCLUDES, ...ASTRO_STATIC_EXCLUDES, ...STATIC_EXCLUDES];

/**
 * Check if a path matches an exclude pattern.
 */
function matchesPattern(path: string, pattern: ExcludePattern): boolean {
  if ('pattern' in pattern) {
    return pattern.pattern.test(path);
  }

  if ('prefix' in pattern) {
    return path.startsWith(pattern.prefix);
  }

  return path === pattern.exact;
}

/**
 * Check if a request should be excluded based on patterns or function.
 */
export function shouldExclude(
  ctx: APIContext,
  exclude: ExcludePattern[] | ((context: APIContext) => boolean) | undefined,
): boolean {
  if (!exclude) return false;

  if (typeof exclude === 'function') {
    return exclude(ctx);
  }

  return exclude.some((pattern) => matchesPattern(ctx.url.pathname, pattern));
}

/**
 * Serialize exclude patterns to JavaScript code for use in virtual modules.
 * Handles RegExp objects which JSON.stringify cannot serialize.
 */
export function serializeExcludePatterns(patterns: ExcludePattern[]): string {
  return `[${patterns.map((p) => ('pattern' in p ? `{ pattern: ${p.pattern.toString()} }` : JSON.stringify(p))).join(', ')}]`;
}
