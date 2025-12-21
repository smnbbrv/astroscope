export { createOpenTelemetryMiddleware } from "./middleware.js";
export { instrumentFetch } from "./fetch.js";
export { opentelemetry } from "./integration.js";
export {
  RECOMMENDED_EXCLUDES,
  DEV_EXCLUDES,
  ASTRO_STATIC_EXCLUDES,
  STATIC_EXCLUDES,
} from "./excludes.js";
export type { OpenTelemetryMiddlewareOptions, ExcludePattern } from "./types.js";
export type { OpenTelemetryIntegrationOptions } from "./integration.js";
