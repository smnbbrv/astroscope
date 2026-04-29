import type { EventEmitter } from 'node:events';
import path from 'node:path';
import type { HotPayload, ViteDevServer } from 'vite';
import { ignoredSuffixes } from './ignored.js';
import type { RestartScheduler } from './scheduler.js';
import { getAstroHotEnv } from './vite-env.js';

export function setupBootWatch(server: ViteDevServer, entry: string, scheduler: RestartScheduler): void {
  const bootFilePath = path.resolve(server.config.root, entry);

  const runnableEnv = getAstroHotEnv(server);
  const bootModuleGraph = runnableEnv?.moduleGraph;

  const collectBootDependencies = (): Set<string> => {
    const deps = new Set<string>();
    const bootModules = bootModuleGraph?.getModulesByFile(bootFilePath);
    const bootModule = bootModules ? [...bootModules][0] : undefined;

    if (!bootModule) return deps;

    const visit = (mod: typeof bootModule, seen = new Set<string>()): void => {
      if (!mod?.file || seen.has(mod.file)) return;

      seen.add(mod.file);
      deps.add(mod.file);

      for (const imp of mod.importedModules) visit(imp, seen);
    };

    visit(bootModule);

    return deps;
  };

  const shouldIgnore = (filePath: string): boolean => {
    const p = filePath.toLowerCase();

    return ignoredSuffixes.some((suffix) => p.endsWith(suffix));
  };

  const onWatcherEvent = (changedPath: string): void => {
    if (shouldIgnore(changedPath)) return;

    const bootDeps = collectBootDependencies();

    if (!bootDeps.has(changedPath)) return;

    scheduler.schedule(server, changedPath);
  };

  server.watcher.on('change', onWatcherEvent);
  server.watcher.on('add', onWatcherEvent);
  server.watcher.on('unlink', onWatcherEvent);

  // ignore full-reloads emitted during server startup (dep optimization, port retries).
  let handleFullReloads = false;

  if (server.httpServer) {
    server.httpServer.once('listening', () => {
      handleFullReloads = true;
    });
  } else {
    // middleware mode — no httpServer, enable immediately
    handleFullReloads = true;
  }

  // SSR full-reloads come through the runnable env's hot channel and clear
  // its module runner's cache — onStartup needs to run again on a fresh server.
  const outsideEmitter = (runnableEnv?.hot as { api?: { outsideEmitter?: EventEmitter } } | undefined)?.api
    ?.outsideEmitter;

  if (outsideEmitter) {
    outsideEmitter.on('send', (payload: HotPayload) => {
      if (!handleFullReloads) return;
      if (payload.type !== 'full-reload') return;

      const triggeredBy = 'triggeredBy' in payload ? (payload.triggeredBy as string) : undefined;

      scheduler.scheduleFullReload(server, triggeredBy);
    });
  }

  // hold incoming requests while a restart is running so they don't hit
  // half-initialized boot state. dev-internal paths bypass to keep HMR flowing.
  server.middlewares.use(async (req, _res, next) => {
    if (isDevInternalPath(req.url)) {
      next();

      return;
    }

    await scheduler.waitForRestart();

    next();
  });
}

function isDevInternalPath(url: string | undefined): boolean {
  if (!url) return false;

  return url.startsWith('/@') || url.startsWith('/__') || url.includes('/node_modules/');
}
