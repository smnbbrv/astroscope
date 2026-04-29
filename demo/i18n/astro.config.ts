import node from '@astrojs/node';
import react from '@astrojs/react';
import boot from '@astroscope/boot';
import i18n from '@astroscope/i18n';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [boot({ watch: true, warmup: true }), react(), i18n()],
  vite: {
    plugins: [tailwindcss() as any],
  },
});
