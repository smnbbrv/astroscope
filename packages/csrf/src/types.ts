import type { ExcludePattern } from '@astroscope/excludes';
import type { APIContext } from 'astro';

/**
 * Options for the CSRF integration and middleware.
 *
 * Origin validation compares the request's Origin header against context.url.origin.
 * Configure `security.allowedDomains` in your Astro config to ensure context.url is correct.
 */
export type CsrfOptions = {
  /**
   * Whether CSRF protection is enabled.
   * @default true
   * @example
   * ```ts
   * // disable in development
   * csrf({ enabled: import.meta.env.PROD })
   * ```
   */
  enabled?: boolean | undefined;

  /**
   * Paths to exclude from CSRF protection.
   * Can be an array of patterns or a function that returns true to exclude.
   */
  exclude?: ExcludePattern[] | ((context: APIContext) => boolean) | undefined;
};
