import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroConfig, AstroIntegration } from 'astro';
import MagicString from 'magic-string';
import { perEnvironmentState } from 'vite';
import { setupBootHmr } from './hmr.js';
import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import { getPrependCode } from './prepend.js';
import type { BootContext } from './types.js';
import { serializeError } from './utils.js';
import { ssrImport } from './vite-env.js';
import {
  RESOLVED_VIRTUAL_MODULE_ID,
  VIRTUAL_MODULE_ID,
  WARMUP_MODULES,
  generateWarmupCode,
  resolveWarmupFiles,
} from './warmup.js';

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
  /**
   * Pre-import all page modules and middleware on startup to eliminate cold-start latency.
   *
   * - `true` — warmup using default glob patterns ({@link WARMUP_MODULES})
   * - `string[]` — additional glob patterns to warmup on top of the defaults
   *
   * @default false
   */
  warmup?: boolean | string[] | undefined;
}

function resolveEntry(entry: string | undefined): string {
  if (entry) return entry;

  if (fs.existsSync('src/boot/index.ts')) return 'src/boot/index.ts';

  return 'src/boot.ts';
}

/**
 * Resolve the default host and port from the Astro server config.
 * Falls back to `localhost:4321` when no config is provided.
 */
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
 * Build a dev-mode boot context from the running server's address,
 * falling back to Astro config defaults if the server isn't listening yet.
 */
function getBootContext(
  server: { httpServer?: { address(): unknown } | null | undefined },
  config: AstroConfig | null,
): BootContext {
  const addr = server.httpServer?.address();

  if (addr && typeof addr === 'object' && 'address' in addr && 'port' in addr) {
    const host =
      (addr as { address: string }).address === '::' || (addr as { address: string }).address === '0.0.0.0'
        ? 'localhost'
        : (addr as { address: string }).address;

    return { dev: true, host, port: (addr as { port: number }).port };
  }

  const { host, port } = getServerDefaults(config);

  return { dev: true, host, port };
}

function resolveWarmupPatterns(warmup: boolean | string[] | undefined): string[] | null {
  if (!warmup) return null;

  if (Array.isArray(warmup)) {
    return [...WARMUP_MODULES, ...warmup];
  }

  return WARMUP_MODULES;
}

interface BuildState {
  bootChunkRef: string | null;
  warmupChunkRef: string | null;
}

const getState = perEnvironmentState<BuildState>(() => ({ bootChunkRef: null, warmupChunkRef: null }));

/**
 * Astro integration for application lifecycle hooks.
 *
 * Runs `onStartup` and `onShutdown` functions exported from your boot file
 * during server startup and shutdown.
 */
export default function boot(options: BootOptions = {}): AstroIntegration {
  const entry = resolveEntry(options.entry);
  const hmr = options.hmr ?? false;
  const warmupPatterns = resolveWarmupPatterns(options.warmup);

  let astroConfig: AstroConfig | null = null;
  let warmupCode: string | null = null;

  return {
    name: '@astroscope/boot',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, logger, config }) => {
        astroConfig = config;

        updateConfig({
          vite: {
            plugins: [
              // build plugin: handles entry.mjs injection and warmup virtual module
              {
                name: '@astroscope/boot',

                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
                },

                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) return warmupCode ?? '';
                },

                async buildStart() {
                  if (this.environment.name !== 'ssr') return;

                  const state = getState(this);

                  try {
                    state.bootChunkRef = this.emitFile({ type: 'chunk', id: entry, name: 'boot' });
                  } catch {
                    // not available in serve mode
                  }

                  if (warmupPatterns) {
                    const projectRoot = astroConfig?.root ? fileURLToPath(astroConfig.root) : process.cwd();
                    const files = await resolveWarmupFiles(warmupPatterns, projectRoot);

                    warmupCode = generateWarmupCode(files);

                    if (files.length > 0) {
                      try {
                        state.warmupChunkRef = this.emitFile({
                          type: 'chunk',
                          id: VIRTUAL_MODULE_ID,
                          name: 'warmup',
                        });
                      } catch {
                        // not available in serve mode
                      }

                      logger.info(`warmup: ${files.length} files`);
                    }
                  }
                },

                generateBundle(_, bundle) {
                  const state = getState(this);

                  if (!state.bootChunkRef) return;

                  const bootChunkName = this.getFileName(state.bootChunkRef);

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

                  const { host, port } = getServerDefaults(astroConfig);

                  const prependCode = getPrependCode();
                  const prefix = prependCode.length ? `${prependCode.join('\n')}\n` : '';

                  let warmupStart = '';
                  let warmupEnd = '';

                  if (state.warmupChunkRef) {
                    const warmupChunkName = this.getFileName(state.warmupChunkRef);

                    if (warmupChunkName) {
                      warmupStart = `const __astroscope_warmup = import('./${warmupChunkName}');\n`;
                      warmupEnd = `await __astroscope_warmup;\n`;
                    }
                  }

                  const setupConfig = JSON.stringify({ host, port });

                  const injection =
                    `${prefix}${warmupStart}` +
                    `import * as __astroscope_boot from './${bootChunkName}';\n` +
                    `import { setup as __astroscope_bootSetup } from '@astroscope/boot/setup';\n` +
                    `await __astroscope_bootSetup(__astroscope_boot, ${setupConfig});\n${warmupEnd}`;

                  // inject at start of entry.mjs preserving source maps
                  const s = new MagicString(entryChunk.code);

                  s.prepend(injection);

                  entryChunk.code = s.toString();

                  if (entryChunk.map) {
                    entryChunk.map = s.generateMap({ hires: true }) as typeof entryChunk.map;
                  }

                  logger.info(`injected ${bootChunkName} into entry.mjs`);
                },
              },

              // startup plugin: runs after all other configureServer hooks
              {
                name: '@astroscope/boot/startup',
                enforce: 'post',

                async configureServer(server) {
                  if (command !== 'dev') return; // skip in build / sync modes (Astro uses 'sync' for 'astro check' command)

                  try {
                    const bootContext = getBootContext(server, astroConfig);
                    const module = await ssrImport<BootModule>(server, `/${entry}`);

                    await runStartup(module, bootContext);
                  } catch (error) {
                    logger.error(`Error running startup script: ${serializeError(error)}`);
                  }

                  server.httpServer?.once('close', async () => {
                    try {
                      const bootContext = getBootContext(server, astroConfig);
                      const module = await ssrImport<BootModule>(server, `/${entry}`);

                      await runShutdown(module, bootContext);
                    } catch (error) {
                      logger.error(`Error running shutdown script: ${serializeError(error)}`);
                    }
                  });

                  if (hmr) {
                    setupBootHmr(server, entry, logger, () => getBootContext(server, astroConfig));
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
