import type { BootContext } from '@astroscope/boot';
import { warmup } from '@astroscope/boot/warmup';
import { cleanupSomeModule, initSomeModule } from './server/some-module';

export async function onStartup({ dev, host, port }: BootContext) {
  console.log('==============================');
  console.log('[boot] onStartup called');
  console.log('==============================');

  await initSomeModule();

  const result = await warmup();

  if (result.success.length > 0) {
    console.log(`[boot] V8 warmup: ${result.success.length} modules in ${result.duration}ms`);
  }

  console.log(`[boot] server ready at ${host}:${port} (dev: ${dev})`);
}

export async function onShutdown({ dev }: BootContext) {
  console.log('==============================');
  console.log('[boot] onShutdown called');
  console.log('==============================');

  cleanupSomeModule();

  console.log(`[boot] shutdown complete (dev: ${dev})`);
}
