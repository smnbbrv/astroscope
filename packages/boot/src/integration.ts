import fs from 'node:fs';
import type { AstroConfig, AstroIntegration } from 'astro';
import MagicString from 'magic-string';
import { setupBootHmr } from './hmr.js';
import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import type { BootContext } from './types.js';
import { type WarmupModules, collectWarmupModules, writeWarmupManifest } from './warmup-manifest.js';

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

function resolveEntry(entry: string | undefined): string {
  if (entry) return entry;

  if (fs.existsSync('src/boot/index.ts')) return 'src/boot/index.ts';

  return 'src/boot.ts';
}

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

  let warmupModules: WarmupModules | null = null;

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

                async configureServer(server) {
                  if (isBuild) return;

                  const getBootContext = (): BootContext => {
                    const addr = server.httpServer?.address();

                    if (addr && typeof addr === 'object') {
                      const host = addr.address === '::' || addr.address === '0.0.0.0' ? 'localhost' : addr.address;

                      return { dev: true, host, port: addr.port };
                    }

                    const { host, port } = getServerDefaults(astroConfig);

                    return { dev: true, host, port };
                  };

                  // run startup immediately before the server starts listening
                  try {
                    const bootContext = getBootContext();
                    const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                    await runStartup(module, bootContext);
                  } catch (error) {
                    logger.error(`Error running startup script: ${error}`);
                  }

                  server.httpServer?.once('close', async () => {
                    try {
                      const bootContext = getBootContext();
                      const module = (await server.ssrLoadModule(`/${entry}`)) as BootModule;

                      await runShutdown(module, bootContext);
                    } catch (error) {
                      logger.error(`Error running shutdown script: ${error}`);
                    }
                  });

                  if (hmr) {
                    setupBootHmr(server, entry, logger, getBootContext);
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

                  warmupModules = collectWarmupModules(bundle);

                  const { host, port } = getServerDefaults(astroConfig);

                  const bootImport =
                    `globalThis.__astroscope_server_url = import.meta.url;\n` +
                    `import * as __astroscope_boot from './${bootChunkName}';\n` +
                    `import { setup as __astroscope_bootSetup } from '@astroscope/boot/setup';\n` +
                    `await __astroscope_bootSetup(__astroscope_boot, ${JSON.stringify({ host, port })});\n`;

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
                  if (!isSSR || !warmupModules) return;

                  const outDir = outputOptions.dir;

                  if (!outDir) return;

                  writeWarmupManifest(outDir, warmupModules, logger);
                },
              },
            ],
          },
        });
      },
    },
  };
}
