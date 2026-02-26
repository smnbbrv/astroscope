import node from '@astrojs/node';
import csrf from '@astroscope/csrf';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: {
    allowedDomains: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4321',
      },
    ],
  },
  integrations: [
    csrf({
      exclude: [
        { prefix: '/auth/' }, // OIDC callbacks
        { exact: '/webhook' }, // Payment webhooks
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
