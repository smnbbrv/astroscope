import type { ExcludePattern } from '@astroscope/excludes';
import type { APIContext } from 'astro';

export interface PinoMiddlewareOptions {
  /**
   * Paths to exclude from logging.
   * Can be an array of patterns or a function that returns true to exclude.
   *
   * @example
   * ```ts
   * // Pattern array
   * createPinoMiddleware({
   *   exclude: [
   *     ...RECOMMENDED_EXCLUDES,
   *     { exact: '/health' },
   *   ],
   * });
   *
   * // Function
   * createPinoMiddleware({
   *   exclude: (ctx) => ctx.url.pathname === '/health',
   * });
   * ```
   */
  exclude?: ExcludePattern[] | ((ctx: APIContext) => boolean) | undefined;

  /**
   * Enable extended logging with additional request details.
   * When enabled, logs include: query parameters, headers, and client IP address.
   *
   * **Privacy note**: Extended logging may capture sensitive data (auth tokens, PII in query strings).
   * Only enable in environments where this is acceptable and compliant with your privacy policies.
   *
   * @default false
   */
  extended?: boolean | undefined;
}

export interface PinoIntegrationOptions {
  /**
   * Paths to exclude from logging.
   * Defaults to RECOMMENDED_EXCLUDES if not provided.
   * If provided, replaces the default entirely.
   *
   * @example
   * ```ts
   * // Use defaults (RECOMMENDED_EXCLUDES)
   * pino()
   *
   * // Custom excludes (replaces defaults)
   * import { RECOMMENDED_EXCLUDES } from '@astroscope/excludes';
   * pino({ exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }] })
   * ```
   */
  exclude?: ExcludePattern[] | undefined;

  /**
   * Enable extended logging with additional request details.
   * When enabled, logs include: query parameters, headers, and client IP address.
   *
   * **Privacy note**: Extended logging may capture sensitive data (auth tokens, PII in query strings).
   * Only enable in environments where this is acceptable and compliant with your privacy policies.
   *
   * @default false
   */
  extended?: boolean | undefined;
}
