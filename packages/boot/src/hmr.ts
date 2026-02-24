import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { ignoredSuffixes } from './ignored.js';
import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import type { BootContext } from './types.js';

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

  server.watcher.on('change', async (changedPath) => {
    // skip static assets and non-runtime files
    if (shouldIgnore(changedPath)) return;

    // check if the changed file is the boot file or one of its dependencies
    const bootDeps = getBootDependencies();

    if (bootDeps.has(changedPath)) {
      logger.info(`boot dependency changed: ${changedPath}, rerunning hooks...`);

      const bootContext = getBootContext();

      try {
        const oldModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

        await runShutdown(oldModule, bootContext);
      } catch (error) {
        logger.error(`Error during boot HMR shutdown: ${error}`);
      }

      // invalidate the module graph to reload fresh code
      server.moduleGraph.invalidateAll();

      try {
        const newModule = (await server.ssrLoadModule(bootModuleId)) as BootModule;

        await runStartup(newModule, bootContext);
      } catch (error) {
        logger.error(`Error during boot HMR startup: ${error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)}`);
      }
    }
  });
}
