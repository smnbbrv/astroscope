import type { TranslationMeta } from './types.js';

/**
 * Normalize meta argument to TranslationMeta object
 */
export function normalizeMeta(meta: TranslationMeta | string): TranslationMeta {
  return typeof meta === 'string' ? { fallback: meta } : meta;
}
