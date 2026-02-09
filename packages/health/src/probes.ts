import { checks } from './checks.js';
import type { HealthProbe, HealthProbeResult, HealthzProbe, HealthzResult } from './types.js';

/**
 * Manages probe state and provides probe endpoints.
 */
export class HealthProbes {
  private state = {
    livez: false,
    startupz: false,
    readyz: false,
  };

  private createProbeResponse(result: HealthProbeResult): Response {
    return new Response(result.passing ? 'OK' : 'Service Unavailable', {
      status: result.passing ? 200 : 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  readonly livez: HealthProbe = {
    enable: () => {
      this.state.livez = true;
    },
    disable: () => {
      this.state.livez = false;
    },
    get: async (): Promise<HealthProbeResult> => {
      return { passing: this.state.livez };
    },
    response: async (): Promise<Response> => {
      return this.createProbeResponse(await this.livez.get());
    },
  };

  readonly startupz: HealthProbe = {
    enable: () => {
      this.state.startupz = true;
    },
    disable: () => {
      this.state.startupz = false;
    },
    get: async (): Promise<HealthProbeResult> => {
      return { passing: this.state.startupz };
    },
    response: async (): Promise<Response> => {
      return this.createProbeResponse(await this.startupz.get());
    },
  };

  readonly readyz: HealthProbe = {
    enable: () => {
      this.state.readyz = true;
    },
    disable: () => {
      this.state.readyz = false;
    },
    get: async (): Promise<HealthProbeResult> => {
      return { passing: this.state.readyz ? await checks.runRequired() : false };
    },
    response: async (): Promise<Response> => {
      return this.createProbeResponse(await this.readyz.get());
    },
  };

  readonly healthz: HealthzProbe = {
    get: async (): Promise<HealthzResult> => {
      const checkResults = await checks.runAll();
      const registered = checks.getChecks();

      const hasUnhealthy = Object.values(checkResults).some((c) => c.status === 'unhealthy');

      const hasRequiredUnhealthy = registered
        .filter((check) => !check.optional)
        .some((check) => checkResults[check.name]?.status !== 'healthy');

      let status: HealthzResult['status'] = 'healthy';

      if (hasRequiredUnhealthy) {
        status = 'unhealthy';
      } else if (hasUnhealthy) {
        status = 'degraded';
      }

      return {
        status,
        probes: { livez: this.state.livez, startupz: this.state.startupz, readyz: this.state.readyz },
        checks: checkResults,
      };
    },
    response: async (): Promise<Response> => {
      const result = await this.healthz.get();

      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}

export const probes = new HealthProbes();
