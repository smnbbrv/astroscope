import { RECOMMENDED_EXCLUDES, serializeExcludePatterns } from '@astroscope/excludes';
import type { AstroIntegration } from 'astro';
import type { PinoIntegrationOptions } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:@astroscope/pino/config';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

/**
 * Astro integration for Pino HTTP logging.
 *
 * @example
 * ```ts
 * // astro.config.ts
 * import { defineConfig } from 'astro/config';
 * import pino from '@astroscope/pino';
 *
 * export default defineConfig({
 *   integrations: [pino()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Custom excludes (replaces RECOMMENDED_EXCLUDES)
 * import { RECOMMENDED_EXCLUDES } from '@astroscope/excludes';
 *
 * pino({
 *   exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }],
 * })
 * ```
 */
export default function pino(options: PinoIntegrationOptions = {}): AstroIntegration {
  const excludePatterns = options.exclude ?? RECOMMENDED_EXCLUDES;
  const extended = options.extended ?? false;

  return {
    name: '@astroscope/pino',
    hooks: {
      'astro:config:setup': ({ addMiddleware, updateConfig }) => {
        addMiddleware({
          entrypoint: '@astroscope/pino/middleware',
          order: 'pre',
        });

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/pino/virtual-config',
                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) {
                    return RESOLVED_VIRTUAL_MODULE_ID;
                  }
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    return [
                      `export const exclude = ${serializeExcludePatterns(excludePatterns)};`,
                      `export const extended = ${JSON.stringify(extended)};`,
                    ].join('\n');
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
