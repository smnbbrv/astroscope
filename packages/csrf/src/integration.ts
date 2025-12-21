import type { AstroIntegration } from "astro";
import type { CsrfIntegrationOptions, ExcludePattern } from "./types.js";

const VIRTUAL_MODULE_ID = "virtual:@astroscope/csrf/config";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

/**
 * Serialize exclude patterns to JavaScript code.
 * Handles RegExp objects which JSON.stringify cannot serialize.
 */
function serializeExcludePatterns(patterns: ExcludePattern[]): string {
  const items = patterns.map((p) => {
    if ("pattern" in p) {
      return `{ pattern: ${p.pattern.toString()} }`;
    } else if ("prefix" in p) {
      return `{ prefix: ${JSON.stringify(p.prefix)} }`;
    } else {
      return `{ exact: ${JSON.stringify(p.exact)} }`;
    }
  });
  return `[${items.join(", ")}]`;
}

/**
 * Astro integration for CSRF protection.
 *
 * Automatically:
 * - Adds CSRF protection middleware
 * - Disables Astro's built-in `security.checkOrigin`
 *
 * @example
 * ```ts
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import { csrf } from "@astroscope/csrf";
 *
 * export default defineConfig({
 *   integrations: [
 *     csrf({ trustProxy: true }),
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * // With explicit origins and exclusions
 * csrf({
 *   origin: ['https://example.com', 'https://staging.example.com'],
 *   exclude: [{ prefix: '/webhook/' }, { exact: '/api/health' }],
 * })
 * ```
 *
 * @example
 * ```ts
 * // Disable in development
 * csrf({
 *   enabled: import.meta.env.PROD,
 *   trustProxy: true,
 * })
 * ```
 */
export function csrf(options: CsrfIntegrationOptions): AstroIntegration {
  const enabled = options.enabled ?? true;
  const excludePatterns = Array.isArray(options.exclude)
    ? options.exclude
    : [];
  const trustProxy = "trustProxy" in options;
  const origins = "origin" in options ? options.origin : null;

  return {
    name: "@astroscope/csrf",
    hooks: {
      "astro:config:setup": ({ updateConfig, logger, addMiddleware }) => {
        // Disable Astro's built-in checkOrigin since we're handling it
        updateConfig({
          security: {
            checkOrigin: false,
          },
        });
        logger.info("disabled built-in checkOrigin");

        // Add middleware if enabled
        if (enabled) {
          addMiddleware({
            entrypoint: "@astroscope/csrf/middleware",
            order: "pre",
          });
        } else {
          logger.info("CSRF protection disabled");
        }

        // Add virtual module for config
        updateConfig({
          vite: {
            plugins: [
              {
                name: "@astroscope/csrf/virtual",
                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) {
                    return RESOLVED_VIRTUAL_MODULE_ID;
                  }
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    const lines = [
                      `export const enabled = ${enabled};`,
                      `export const excludePatterns = ${serializeExcludePatterns(excludePatterns)};`,
                      `export const trustProxy = ${trustProxy};`,
                      `export const origins = ${origins ? JSON.stringify(Array.isArray(origins) ? origins : [origins]) : "null"};`,
                    ];
                    return lines.join("\n");
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
