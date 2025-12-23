import node from '@astrojs/node';
import opentelemetry from '@astroscope/opentelemetry';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    opentelemetry({
      instrumentations: {
        http: { enabled: false },
      },
    }),
  ],
});
