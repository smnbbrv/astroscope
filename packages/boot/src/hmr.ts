import type { EventEmitter } from 'node:events';
import path from 'node:path';
import type { HotPayload, ViteDevServer } from 'vite';
import { ignoredSuffixes } from './ignored.js';
import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import type { BootContext } from './types.js';
import { serializeError } from './utils.js';
import { getAstroHotEnv, ssrImport } from './vite-env.js';

export function setupBootHmr(
  server: ViteDevServer,
  entry: string,
  logger: { info(msg: string): void; error(msg: string): void },
  getBootContext: () => BootContext,
  initialModule: BootModule,
  holdTimeoutMs: number = 60_000,
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

  // keep a reference to the current boot module so we can call onShutdown
  // even after the SSR module runner clears its cache on full-reload
  let currentBootModule: BootModule = initialModule;

  // "latest wins" rerun: if a rerun is in progress, queue exactly one follow-up
  // so that the last event in a burst always triggers a fresh restart
  let running = false;
  let pendingReason: string | undefined;
  let rerunPromise: Promise<void> | null = null;

  // on a failed rerun, the previous module's resources have already been destroyed
  // and the fresh module's onStartup never completed — so the app is in a broken
  // state. hold app requests until a subsequent rerun succeeds, otherwise they
  // hit uninitialized app code and produce misleading errors. the browser just
  // sees the request as "still loading" and resolves naturally once the fix lands.
  let startupFailed = false;
  let lastStartupError: unknown;
  let pendingRequests: (() => void)[] = [];

  const rerunBoot = async (reason: string): Promise<void> => {
    if (running) {
      pendingReason = reason;

      return;
    }

    running = true;

    try {
      logger.info(`${reason}, rerunning hooks...`);

      const bootContext = getBootContext();

      // use the cached module reference for shutdown — works even if
      // the SSR module runner has already cleared its evaluated modules
      try {
        await runShutdown(currentBootModule, bootContext);
      } catch (error) {
        logger.error(`Error during boot HMR shutdown: ${serializeError(error)}`);
      }

      // invalidate the module graph to reload fresh code
      server.moduleGraph.invalidateAll();

      try {
        const newModule = await ssrImport<BootModule>(server, bootModuleId);

        await runStartup(newModule, bootContext);

        currentBootModule = newModule;
        startupFailed = false;
        lastStartupError = undefined;

        if (pendingRequests.length > 0) {
          logger.info(`boot recovered — releasing ${pendingRequests.length} held request(s)`);
        }

        const pending = pendingRequests;

        pendingRequests = [];

        for (const resolve of pending) resolve();
      } catch (error) {
        logger.error(`Error during boot HMR startup: ${serializeError(error)}`);

        startupFailed = true;
        lastStartupError = error;
      }

      // astro caches the resolved middleware closure and only refreshes it when the
      // middleware file itself changes (see astro/core/middleware/vite-plugin.ts)
      // required e.g. by i18n package since it uses middleware that is initialized in boot
      // (but not propagated if we won't rescan middleware)
      getAstroHotEnv(server)?.hot.send('astro:middleware-updated', {});
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

  // listen to add/unlink in addition to change — some codegen tools rewrite
  // files via rm + write, which fires unlink + add (no change event)
  const onWatcherEvent = async (changedPath: string): Promise<void> => {
    if (shouldIgnore(changedPath)) return;

    const bootDeps = getBootDependencies();

    if (bootDeps.has(changedPath)) {
      rerunPromise = rerunBoot(`boot dependency changed: ${changedPath}`);

      await rerunPromise;

      rerunPromise = null;
    }
  };

  server.watcher.on('change', onWatcherEvent);
  server.watcher.on('add', onWatcherEvent);
  server.watcher.on('unlink', onWatcherEvent);

  // ignore full-reloads sent during server startup (dep optimization, port retries, etc.)
  let handleFullReloads = false;

  if (server.httpServer) {
    server.httpServer.once('listening', () => {
      handleFullReloads = true;
    });
  } else {
    // middleware mode — no httpServer, enable immediately
    handleFullReloads = true;
  }

  const scheduleFullReloadRerun = (payload: HotPayload): void => {
    if (!handleFullReloads) return;

    if (payload.type !== 'full-reload') return;

    // skip if already handled by the boot dependency watcher
    const triggeredBy = 'triggeredBy' in payload ? (payload.triggeredBy as string) : undefined;

    if (triggeredBy && getBootDependencies().has(triggeredBy)) return;

    rerunPromise = rerunBoot('full reload detected');

    void rerunPromise.then(() => {
      rerunPromise = null;
    });
  };

  // detect full-reload via the SSR environment's hot channel.
  // when Vite can't HMR an SSR module (no HMR boundary), it sends
  // { type: 'full-reload' } through the SSR hot channel. the module runner
  // listens on the same outsideEmitter and clears ALL evaluated modules —
  // so boot state is lost and needs re-running.
  //
  // note: Astro-triggered full-reloads (for SSR-only modules like .astro files)
  // go through server.ws.send() instead and only invalidate specific modules,
  // NOT the entire SSR module cache. boot state is preserved in that case,
  // so we intentionally don't intercept server.ws.send().
  const ssrOutsideEmitter = (server.environments['ssr']?.hot as { api?: { outsideEmitter?: EventEmitter } })?.api
    ?.outsideEmitter;

  if (ssrOutsideEmitter) {
    ssrOutsideEmitter.on('send', scheduleFullReloadRerun);
  }

  // gate incoming requests while boot is re-running so the first request
  // after a full-reload doesn't hit uninitialized state. after a failed rerun,
  // hold app requests until a subsequent rerun succeeds — the browser sees the
  // request as pending and resolves naturally once the code is fixed. vite/astro
  // dev-internal paths bypass the gate so HMR keeps flowing and can trigger the
  // recovery rerun in the first place.
  server.middlewares.use(async (req, res, next) => {
    if (isDevInternalPath(req.url)) {
      next();

      return;
    }

    while (true) {
      if (rerunPromise) {
        await rerunPromise;
      }

      if (!startupFailed) break;

      const timedOut = await waitUntilHealthy();

      if (timedOut) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        res.end(
          `boot startup failed and did not recover within ${Math.round(holdTimeoutMs / 1000)}s — last error: ${serializeError(lastStartupError)}`,
        );

        return;
      }
    }

    next();
  });

  function waitUntilHealthy(): Promise<boolean> {
    const isFirst = pendingRequests.length === 0;

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const release = (): void => {
        if (settled) return;

        settled = true;

        clearTimeout(timer);
        resolve(false);
      };

      const timer = setTimeout(() => {
        if (settled) return;

        settled = true;

        const idx = pendingRequests.indexOf(release);

        if (idx >= 0) pendingRequests.splice(idx, 1);

        resolve(true);
      }, holdTimeoutMs);

      pendingRequests.push(release);

      if (isFirst) {
        logger.info('boot startup failed — holding request(s) until next rerun succeeds');
      }
    });
  }
}

function isDevInternalPath(url: string | undefined): boolean {
  if (!url) return false;

  return url.startsWith('/@') || url.startsWith('/__') || url.includes('/node_modules/');
}
