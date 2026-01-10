import type { ClientDirective } from 'astro';
import originalLoad from 'astro/client/load.js';
import { loadI18nForChunk } from './utils.js';

/**
 * i18n-aware client:load directive
 * Loads translations in parallel before delegating to Astro's original load directive
 */
const loadDirective: ClientDirective = async (load, options, el) => {
  await loadI18nForChunk(el);
  return originalLoad(load, options, el);
};

export default loadDirective;
