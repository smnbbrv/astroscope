/**
 * i18n-aware client:idle directive
 *
 * Based on Astro's idle directive (MIT License)
 * https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/client/idle.ts
 */
import type { ClientDirective } from 'astro';
import { warmUpI18nForChunk } from './utils.js';

const idleDirective: ClientDirective = (load, _options, el) => {
  const cb = async () => {
    warmUpI18nForChunk(el);
    const hydrate = await load();
    await hydrate();
  };

  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb);
  } else {
    setTimeout(cb, 200);
  }
};

export default idleDirective;
