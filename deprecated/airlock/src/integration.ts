import type { AstroIntegration } from 'astro';

import type { AirlockOptions } from './types.js';
import { airlockVitePlugin } from './vite-plugin.js';

/**
 * astro integration that strips excess props from hydrated islands,
 * preventing accidental server data leakage to the client.
 */
export default function airlock(_options: AirlockOptions = {}): AstroIntegration {
  return {
    name: '@astroscope/airlock',
    hooks: {
      'astro:config:setup': ({ updateConfig, logger }) => {
        updateConfig({
          vite: {
            plugins: [airlockVitePlugin({ logger })],
          },
        });
      },
    },
  };
}
