import type { BootContext } from '@astroscope/boot';
import { warmup } from '@astroscope/boot/warmup';
import { checks } from '@astroscope/health';

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

  // warmup V8 by importing all page modules before accepting traffic
  const result = await warmup();

  console.log(`[boot] warmup complete: ${result.success.length} modules in ${result.duration}ms`);
  console.log(`[boot] server ready at ${host}:${port} (dev: ${dev})`);
  // health server starts automatically after onStartup via @astroscope/health integration
}

export async function onShutdown({ dev }: BootContext) {
  console.log('==============================');
  console.log('[boot] onShutdown called');
  console.log('==============================');

  await disconnectFromDatabase();

  // health server stops automatically before onShutdown via @astroscope/health integration
  console.log(`[boot] shutdown complete (dev: ${dev})`);
}
