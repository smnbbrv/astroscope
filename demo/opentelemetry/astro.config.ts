import node from '@astrojs/node';
import boot from '@astroscope/boot';
import { RECOMMENDED_EXCLUDES } from '@astroscope/excludes';
import opentelemetry from '@astroscope/opentelemetry';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    opentelemetry({
      instrumentations: {
        http: {
          enabled: true,
          exclude: [...RECOMMENDED_EXCLUDES, { exact: '/health' }],
        },
      },
    }),
    boot(),
  ],
});
