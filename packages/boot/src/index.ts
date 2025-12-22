import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';

export interface BootOptions {
  /**
   * Path to the boot file relative to the project root.
   * @default "src/boot.ts"
   */
  entry?: string;
  /**
   * Enable HMR for the boot file. When true, `onStartup` will re-run when the boot file changes.
   * @default false
   */
  hmr?: boolean;
}

interface BootModule {
  onStartup?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
}

function resolveEntry(entry: string | undefined): string {
  if (entry) return entry;

  if (fs.existsSync('src/boot.ts')) return 'src/boot.ts';
  if (fs.existsSync('src/boot/index.ts')) return 'src/boot/index.ts';

  return 'src/boot.ts';
}

/**
 * Astro integration for application lifecycle hooks.
 *
 * Runs `onStartup` and `onShutdown` functions exported from your boot file
 * during server startup and shutdown.
 *
 * @example
 * ```ts
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import boot from "@astroscope/boot";
 *
 * export default defineConfig({
 *   integrations: [boot()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // src/boot.ts
 * export async function onStartup() {
 *   console.log("Server starting...");
 * }
 *
 * export async function onShutdown() {
 *   console.log("Server shutting down...");
 * }
 * ```
 */
export default function boot(options: BootOptions = {}): AstroIntegration {
  const entry = resolveEntry(options.entry);
  const hmr = options.hmr ?? false;

  let isBuild = false;
  let isSSR = false;
  let bootChunkRef: string | null = null;

  return {
    name: '@astroscope/boot',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, logger }) => {
        isBuild = command === 'build';

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/boot',
                configureServer(server) {
                  if (isBuild) return;

                  server.httpServer?.once('listening', async () => {
                    try {
                      const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                      if (module.onStartup) {
                        await module.onStartup();
                      }
                    } catch (error) {
                      logger.error(`Error running startup script: ${error}`);
                    }
                  });

                  server.httpServer?.once('close', async () => {
                    try {
                      const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                      if (module.onShutdown) {
                        await module.onShutdown();
                      }
                    } catch (error) {
                      logger.error(`Error running shutdown script: ${error}`);
                    }
                  });

                  if (hmr) {
                    server.watcher.on('change', async (changedPath) => {
                      if (!changedPath.endsWith(entry)) return;

                      logger.info('boot file changed, re-running onStartup...');
                      try {
                        server.moduleGraph.invalidateAll();
                        const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                        if (module.onStartup) {
                          await module.onStartup();
                        }
                      } catch (error) {
                        logger.error(`Error running startup script: ${error}`);
                      }
                    });
                  }
                },
                configResolved(config) {
                  isSSR = !!config.build?.ssr;
                },
                buildStart() {
                  if (!isSSR) return;

                  try {
                    bootChunkRef = this.emitFile({
                      type: 'chunk',
                      id: entry,
                      name: 'boot',
                    });
                  } catch {
                    // not available in serve mode
                  }
                },
                writeBundle(outputOptions) {
                  const outDir = outputOptions.dir;

                  if (!outDir || !bootChunkRef) return;

                  const entryPath = path.join(outDir, 'entry.mjs');

                  if (!fs.existsSync(entryPath)) {
                    logger.warn('entry.mjs not found - boot injection skipped');
                    return;
                  }

                  const bootChunkName = this.getFileName(bootChunkRef);

                  if (!bootChunkName) {
                    logger.warn('boot chunk not found');

                    return;
                  }

                  const sourcemapPath = `${entryPath}.map`;

                  if (fs.existsSync(sourcemapPath)) {
                    logger.warn(
                      'sourcemap detected for entry.mjs - line numbers may be off by 2 lines due to boot injection',
                    );
                  }

                  let content = fs.readFileSync(entryPath, 'utf-8');

                  const bootImport = `import { onStartup, onShutdown } from './${bootChunkName}';\nawait onStartup?.();\nif (onShutdown) process.on('SIGTERM', async () => { await onShutdown(); process.exit(0); });\n`;

                  content = bootImport + content;

                  fs.writeFileSync(entryPath, content);

                  logger.info(`injected ${bootChunkName} into entry.mjs`);
                },
              },
            ],
          },
        });
      },
    },
  };
}
