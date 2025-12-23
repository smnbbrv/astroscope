import { log } from '@astroscope/pino';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  log.error('intentional error for demo');

  throw new Error('Intentional error for demo purposes');
};
