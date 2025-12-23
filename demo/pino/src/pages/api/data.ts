import { log } from '@astroscope/pino';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  log.info('handling /api/data request');

  // create child logger for database operations
  const dbLog = log.child({ component: 'db' });

  dbLog.debug('fetching user data');

  // simulate database query
  await new Promise((resolve) => setTimeout(resolve, 20));

  dbLog.info({ rows: 42 }, 'query completed');

  const data = {
    message: 'Hello from API',
    timestamp: new Date().toISOString(),
    items: [1, 2, 3],
  };

  log.info({ dataSize: JSON.stringify(data).length }, 'response prepared');

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
