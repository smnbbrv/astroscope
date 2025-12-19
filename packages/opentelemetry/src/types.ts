import type { APIContext } from "astro";

export type ExcludePattern = { pattern: RegExp } | { prefix: string } | { exact: string };

export interface OpenTelemetryMiddlewareOptions {
  /**
   * Paths to exclude from tracing.
   * Can be an array of patterns or a function that returns true to exclude.
   */
  exclude?: ExcludePattern[] | ((context: APIContext) => boolean);
}
