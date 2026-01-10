import type { ClientDirective } from 'astro';
import originalMedia from 'astro/client/media.js';
import { loadI18nForChunk } from './utils.js';

/**
 * i18n-aware client:media directive
 * Loads translations in parallel before delegating to Astro's original media directive
 */
const mediaDirective: ClientDirective = async (load, options, el) => {
  await loadI18nForChunk(el);
  return originalMedia(load, options, el);
};

export default mediaDirective;
