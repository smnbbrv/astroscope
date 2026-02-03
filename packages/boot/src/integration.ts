import fs from 'node:fs';
import path from 'node:path';
import type { AstroConfig, AstroIntegration } from 'astro';
import MagicString from 'magic-string';
import { ignoredSuffixes } from './ignored.js';
import type { BootContext } from './types.js';

export interface BootOptions {
  /**
   * Path to the boot file relative to the project root.
   * @default "src/boot.ts"
   */
  entry?: string | undefined;
  /**
   * Enable HMR for the boot file. When true, `onStartup` will re-run when the boot file changes.
   * @default false
   */
  hmr?: boolean | undefined;
}

interface BootModule {
  onStartup?: ((context: BootContext) => Promise<void> | void) | undefined;
  onShutdown?: ((context: BootContext) => Promise<void> | void) | undefined;
}

function resolveEntry(entry: string | undefined): string {
  if (entry) return entry;

  if (fs.existsSync('src/boot/index.ts')) return 'src/boot/index.ts';

  return 'src/boot.ts';
}

const WARMUP_MANIFEST_FILE = 'warmup-manifest.json';

export function getServerDefaults(config: AstroConfig | null): { host: string; port: number } {
  return {
    host:
      typeof config?.server?.host === 'string'
        ? config.server.host
        : config?.server?.host === true
          ? '0.0.0.0'
          : 'localhost',
    port: config?.server?.port ?? 4321,
  };
}

/**
 * Astro integration for application lifecycle hooks.
 *
 * Runs `onStartup` and `onShutdown` functions exported from your boot file
 * during server startup and shutdown.
 */
export default function boot(options: BootOptions = {}): AstroIntegration {
  const entry = resolveEntry(options.entry);
  const hmr = options.hmr ?? false;

  let isBuild = false;
  let isSSR = false;
  let bootChunkRef: string | null = null;
  let astroConfig: AstroConfig | null = null;

  // collected during generateBundle for warmup module
  let pageModules: string[] = [];
  let middlewarePath: string | null = null;

  return {
    name: '@astroscope/boot',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, logger, config }) => {
        isBuild = command === 'build';
        astroConfig = config;

        updateConfig({
          vite: {
            plugins: [
              {
                name: '@astroscope/boot',
                enforce: 'pre',

                configureServer(server) {
                  if (isBuild) return;

                  const getBootContext = (): BootContext => {
                    const addr = server.httpServer?.address();

                    if (addr && typeof addr === 'object') {
                      const host = addr.address === '::' || addr.address === '0.0.0.0' ? 'localhost' : addr.address;

                      return { dev: true, host, port: addr.port };
                    }

                    // fallback to config defaults (with env var override)
                    const defaults = getServerDefaults(astroConfig);
                    const host = process.env['HOST'] ?? defaults.host;
                    const port = process.env['PORT'] ? Number(process.env['PORT']) : defaults.port;

                    return { dev: true, host, port };
                  };

                  server.httpServer?.once('listening', async () => {
                    try {
                      const bootContext = getBootContext();
                      const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                      await module.onStartup?.(bootContext);
                    } catch (error) {
                      logger.error(`Error running startup script: ${error}`);
                    }
                  });

                  server.httpServer?.once('close', async () => {
                    try {
                      const bootContext = getBootContext();
                      const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                      await module.onShutdown?.(bootContext);
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
                        const bootContext = getBootContext();

                        // call onShutdown first to cleanup resources
                        const oldModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

                        await oldModule.onShutdown?.(bootContext);

                        // invalidate the module graph to reload fresh code
                        server.moduleGraph.invalidateAll();

                        // reload and run onStartup
                        const newModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

                        await newModule.onStartup?.(bootContext);
                      } catch (error) {
                        logger.error(`Error during boot HMR: ${error}`);
                      }
                    };

                    const shouldIgnore = (filePath: string): boolean => {
                      const p = filePath.toLowerCase();

                      return ignoredSuffixes.some((suffix) => p.endsWith(suffix));
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
                    bootChunkRef = this.emitFile({ type: 'chunk', id: entry, name: 'boot' });
                  } catch {
                    // not available in serve mode
                  }
                },

                generateBundle(_, bundle) {
                  if (!isSSR || !bootChunkRef) return;

                  const bootChunkName = this.getFileName(bootChunkRef);

                  if (!bootChunkName) {
                    logger.warn('boot chunk not found');

                    return;
                  }

                  // find entry.mjs chunk
                  const entryChunk = bundle['entry.mjs'];

                  if (!entryChunk || entryChunk.type !== 'chunk') {
                    logger.warn('entry.mjs not found - boot injection skipped');

                    return;
                  }

                  // collect page modules and middleware for warmup
                  pageModules = [];
                  middlewarePath = null;

                  for (const [fileName, chunk] of Object.entries(bundle)) {
                    if (chunk.type !== 'chunk') continue;

                    // collect page modules
                    if (fileName.startsWith('pages/') && fileName.endsWith('.mjs')) {
                      pageModules.push(fileName);
                    }

                    // find middleware (both real and noop)
                    if (fileName.includes('_astro-internal_middleware') || fileName.includes('_noop-middleware')) {
                      middlewarePath = fileName;
                    }
                  }

                  // get host/port defaults from astro config
                  const { host, port } = getServerDefaults(astroConfig);

                  // inject boot with inline context creation (env vars take precedence at runtime)
                  const bootImport =
                    `import * as __boot from './${bootChunkName}';\n` +
                    `const __bootContext = { dev: false, host: process.env.HOST ?? '${host}', port: process.env.PORT ? Number(process.env.PORT) : ${port} };\n` +
                    `await __boot.onStartup?.(__bootContext);\n` +
                    `if (__boot.onShutdown) process.on('SIGTERM', async () => { await __boot.onShutdown(__bootContext); process.exit(0); });\n`;

                  // inject boot import at start of entry.mjs preserving source maps
                  const s = new MagicString(entryChunk.code);

                  s.prepend(bootImport);
                  entryChunk.code = s.toString();

                  if (entryChunk.map) {
                    entryChunk.map = s.generateMap({ hires: true }) as typeof entryChunk.map;
                  }

                  logger.info(`injected ${bootChunkName} into entry.mjs`);
                },

                writeBundle(outputOptions) {
                  if (!isSSR) return;

                  const outDir = outputOptions.dir;

                  if (!outDir) return;

                  // build module paths for warmup manifest
                  const modules: string[] = [];

                  if (middlewarePath) {
                    modules.push(`./${middlewarePath}`);
                  }

                  for (const page of pageModules) {
                    modules.push(`./${page}`);
                  }

                  // write warmup manifest JSON (read by warmup module at runtime)
                  const manifestPath = path.join(outDir, 'chunks', WARMUP_MANIFEST_FILE);

                  fs.writeFileSync(manifestPath, JSON.stringify({ modules }));

                  logger.info(`generated warmup for ${pageModules.length} pages`);
                },
              },
            ],
          },
        });
      },
    },
  };
}
