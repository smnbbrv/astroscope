import type { ClientDirective } from 'astro';
import originalOnly from 'astro/client/only.js';
import { loadI18nForChunk } from './utils.js';

/**
 * i18n-aware client:only directive
 * Loads translations in parallel before delegating to Astro's original only directive
 */
const onlyDirective: ClientDirective = async (load, options, el) => {
  await loadI18nForChunk(el);
  return originalOnly(load, options, el);
};

export default onlyDirective;
