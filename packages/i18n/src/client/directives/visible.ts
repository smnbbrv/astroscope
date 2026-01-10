import type { ClientDirective } from 'astro';
import originalVisible from 'astro/client/visible.js';
import { loadI18nForChunk } from './utils.js';

/**
 * i18n-aware client:visible directive
 * Loads translations in parallel before delegating to Astro's original visible directive
 */
const visibleDirective: ClientDirective = async (load, options, el) => {
  await loadI18nForChunk(el);
  return originalVisible(load, options, el);
};

export default visibleDirective;
