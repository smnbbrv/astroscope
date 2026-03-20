import { type BootModule, runShutdown, runStartup } from './lifecycle.js';
import { warmup } from './warmup.js';

export async function setup(
  boot: BootModule,
  config: { host: string; port: number; warmup?: boolean | undefined },
): Promise<void> {
  const context = {
    dev: false,
    host: process.env['HOST'] ?? config.host,
    port: process.env['PORT'] ? Number(process.env['PORT']) : config.port,
  };

  try {
    const warmupPromise = config.warmup
      ? warmup().then((result) => {
          if (result.success.length > 0) {
            console.log(`[boot] warmed up ${result.success.length} modules in ${result.duration}ms`);
          }

          if (result.failed.length > 0) {
            console.warn(`[boot] failed to warm up ${result.failed.length} modules`);
          }
        })
      : undefined;

    await runStartup(boot, context);
    await warmupPromise;
  } catch (err) {
    console.error('[boot] startup failed:', err);

    try {
      await runShutdown(boot, context);
    } catch {
      // best-effort cleanup
    }

    process.exit(1);
  }

  process.on('SIGTERM', async () => {
    try {
      await runShutdown(boot, context);
    } catch (err) {
      console.error('[boot] shutdown failed:', err);
    }

    process.exit(0);
  });
}
