import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { RECOMMENDED_EXCLUDES } from './excludes.js';
import type { ExcludePattern } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:@astroscope/opentelemetry/config';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

/**
 * Serialize exclude patterns to JavaScript code.
 * Handles RegExp objects which JSON.stringify cannot serialize.
 */
function serializeExcludePatterns(patterns: ExcludePattern[]): string {
  return `[${patterns.map((p) => ('pattern' in p ? `{ pattern: ${p.pattern.toString()} }` : JSON.stringify(p))).join(', ')}]`;
}

export interface OpenTelemetryIntegrationOptions {
  /**
   * Configure instrumentations.
   */
  instrumentations?: {
    /**
     * HTTP incoming request instrumentation (middleware).
     * @default { enabled: true, exclude: RECOMMENDED_EXCLUDES }
     */
    http?: {
      enabled: boolean;
      exclude?: ExcludePattern[];
    };
    /**
     * Fetch outgoing request instrumentation.
     * @default { enabled: true }
     */
    fetch?: {
      enabled: boolean;
    };
  };
}

/**
 * Astro integration for OpenTelemetry instrumentation.
 *
 * This integration automatically:
 * - Instruments incoming HTTP requests via middleware
 * - Instruments outgoing fetch requests
 *
 * @example
 * ```ts
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import { opentelemetry } from "@astroscope/opentelemetry";
 *
 * export default defineConfig({
 *   integrations: [opentelemetry()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Disable fetch instrumentation
 * opentelemetry({
 *   instrumentations: {
 *     fetch: { enabled: false }
 *   }
 * })
 * ```
 *
 * @example
 * ```ts
 * // Custom HTTP excludes
 * opentelemetry({
 *   instrumentations: {
 *     http: {
 *       enabled: true,
 *       exclude: [
 *         ...RECOMMENDED_EXCLUDES,
 *         { exact: "/health" }
 *       ]
 *     }
 *   }
 * })
 * ```
 */
export function opentelemetry(options: OpenTelemetryIntegrationOptions = {}): AstroIntegration {
  const httpConfig = options.instrumentations?.http ?? {
    enabled: true,
    exclude: RECOMMENDED_EXCLUDES,
  };
  const fetchConfig = options.instrumentations?.fetch ?? { enabled: true };
  const httpExclude = httpConfig.exclude ?? (httpConfig.enabled ? RECOMMENDED_EXCLUDES : []);

  let isBuild = false;
  let isSSR = false;

  return {
    name: '@astroscope/opentelemetry',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, logger, addMiddleware }) => {
        isBuild = command === 'build';

        if (httpConfig.enabled) {
          addMiddleware({
            entrypoint: '@astroscope/opentelemetry/middleware',
            order: 'pre',
          });
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/opentelemetry/virtual',
                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) {
                    return RESOLVED_VIRTUAL_MODULE_ID;
                  }
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    return `export const excludePatterns = ${serializeExcludePatterns(httpExclude)};`;
                  }
                },
              },
              ...(fetchConfig.enabled
                ? [
                    {
                      name: '@astroscope/opentelemetry/fetch',
                      configureServer(server: any) {
                        if (isBuild) return;

                        server.httpServer?.once('listening', async () => {
                          try {
                            const { instrumentFetch } = await import('./fetch.js');
                            instrumentFetch();
                            logger.info('fetch instrumentation enabled');
                          } catch (error) {
                            logger.error(`Error instrumenting fetch: ${error}`);
                          }
                        });
                      },
                      configResolved(config: any) {
                        isSSR = !!config.build?.ssr;
                      },
                      writeBundle(outputOptions: any) {
                        if (!isSSR) return;

                        const outDir = outputOptions.dir;

                        if (!outDir) return;

                        const entryPath = path.join(outDir, 'entry.mjs');

                        if (!fs.existsSync(entryPath)) return;

                        const content = fs.readFileSync(entryPath, 'utf-8');

                        fs.writeFileSync(
                          entryPath,
                          `import { instrumentFetch } from '@astroscope/opentelemetry';\ninstrumentFetch();\n${content}`,
                        );

                        logger.info('injected fetch instrumentation into entry.mjs');
                      },
                    },
                  ]
                : []),
            ],
          },
        });
      },
    },
  };
}
