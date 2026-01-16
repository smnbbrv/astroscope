/**
 * i18n-aware client:visible directive
 *
 * Based on Astro's visible directive (MIT License)
 * https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/client/visible.ts
 */
import type { ClientDirective, ClientVisibleOptions } from 'astro';
import { warmUpI18nForChunk } from './utils.js';

const visibleDirective: ClientDirective = (load, options, el) => {
  const cb = async () => {
    warmUpI18nForChunk(el);
    const hydrate = await load();
    await hydrate();
  };

  const rawOptions = typeof options.value === 'object' ? (options.value as ClientVisibleOptions) : undefined;

  const ioOptions: IntersectionObserverInit = rawOptions?.rootMargin ? { rootMargin: rawOptions.rootMargin } : {};

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.disconnect();
      cb();
      break;
    }
  }, ioOptions);

  for (const child of el.children) {
    io.observe(child);
  }
};

export default visibleDirective;
