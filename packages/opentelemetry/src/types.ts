import type { ExcludePattern } from '@astroscope/excludes';
import type { APIContext } from 'astro';

export interface OpenTelemetryMiddlewareOptions {
  /**
   * Paths to exclude from tracing.
   * Can be an array of patterns or a function that returns true to exclude.
   */
  exclude?: ExcludePattern[] | ((context: APIContext) => boolean) | undefined;
}
