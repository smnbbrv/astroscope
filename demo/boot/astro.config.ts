import node from '@astrojs/node';
import boot from '@astroscope/boot';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [boot({ hmr: true, warmup: true })],
  vite: {
    plugins: [tailwindcss() as any],
  },
});
