import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BootContext } from './types';

vi.mock('./vite-env.js', () => ({
  ssrImport: vi.fn(),
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

function createMockServer(opts?: { bootDeps?: string[] | undefined }) {
  const watcher = new EventEmitter();
  const hot = new EventEmitter();
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

  const server = {
    config: { root: '/project' },
    watcher,
    hot,
    moduleGraph: {
      getModulesByFile: vi.fn((file: string) => (file === bootFile ? new Set([bootMod]) : undefined)),
      invalidateAll: vi.fn(),
    },
  };

  return server;
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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/boot.ts');

      // allow async handlers to settle
      await vi.waitFor(() => expect(mockedRunShutdown).toHaveBeenCalledTimes(1));

      expect(mockedRunStartup).toHaveBeenCalledTimes(1);
      expect(server.moduleGraph.invalidateAll).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('boot dependency changed'));
    });

    test('reruns hooks when a transitive boot dependency changes', async () => {
      const server = createMockServer({ bootDeps: ['/project/src/services.ts'] });

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/services.ts');

      await vi.waitFor(() => expect(mockedRunShutdown).toHaveBeenCalledTimes(1));

      expect(mockedRunStartup).toHaveBeenCalledTimes(1);
    });

    test('does not rerun hooks for non-boot file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/components/App.tsx');

      // give it a tick to ensure nothing fires
      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
      expect(mockedRunStartup).not.toHaveBeenCalled();
    });
  });

  describe('ignored files', () => {
    test('ignores css file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/styles/main.css');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });

    test('ignores image file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/public/logo.png');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });

    test('ignores json file changes', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/package.json');

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedRunShutdown).not.toHaveBeenCalled();
    });
  });

  describe('full reload', () => {
    test('reruns hooks on vite:beforeFullReload', async () => {
      const server = createMockServer();

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.hot.emit('vite:beforeFullReload');

      await vi.waitFor(() => expect(mockedRunShutdown).toHaveBeenCalledTimes(1));

      expect(mockedRunStartup).toHaveBeenCalledTimes(1);
      expect(server.moduleGraph.invalidateAll).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('full reload detected'));
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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      // fire a boot dep change (starts running) then a full reload while it's in progress
      server.watcher.emit('change', '/project/src/boot.ts');

      // small delay to ensure the first rerun has started
      await new Promise((r) => setTimeout(r, 10));

      server.hot.emit('vite:beforeFullReload');

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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      // start first run
      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      // fire three events while the first is still running
      server.hot.emit('vite:beforeFullReload');
      server.hot.emit('vite:beforeFullReload');
      server.hot.emit('vite:beforeFullReload');

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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      // start first run via boot dep change
      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      // queue events — the full reload should be the "last reason"
      server.watcher.emit('change', '/project/src/dep-a.ts');
      server.hot.emit('vite:beforeFullReload');

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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('shutdown')));

      expect(mockedRunStartup).toHaveBeenCalledTimes(1);
    });

    test('logs startup errors without crashing', async () => {
      const server = createMockServer();

      mockedRunStartup.mockRejectedValue(new Error('startup failed'));

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/boot.ts');

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('startup'));
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

      setupBootHmr(server as never, 'src/boot.ts', logger, () => ctx);

      server.watcher.emit('change', '/project/src/boot.ts');

      await new Promise((r) => setTimeout(r, 10));

      server.hot.emit('vite:beforeFullReload');

      await vi.waitFor(() => expect(mockedRunStartup).toHaveBeenCalledTimes(2));

      // both runs completed despite the first shutdown failing
      expect(mockedRunShutdown).toHaveBeenCalledTimes(2);
    });
  });
});
