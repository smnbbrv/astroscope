import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BootModule } from './lifecycle';
import type { BootContext } from './types';

vi.mock('./vite-env.js', () => ({
  ssrImport: vi.fn(),
  getAstroHotEnv: vi.fn(() => ({ hot: { send: vi.fn() } })),
}));

vi.mock('./lifecycle.js', () => ({
  runStartup: vi.fn(),
  runShutdown: vi.fn(),
}));

// import after mocks are set up
const { setupBootHmr } = await import('./hmr');
const { ssrImport } = await import('./vite-env.js');
const { runStartup, runShutdown } = await import('./lifecycle.js');

const mockedSsrImport = vi.mocked(ssrImport);
const mockedRunStartup = vi.mocked(runStartup);
const mockedRunShutdown = vi.mocked(runShutdown);

const ctx: BootContext = { dev: true, host: 'localhost', port: 4321 };

const initialModule: BootModule = { onStartup: vi.fn(), onShutdown: vi.fn() };

function createMockServer(opts?: { bootDeps?: string[] | undefined }) {
  const watcher = new EventEmitter();
  const ssrOutsideEmitter = new EventEmitter();
  const bootFile = '/project/src/boot.ts';

  // build a minimal module graph
  const bootMod = {
    file: bootFile,
    importedModules: new Set(
      (opts?.bootDeps ?? []).map((dep) => ({
        file: dep,
        importedModules: new Set(),
      })),
    ),
  };

  // collect middlewares so tests can inspect them
  const middlewares: ((...args: unknown[]) => unknown)[] = [];
  const httpServer = new EventEmitter();

  const server = {
    config: { root: '/project' },
    watcher,
    httpServer,
    environments: {
      ssr: {
        hot: {
          api: { outsideEmitter: ssrOutsideEmitter },
        },
      },
    },
    moduleGraph: {
      getModulesByFile: vi.fn((file: string) => (file === bootFile ? new Set([bootMod]) : undefined)),
      invalidateAll: vi.fn(),
    },
    middlewares: {
      use: (fn: (...args: unknown[]) => unknown) => {
        middlewares.push(fn);
      },
    },
    _middlewares: middlewares,
    _ssrOutsideEmitter: ssrOutsideEmitter,
  };

  return server;
}

/** mark the server as listening so full-reload handlers are active */
function markReady(server: ReturnType<typeof createMockServer>) {
  server.httpServer.emit('listening');
}

/** simulate a Vite-internal SSR full-reload via the outsideEmitter */
function emitSsrFullReload(server: ReturnType<typeof createMockServer>, triggeredBy?: string | undefined) {
  server._ssrOutsideEmitter.emit('send', {
    type: 'full-reload' as const,
    path: '*',
    ...(triggeredBy ? { triggeredBy } : {}),
  });
}

const logger = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();

  // default: ssrImport returns a boot module with noop hooks
  mockedSsrImport.mockResolvedValue({ onStartup: vi.fn(), onShutdown: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setupBootHmr', () => {
  describe('boot dependency changes', () => {
    test('reruns hooks when the boot file itself changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/boot.ts');

      // wait for the full shutdown/startup cycle to complete
      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(1));

      expect(mockedRunShutdown).toHaveBeenCalledTimes(1);
      expect(server.moduleGraph.invalidateAll).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('boot dependency changed'));
    });

    test('reruns hooks when a transitive boot dependency changes', async () => {
      const server = createMockServer({ bootDeps: ['/project/src/services.ts'] });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/services.ts');

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(1));

      expect(mockedRunShutdown).toHaveBeenCalledTimes(1);
    });

    test('does not rerun hooks for non-boot file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/components/App.tsx');

      // give it a tick to ensure nothing fires
      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
      expect(mockedRunStartup).not.toHaveBeenCalled();
    });

    test('reruns hooks when a boot dependency is replaced via unlink+add (rm+rewrite)', async () => {
      const server = createMockServer({ bootDeps: ['/project/src/generated.ts'] });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('unlink', '/project/src/generated.ts');
      server.watcher.emit('add', '/project/src/generated.ts');

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalled());

      expect(mockedRunShutdown).toHaveBeenCalled();
    });

    test('uses cached module reference for shutdown', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(mockedRunShutdown).toHaveBeenCalledTimes(1));

      // shutdown should be called with the initial module, not a fresh import
      expect(mockedRunShutdown).toHaveBeenCalledWith(initialModule, ctx);
    });
  });

  describe('ignored files', () => {
    test('ignores css file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/styles/main.css');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });

    test('ignores image file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/public/logo.png');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });

    test('ignores json file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/package.json');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });
  });

  describe('SSR full-reload', () => {
    test('reruns hooks on SSR full-reload', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      emitSsrFullReload(server);

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(1));

      expect(mockedRunShutdown).toHaveBeenCalledTimes(1);
      expect(server.moduleGraph.invalidateAll).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('full reload detected'));
    });

    test('skips full-reload when triggered by a boot dependency', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      // full-reload triggered by the boot file itself — already handled by watcher
      emitSsrFullReload(server, '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      // the full-reload handler should skip this (watcher handles it)
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('full reload detected'));
    });

    test('ignores full-reloads before server is ready', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      // emit full-reload BEFORE markReady — should be ignored
      emitSsrFullReload(server);

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
      expect(mockedRunStartup).not.toHaveBeenCalled();
    });

    test('ignores non-full-reload SSR hot messages', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      server._ssrOutsideEmitter.emit('send', { type: 'update', updates: [] });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });
  });

  describe('request gating middleware', () => {
    test('registers a middleware', () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      expect(server._middlewares.length).toBe(1);
    });

    test('middleware waits for boot re-run to complete', async () => {
      const server = createMockServer();
      let startupResolved = false;

      mockedRunStartup.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        startupResolved = true;
      });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      const middleware = server._middlewares[0]!;

      // trigger a full-reload
      emitSsrFullReload(server);

      // call middleware while boot is re-running
      const next = vi.fn();

      await middleware({}, {}, next);

      // next should only be called after boot finishes
      expect(startupResolved).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    test('middleware passes through when no rerun is pending', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      const middleware = server._middlewares[0]!;
      const next = vi.fn();

      await middleware({}, {}, next);

      expect(next).toHaveBeenCalled();
      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });
  });

  describe('latest-wins deduplication', () => {
    test('queued event runs after current one finishes', async () => {
      const server = createMockServer();
      const callOrder: string[] = [];

      // make the first shutdown slow so we can queue events during it
      mockedRunShutdown.mockImplementation(async () => {
        callOrder.push('shutdown');
        await new Promise((r) => setTimeout(r, 50));
      });

      mockedRunStartup.mockImplementation(async () => {
        callOrder.push('startup');
      });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      // fire a boot dep change (starts running) then a full reload while it's in progress
      server.watcher.emit('change', '/project/src/boot.ts');

      // small delay to ensure the first rerun has started
      await new Promise((r) => setTimeout(r, 10));

      emitSsrFullReload(server);

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(2));

      // should have run shutdown/startup twice (initial + queued)
      expect(mockedRunShutdown).toHaveBeenCalledTimes(2);
      expect(callOrder).toEqual(['shutdown', 'startup', 'shutdown', 'startup']);
    });

    test('multiple events during a run collapse into one follow-up', async () => {
      const server = createMockServer();

      mockedRunShutdown.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      // start first run
      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      // fire three events while the first is still running
      emitSsrFullReload(server);
      emitSsrFullReload(server);
      emitSsrFullReload(server);

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(2));

      // exactly 2 runs: the original + one collapsed follow-up (not 4)
      expect(mockedRunShutdown).toHaveBeenCalledTimes(2);
      expect(mockedRunStartup).toHaveBeenCalledTimes(2);
    });

    test('last reason wins in collapsed follow-up', async () => {
      const server = createMockServer({ bootDeps: ['/project/src/dep-a.ts'] });

      mockedRunShutdown.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      // start first run via boot dep change
      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      // queue a full reload (not triggered by a boot dep)
      emitSsrFullReload(server);

      // wait for both runs to fully complete
      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(2));

      // second call should use the latest reason
      expect(logger.info).toHaveBeenLastCalledWith(expect.stringContaining('full reload detected'));
    });
  });

  describe('error handling', () => {
    test('logs shutdown errors and still runs startup', async () => {
      const server = createMockServer();

      mockedRunShutdown.mockRejectedValueOnce(new Error('shutdown failed'));

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('shutdown')));

      expect(mockedRunStartup).toHaveBeenCalledTimes(1);
    });

    test('logs startup errors without crashing', async () => {
      const server = createMockServer();

      mockedRunStartup.mockRejectedValue(new Error('startup failed'));

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('startup'));
    });

    test('holds app requests after a failed rerun until the next rerun succeeds', async () => {
      const server = createMockServer();

      mockedRunStartup.mockRejectedValueOnce(new Error('startup failed'));

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      // first rerun: startup fails — app requests should be held
      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('startup')));

      const middleware = server._middlewares[0]!;
      const next = vi.fn();
      const req = { url: '/' };
      const res = {};
      const pending = middleware(req, res, next) as Promise<void>;
      let settled = false;

      void pending.then(() => {
        settled = true;
      });

      await new Promise((r) => setTimeout(r, 30));

      // request is still hanging because startup is broken
      expect(next).not.toHaveBeenCalled();
      expect(settled).toBe(false);

      // first hold logs prominently
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('holding request'));

      // user fixes the code — next rerun succeeds (default mock)
      mockedRunStartup.mockResolvedValueOnce(undefined);
      server.watcher.emit('change', '/project/src/boot.ts');

      await pending;

      expect(next).toHaveBeenCalledTimes(1);
      // recovery log names the released count
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('boot recovered'));
    });

    test('times out a held request with 503 after holdTimeoutMs', async () => {
      const server = createMockServer();
      const startupError = new Error('boom');

      mockedRunStartup.mockRejectedValue(startupError);

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule, 50);
      markReady(server);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('startup')));

      const middleware = server._middlewares[0]!;
      const next = vi.fn();
      const res = {
        statusCode: 200,
        _headers: {} as Record<string, string>,
        setHeader(k: string, v: string) {
          this._headers[k] = v;
        },
        _body: '',
        end(body: string) {
          this._body = body;
        },
      };

      await middleware({ url: '/' }, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(503);
      expect(res._body).toContain('boom');
      expect(res._body).toMatch(/did not recover within/);
    });

    test('dev-internal requests bypass the hold after a failed rerun', async () => {
      const server = createMockServer();

      mockedRunStartup.mockRejectedValueOnce(new Error('startup failed'));

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('startup')));

      const middleware = server._middlewares[0]!;

      for (const url of ['/@vite/client', '/@id/x', '/__vite_ping', '/node_modules/foo/bar.js']) {
        const next = vi.fn();

        await middleware({ url }, {}, next);

        expect(next, `expected ${url} to pass through`).toHaveBeenCalledTimes(1);
      }
    });

    test('queued event still runs after current run errors', async () => {
      const server = createMockServer();
      let shutdownCallCount = 0;

      mockedRunShutdown.mockImplementation(async () => {
        shutdownCallCount++;

        if (shutdownCallCount === 1) {
          await new Promise((r) => setTimeout(r, 50));

          throw new Error('first shutdown failed');
        }
      });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx, initialModule);
      markReady(server);

      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      emitSsrFullReload(server);

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(2));

      // both runs completed despite the first shutdown failing
      expect(mockedRunShutdown).toHaveBeenCalledTimes(2);
    });
  });
});
