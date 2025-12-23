import type { ExcludePattern } from '@astroscope/excludes';
import type { APIContext } from 'astro';

type CsrfOptionsBase = {
  /**
   * Whether CSRF protection is enabled.
   * @default true
   * @example
   * ```ts
   * // Disable in development
   * csrf({ enabled: import.meta.env.PROD, trustProxy: true })
   * ```
   */
  enabled?: boolean;

  /**
   * Paths to exclude from CSRF protection.
   * Can be an array of patterns or a function that returns true to exclude.
   */
  exclude?: ExcludePattern[] | ((context: APIContext) => boolean);
};

/**
 * Options for the CSRF integration.
 */
export type CsrfIntegrationOptions = CsrfOptionsBase &
  (
    | {
        /**
         * Trust the proxy and compare Origin header against Astro.url.origin.
         * Use this when running behind a trusted load balancer that controls
         * X-Forwarded-* headers.
         */
        trustProxy: true;
      }
    | {
        /**
         * The expected origin(s) (e.g., "https://example.com").
         * Compared against the request's Origin header.
         */
        origin: string | string[];
      }
  );

/**
 * Options for the CSRF middleware (manual usage).
 * Supports function for runtime origin resolution.
 */
export type CsrfMiddlewareOptions = CsrfOptionsBase &
  (
    | {
        /**
         * Trust the proxy and compare Origin header against context.url.origin.
         */
        trustProxy: true;
      }
    | {
        /**
         * The expected origin(s) (e.g., "https://example.com").
         * Can be a string, array of strings, or a function for runtime config.
         */
        origin: string | string[] | (() => string | string[]);
      }
  );
