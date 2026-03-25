import node from '@astrojs/node';
import hyperspace from '@astroscope/hyperspace';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [hyperspace()],
  vite: {
    plugins: [tailwindcss() as any],
  },
});
