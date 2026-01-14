/**
 * i18n-aware client:media directive
 *
 * Based on Astro's media directive (MIT License)
 * https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/client/media.ts
 */
import type { ClientDirective } from 'astro';
import { warmUpI18nForChunk } from './utils.js';

const mediaDirective: ClientDirective = (load, options, el) => {
  const cb = async () => {
    warmUpI18nForChunk(el);
    const hydrate = await load();
    await hydrate();
  };

  if (options.value) {
    const mql = matchMedia(options.value);
    if (mql.matches) {
      cb();
    } else {
      mql.addEventListener('change', cb, { once: true });
    }
  }
};

export default mediaDirective;
