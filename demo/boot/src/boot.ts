import type { BootContext } from '@astroscope/boot';
import { cleanupSomeModule, initSomeModule } from './server/some-module';

console.log('==============================');
console.log('[boot] module level code executed');
console.log('==============================');

export async function onStartup({ dev, host, port }: BootContext) {
  console.log('==============================');
  console.log('[boot] onStartup called');
  console.log('==============================');

  await initSomeModule();

  console.log(`[boot] server ready at ${host}:${port} (dev: ${dev})`);
}

export async function onShutdown({ dev }: BootContext) {
  console.log('==============================');
  console.log('[boot] onShutdown called');
  console.log('==============================');

  cleanupSomeModule();

  console.log(`[boot] shutdown complete (dev: ${dev})`);
}
