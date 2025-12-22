// @ts-expect-error - virtual module provided by the integration
import { excludePatterns } from 'virtual:@astroscope/opentelemetry/config';
import { createOpenTelemetryMiddleware } from './middleware.js';

/**
 * Pre-configured middleware for use with the opentelemetry() integration.
 * Exclude patterns are configured via the integration options.
 */
export const onRequest = createOpenTelemetryMiddleware({ exclude: excludePatterns });
