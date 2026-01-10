import type { ClientDirective } from 'astro';
import originalIdle from 'astro/client/idle.js';
import { loadI18nForChunk } from './utils.js';

/**
 * i18n-aware client:idle directive
 * Loads translations in parallel before delegating to Astro's original idle directive
 */
const idleDirective: ClientDirective = async (load, options, el) => {
  await loadI18nForChunk(el);
  return originalIdle(load, options, el);
};

export default idleDirective;
