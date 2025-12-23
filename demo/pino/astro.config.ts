import node from '@astrojs/node';
import { RECOMMENDED_EXCLUDES } from '@astroscope/excludes';
import pino from '@astroscope/pino';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    pino({
      exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }],
    }),
  ],
});
