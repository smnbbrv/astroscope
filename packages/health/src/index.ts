import { prepend } from '@astroscope/boot/prepend';
import type { AstroIntegration } from 'astro';
import type { ProbePaths } from 'health-probes';
import { registerHealth } from './register.js';

export interface HealthOptions {
  /**
   * Host to bind the health server to.
   * @default '127.0.0.1'
   */
  host?: string | undefined;

  /**
   * Port to bind the health server to.
   * @default 9090
   */
  port?: number | undefined;

  /**
   * Custom paths for probe endpoints.
   * @default K8sPaths (from health-probes)
   */
  paths?: ProbePaths | undefined;

  /**
   * Enable health probes in dev mode.
   * By default, health probes only run in production.
   * @default false
   */
  dev?: boolean | undefined;
}

/**
 * Astro integration for Kubernetes-style health probes.
 *
 * Automatically starts a health probe server after `onStartup` and stops it before `onShutdown`.
 * Uses the `health-probes` package under the hood.
 *
 * Requires `@astroscope/boot` to be configured.
 */
export default function health(options: HealthOptions = {}): AstroIntegration {
  const enableDev = options.dev ?? false;

  const serverOptions = {
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 9090,
    ...(options.paths && { paths: options.paths }),
  };

  return {
    name: '@astroscope/health',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        if (!config.integrations.some((i) => i.name === '@astroscope/boot')) {
          throw new Error('@astroscope/health requires @astroscope/boot. Add boot() to your integrations array.');
        }

        // register health setup code to run before boot's startup in production builds
        prepend(
          `import { registerHealth as __astroscope_registerHealth } from '@astroscope/health/setup';\n` +
            `__astroscope_registerHealth(${JSON.stringify(serverOptions)});`,
        );

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/health',

                configureServer() {
                  if (!enableDev) return;

                  registerHealth(serverOptions);
                },
              },
            ],
          },
        });
      },
    },
  };
}

// re-export parts of health-probes for usage in user code
export { checks, K8sPaths, SimplePaths } from 'health-probes';
export type { HealthCheck, HealthCheckResult, ProbePaths } from 'health-probes';
