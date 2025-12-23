import { log } from '@astroscope/pino';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  log.info('starting slow operation');

  await new Promise((resolve) => setTimeout(resolve, 300));

  log.info('slow operation completed');

  return new Response(JSON.stringify({ message: 'Slow response', delay: 300 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
