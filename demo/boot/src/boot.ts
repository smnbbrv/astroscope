import { cleanupSomeModule, initSomeModule } from './server/some-module';

export async function onStartup() {
  console.log('==============================');
  console.log('[boot] onStartup called');
  console.log('==============================');

  await initSomeModule();

  console.log('[boot] startup complete');
}

export async function onShutdown() {
  console.log('==============================');
  console.log('[boot] onShutdown called');
  console.log('==============================');

  cleanupSomeModule();

  console.log('[boot] shutdown complete');
}
