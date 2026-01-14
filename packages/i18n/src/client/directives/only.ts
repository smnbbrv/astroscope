/**
 * i18n-aware client:only directive
 *
 * Based on Astro's load directive (MIT License)
 * https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/client/load.ts
 *
 * client:only works the same as client:load - immediate hydration
 */
import type { ClientDirective } from 'astro';
import { warmUpI18nForChunk } from './utils.js';

const onlyDirective: ClientDirective = async (load, _options, el) => {
  warmUpI18nForChunk(el);
  const hydrate = await load();
  await hydrate();
};

export default onlyDirective;
