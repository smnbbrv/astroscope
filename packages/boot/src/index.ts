import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { ignoredSuffixes } from './ignored';

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
                    const bootModuleId = `/${entry}`;
                    const bootFilePath = path.resolve(server.config.root, entry);

                    // collect all transitive dependencies of the boot module
                    const getBootDependencies = (): Set<string> => {
                      const deps = new Set<string>();
                      const bootModules = server.moduleGraph.getModulesByFile(bootFilePath);
                      const bootModule = bootModules ? [...bootModules][0] : undefined;

                      if (!bootModule) return deps;

                      const collectDeps = (mod: typeof bootModule, visited = new Set<string>()): void => {
                        if (!mod?.file || visited.has(mod.file)) return;

                        visited.add(mod.file);
                        deps.add(mod.file);

                        for (const imported of mod.importedModules) {
                          collectDeps(imported, visited);
                        }
                      };

                      collectDeps(bootModule);

                      return deps;
                    };

                    const rerunBoot = async (changedFile: string) => {
                      logger.info(`boot dependency changed: ${changedFile}, rerunning hooks...`);

                      try {
                        // call onShutdown first to cleanup resources
                        const oldModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

                        if (oldModule.onShutdown) {
                          await oldModule.onShutdown();
                        }

                        // invalidate the module graph to reload fresh code
                        server.moduleGraph.invalidateAll();

                        // reload and run onStartup
                        const newModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

                        if (newModule.onStartup) {
                          await newModule.onStartup();
                        }
                      } catch (error) {
                        logger.error(`Error during boot HMR: ${error}`);
                      }
                    };

                    const shouldIgnore = (filePath: string): boolean => {
                      const path = filePath.toLowerCase();

                      return ignoredSuffixes.some((suffix) => path.endsWith(suffix));
                    };

                    server.watcher.on('change', async (changedPath) => {
                      // skip static assets and non-runtime files
                      if (shouldIgnore(changedPath)) return;

                      // check if the changed file is the boot file or one of its dependencies
                      const bootDeps = getBootDependencies();

                      if (bootDeps.has(changedPath)) {
                        await rerunBoot(changedPath);
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
                  if (!isSSR) return;

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

                  // use namespace import to avoid errors when some of hooks are not exported
                  const bootImport = `import * as __boot from './${bootChunkName}';\nawait __boot.onStartup?.();\nif (__boot.onShutdown) process.on('SIGTERM', async () => { await __boot.onShutdown(); process.exit(0); });\n`;

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
