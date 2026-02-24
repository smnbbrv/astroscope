import type { AstroIntegration } from 'astro';
import type { ProbePaths } from 'health-probes';
import MagicString from 'magic-string';
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
      'astro:config:setup': ({ config, command, updateConfig }) => {
        const bootIndex = config.integrations.findIndex((i) => i.name === '@astroscope/boot');
        const healthIndex = config.integrations.findIndex((i) => i.name === '@astroscope/health');

        if (bootIndex === -1) {
          throw new Error(
            '@astroscope/health requires @astroscope/boot. Add boot() before health() in your integrations array.',
          );
        }

        if (healthIndex !== -1 && bootIndex > healthIndex) {
          throw new Error(
            '@astroscope/health must come after @astroscope/boot. Swap the order in your integrations array.',
          );
        }

        const isBuild = command === 'build';

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/health',

                configureServer() {
                  if (!enableDev) return;

                  registerHealth(serverOptions);
                },

                generateBundle(_, bundle) {
                  if (!isBuild) return;

                  const entryChunk = bundle['entry.mjs'];

                  if (!entryChunk || entryChunk.type !== 'chunk') return;

                  const s = new MagicString(entryChunk.code);

                  s.prepend(
                    `import { registerHealth as __astroscope_registerHealth } from '@astroscope/health/setup';\n` +
                      `__astroscope_registerHealth(${JSON.stringify(serverOptions)});\n`,
                  );

                  entryChunk.code = s.toString();

                  if (entryChunk.map) {
                    entryChunk.map = s.generateMap({ hires: true }) as typeof entryChunk.map;
                  }
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
