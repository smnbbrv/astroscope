import type { CompiledTranslations, TranslationMeta } from '../shared/types.js';

/**
 * Fallback behavior when translation is missing
 */
export type FallbackBehavior =
  | 'key'
  | 'fallback'
  | 'throw'
  | ((key: string, meta?: TranslationMeta | undefined) => string);

/**
 * Request-scoped i18n context
 */
export type I18nContext = {
  locale: string;
  translations: CompiledTranslations;
  fallback: FallbackBehavior;
};
