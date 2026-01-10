import { buildI18nChunkUrl, componentUrlToChunkName } from '../../shared/url.js';
import '../types.js';

/**
 * Load translations for a chunk before hydration
 * Extracts chunk name from astro-island's component-url attribute
 */
export async function loadI18nForChunk(el: HTMLElement): Promise<void> {
  const componentUrl = el.getAttribute('component-url');

  if (!componentUrl) return;

  const chunkName = componentUrlToChunkName(componentUrl);
  const i18n = window.__i18n__;
  const hash = i18n.hashes[chunkName];

  if (hash) {
    const url = buildI18nChunkUrl(i18n.locale, chunkName, hash);
    await import(/* @vite-ignore */ url);
  }
}
