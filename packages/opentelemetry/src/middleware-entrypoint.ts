import { createOpenTelemetryMiddleware } from "./middleware.js";
// @ts-expect-error - Virtual module provided by the integration
import { excludePatterns } from "virtual:@astroscope/opentelemetry/config";

/**
 * Pre-configured middleware for use with the opentelemetry() integration.
 * Exclude patterns are configured via the integration options.
 */
export const onRequest = createOpenTelemetryMiddleware({
  exclude: excludePatterns,
});
