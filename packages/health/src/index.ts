// singletons
export { server } from './server.js';
export { probes } from './probes.js';
export { checks } from './checks.js';

// classes (for advanced use cases / testing)
export { HealthServer } from './server.js';
export { HealthProbes } from './probes.js';
export { HealthChecks } from './checks.js';

// types
export type {
  HealthCheck,
  HealthCheckResult,
  HealthProbe,
  HealthProbeResult,
  HealthServerOptions,
  HealthzProbe,
  HealthzResult,
} from './types.js';
