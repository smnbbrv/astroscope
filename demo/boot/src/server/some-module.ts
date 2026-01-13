import { config } from './config';

let intervalId: ReturnType<typeof setInterval> | null = null;
let counter = 0;

export async function initSomeModule() {
  await new Promise((resolve) => setTimeout(resolve, 500));

  // simulate a resource that needs cleanup (e.g., db connection, cache refresh interval)
  intervalId = setInterval(() => {
    counter++;
    console.log(`[${config.moduleName}] heartbeat #${counter}`);
  }, config.heartbeatInterval);

  console.log(`[${config.moduleName}] initialized with heartbeat interval (${config.heartbeatInterval}ms)`);
}

export function cleanupSomeModule() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log(`[${config.moduleName}] cleaned up (ran ${counter} heartbeats)`);
    counter = 0;
  }
}
