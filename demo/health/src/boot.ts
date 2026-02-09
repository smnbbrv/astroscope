import type { BootContext } from '@astroscope/boot';
import { warmup } from '@astroscope/boot/warmup';
import { checks, probes, server } from '@astroscope/health';

// simulate a database connection
let dbConnected = false;

async function connectToDatabase(): Promise<void> {
  console.log('[boot] connecting to database...');
  await new Promise((resolve) => setTimeout(resolve, 500));
  dbConnected = true;
  console.log('[boot] database connected');
}

async function disconnectFromDatabase(): Promise<void> {
  console.log('[boot] disconnecting from database...');
  await new Promise((resolve) => setTimeout(resolve, 200));
  dbConnected = false;
  console.log('[boot] database disconnected');
}

export async function onStartup({ dev, host, port }: BootContext) {
  console.log('==============================');
  console.log('[boot] onStartup called');
  console.log('==============================');

  // start health server
  server.start({
    host: process.env['HEALTH_HOST'] ?? 'localhost',
    port: Number(process.env['HEALTH_PORT']) || 9090,
  });

  // enable liveness probe immediately
  probes.livez.enable();

  await connectToDatabase();

  // register health checks (return result)
  checks.register('database', () => ({
    status: dbConnected ? 'healthy' : 'unhealthy',
    error: dbConnected ? undefined : 'database not connected',
  }));

  // throw-based check (classic pattern)
  checks.register('cache', async () => {
    // simulate cache ping that throws on failure
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  // optional check with void return
  checks.register({
    name: 'externalApi',
    check: async () => {
      // simulate API latency
      await new Promise((resolve) => setTimeout(resolve, 50));
    },
    optional: true,
    timeout: 3000,
  });

  // enable startup probe (app is initialized)
  probes.startupz.enable();

  // warmup V8 by importing all page modules before accepting traffic
  const result = await warmup();

  console.log(`[boot] warmup complete: ${result.success.length} modules in ${result.duration}ms`);

  // enable readiness probe (ready to receive traffic)
  probes.readyz.enable();

  console.log(`[boot] server ready at ${host}:${port} (dev: ${dev})`);
  console.log('[boot] health endpoints available at http://localhost:9090');
}

export async function onShutdown({ dev }: BootContext) {
  console.log('==============================');
  console.log('[boot] onShutdown called');
  console.log('==============================');

  // disable readiness first (stop receiving traffic)
  probes.readyz.disable();

  await disconnectFromDatabase();

  // stop health server
  await server.stop();

  console.log(`[boot] shutdown complete (dev: ${dev})`);
}
