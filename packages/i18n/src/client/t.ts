import { compileMessage } from '../shared/compiler.js';
import { normalizeMeta } from '../shared/meta.js';
import type { CompiledTranslation, TranslateFunction, TranslationMeta } from '../shared/types.js';
import './types.js';

const cache = new Map<string, CompiledTranslation>();

export function getLocale(): string {
  return window.__i18n__.locale;
}

/**
 * Client-side translate function
 *
 * Reads from window.__i18n__.translations (injected per-chunk).
 * In production, translations are always loaded before component code runs
 * via the chunk loader injected by the Vite plugin.
 *
 * Call patterns:
 * - Development: t('key', 'fallback') or t('key', 'fallback', values)
 * - Production: t('key') or t('key', undefined, values)
 *
 * Falls back to meta.fallback (dev) or key (prod) when translation is missing.
 */
export const t: TranslateFunction = ((
  key: string,
  meta?: TranslationMeta | string,
  values?: Record<string, unknown>,
): string => {
  const normalizedMeta: TranslationMeta = meta ? normalizeMeta(meta) : { fallback: '' };

  // look up raw translation
  const raw = window.__i18n__.translations[key];

  if (!raw) {
    // translation missing: use fallback (dev) or key (prod)
    if (normalizedMeta.fallback) {
      let compiled = cache.get(`__fallback__${key}`);

      if (!compiled) {
        compiled = compileMessage(window.__i18n__.locale, normalizedMeta.fallback);
        cache.set(`__fallback__${key}`, compiled);
      }

      return compiled(values);
    }

    // production: return key as-is
    return key;
  }

  // check cache
  let compiled = cache.get(key);

  if (!compiled) {
    compiled = compileMessage(window.__i18n__.locale, raw);
    cache.set(key, compiled);
  }

  return compiled(values);
}) as TranslateFunction;
