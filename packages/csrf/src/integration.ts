import { serializeExcludePatterns } from '@astroscope/excludes';
import type { AstroIntegration } from 'astro';
import type { CsrfOptions } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:@astroscope/csrf/config';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

/**
 * Astro integration for CSRF protection.
 *
 * Automatically:
 * - Adds CSRF protection middleware
 * - Disables Astro's built-in `security.checkOrigin`
 *
 * Origin validation compares the request's Origin header against context.url.origin.
 * Configure `security.allowedDomains` in your Astro config to ensure context.url is correct.
 *
 * @example
 * ```ts
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import csrf from "@astroscope/csrf";
 *
 * export default defineConfig({
 *   security: {
 *     allowedDomains: [{}], // trust all domains (e.g. behind a proxy)
 *   },
 *   integrations: [
 *     csrf(),
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * // with exclusions
 * csrf({
 *   exclude: [{ prefix: '/webhook/' }, { exact: '/api/health' }],
 * })
 * ```
 *
 * @example
 * ```ts
 * // disable in development
 * csrf({ enabled: import.meta.env.PROD })
 * ```
 */
export default function csrf(options: CsrfOptions = {}): AstroIntegration {
  const enabled = options.enabled ?? true;
  const excludePatterns = Array.isArray(options.exclude) ? options.exclude : [];

  return {
    name: '@astroscope/csrf',
    hooks: {
      'astro:config:setup': ({ updateConfig, logger, addMiddleware }) => {
        updateConfig({
          security: {
            checkOrigin: false,
          },
        });

        logger.info('disabled built-in checkOrigin');

        if (enabled) {
          addMiddleware({ order: 'pre', entrypoint: '@astroscope/csrf/middleware' });
        } else {
          logger.info('CSRF protection disabled');
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/csrf/virtual',
                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) {
                    return RESOLVED_VIRTUAL_MODULE_ID;
                  }
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    return [
                      `export const enabled = ${enabled};`,
                      `export const excludePatterns = ${serializeExcludePatterns(excludePatterns)};`,
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
