import { open } from '@astroscope/wormhole/server';
import { defineMiddleware, sequence } from 'astro:middleware';
import { getCount } from './server/store';
import { configWormhole, counterWormhole } from './wormholes';

const configMiddleware = defineMiddleware((_ctx, next) => {
  return open(configWormhole, { siteName: 'Astroscope Demo', features: ['wormhole', 'react', 'ssr'] }, () => next());
});

const counterMiddleware = defineMiddleware((_ctx, next) => {
  return open(counterWormhole, { count: getCount() }, () => next());
});

export const onRequest = sequence(configMiddleware, counterMiddleware);
