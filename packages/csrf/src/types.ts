import type { APIContext } from "astro";

export type ExcludePattern = { pattern: RegExp } | { prefix: string } | { exact: string };

export interface CsrfOptions {
  /**
   * Paths to exclude from CSRF protection.
   * Can be an array of patterns or a function that returns true to exclude.
   */
  exclude?: ExcludePattern[] | ((context: APIContext) => boolean);

  /**
   * The expected origin(s) (e.g., "https://example.com").
   * Compared against the request's Origin header.
   * Can be a string, array of strings, or a function for runtime config.
   */
  origin: string | string[] | (() => string | string[]);
}
