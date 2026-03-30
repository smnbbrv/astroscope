import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { ignoredSuffixes } from './ignored.js';
import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import type { BootContext } from './types.js';
import { serializeError } from './utils.js';
import { ssrImport } from './vite-env.js';

export function setupBootHmr(
  server: ViteDevServer,
  entry: string,
  logger: { info(msg: string): void; error(msg: string): void },
  getBootContext: () => BootContext,
): void {
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

  const shouldIgnore = (filePath: string): boolean => {
    const p = filePath.toLowerCase();

    return ignoredSuffixes.some((suffix) => p.endsWith(suffix));
  };

  // "latest wins" rerun: if a rerun is in progress, queue exactly one follow-up
  // so that the last event in a burst always triggers a fresh restart
  let running = false;
  let pendingReason: string | undefined;

  const rerunBoot = async (reason: string): Promise<void> => {
    if (running) {
      pendingReason = reason;

      return;
    }

    running = true;

    try {
      logger.info(`${reason}, rerunning hooks...`);

      const bootContext = getBootContext();

      try {
        const oldModule = await ssrImport<BootModule>(server, bootModuleId);

        await runShutdown(oldModule, bootContext);
      } catch (error) {
        logger.error(`Error during boot HMR shutdown: ${serializeError(error)}`);
      }

      // invalidate the module graph to reload fresh code
      server.moduleGraph.invalidateAll();

      try {
        const newModule = await ssrImport<BootModule>(server, bootModuleId);

        await runStartup(newModule, bootContext);
      } catch (error) {
        logger.error(`Error during boot HMR startup: ${serializeError(error)}`);
      }
    } finally {
      running = false;
    }

    // if events arrived while we were running, do one more pass with the latest reason
    if (pendingReason) {
      const nextReason = pendingReason;

      pendingReason = undefined;

      await rerunBoot(nextReason);
    }
  };

  server.watcher.on('change', async (changedPath) => {
    // skip static assets and non-runtime files
    if (shouldIgnore(changedPath)) return;

    // check if the changed file is the boot file or one of its dependencies
    const bootDeps = getBootDependencies();

    if (bootDeps.has(changedPath)) {
      await rerunBoot(`boot dependency changed: ${changedPath}`);
    }
  });

  // handle Vite's full program reload (triggered by non-boot file changes)
  // when Vite does a full reload, all modules get re-evaluated but boot hooks
  // don't re-run unless we explicitly handle it here
  server.hot.on('vite:beforeFullReload', async () => {
    await rerunBoot('full reload detected');
  });
}
