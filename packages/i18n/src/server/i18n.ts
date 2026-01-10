import { computeAllChunkHashes } from '../extraction/hash.js';
import type { ExtractionManifest } from '../extraction/types.js';
import { compileTranslations } from '../shared/compiler.js';
import type { CompiledTranslations, RawTranslations } from '../shared/types.js';
import type { FallbackBehavior } from './types.js';

export type I18nConfig = {
  locales: string[];
  defaultLocale?: string | undefined;
  fallback?: FallbackBehavior | undefined;
};

type NormalizedConfig = {
  locales: string[];
  defaultLocale: string;
  fallback: FallbackBehavior;
};

class I18nSingleton {
  // normalized user config with defaults applied
  private config: NormalizedConfig | null = null;

  // locale -> raw translation strings (before ICU compilation)
  private rawCache = new Map<string, RawTranslations>();

  // locale -> raw translations merged with manifest fallbacks
  private mergedCache = new Map<string, RawTranslations>();

  // locale -> compiled ICU MessageFormat functions
  private compiledCache = new Map<string, CompiledTranslations>();

  // locale -> chunk name -> content hash (for cache busting)
  private hashCache = new Map<string, Record<string, string>>();

  // manifest getter (set by init module, provides live data in dev mode)
  private manifestGetter: (() => ExtractionManifest) | null = null;

  async configure(config: I18nConfig): Promise<void> {
    if (!config.locales?.length) {
      throw new Error('i18n.configure(): locales array is required and must not be empty');
    }

    for (const locale of config.locales) {
      if (!locale) {
        throw new Error('i18n.configure(): locale cannot be empty');
      }

      if (locale !== locale.trim()) {
        throw new Error(`i18n.configure(): locale "${locale}" has leading or trailing whitespace`);
      }
    }

    if (new Set(config.locales).size !== config.locales.length) {
      throw new Error('i18n.configure(): locales array contains duplicates');
    }

    if (config.defaultLocale !== undefined) {
      if (!config.defaultLocale) {
        throw new Error('i18n.configure(): defaultLocale cannot be empty');
      }

      if (config.defaultLocale !== config.defaultLocale.trim()) {
        throw new Error(`i18n.configure(): defaultLocale "${config.defaultLocale}" has leading or trailing whitespace`);
      }

      if (!config.locales.includes(config.defaultLocale)) {
        throw new Error(`i18n.configure(): defaultLocale "${config.defaultLocale}" is not in locales array`);
      }
    }

    this.config = {
      locales: config.locales,
      defaultLocale: config.defaultLocale ?? config.locales[0]!,
      fallback: config.fallback ?? 'fallback',
    };

    // dynamically import manifest getter from virtual module
    // this removes the need for a separate `import '@astroscope/i18n/init'`
    if (!this.manifestGetter) {
      const m = await import('virtual:@astroscope/i18n/manifest');
      this.manifestGetter = m.getManifest;
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  getConfig(): NormalizedConfig {
    if (!this.config) {
      throw new Error('i18n not configured. Call i18n.configure() first.');
    }

    return this.config;
  }

  setTranslations(locale: string, raw: RawTranslations): void {
    this.rawCache.set(locale, raw);
    this.mergedCache.delete(locale); // invalidate merged cache
    this.compiledCache.delete(locale); // invalidate compiled cache
    this.hashCache.delete(locale); // invalidate hash cache

    // recompute hashes if chunk manifest exists (production only)
    const { chunks } = this.getManifest();

    if (Object.keys(chunks).length > 0) {
      this.hashCache.set(locale, computeAllChunkHashes(raw, chunks));
    }
  }

  getTranslations(locale: string): RawTranslations {
    const cached = this.mergedCache.get(locale);
    if (cached) {
      return cached;
    }

    const raw = this.rawCache.get(locale) ?? {};
    const manifest = this.manifestGetter?.() ?? { keys: [], chunks: {} };

    if (manifest.keys.length === 0) {
      return raw;
    }

    // merge fallbacks for keys that don't have translations
    const withFallbacks: RawTranslations = { ...raw };

    for (const { key, meta } of manifest.keys) {
      if (!(key in withFallbacks) && meta.fallback) {
        withFallbacks[key] = meta.fallback;
      }
    }

    this.mergedCache.set(locale, withFallbacks);

    return withFallbacks;
  }

  getCompiledTranslations(locale: string): CompiledTranslations {
    const cached = this.compiledCache.get(locale);
    if (cached) {
      return cached;
    }

    const compiled = compileTranslations(locale, this.getTranslations(locale));
    this.compiledCache.set(locale, compiled);
    return compiled;
  }

  /**
   * Get the extraction manifest (keys + chunks).
   * - keys: translation keys extracted from codebase with metadata
   * - chunks: mapping of chunk names to their translation keys
   */
  getManifest(): ExtractionManifest {
    if (!this.manifestGetter) {
      throw new Error('i18n manifest not initialized. Call i18n.configure() first.');
    }

    return this.manifestGetter();
  }

  getHashes(locale: string): Record<string, string> {
    return this.hashCache.get(locale) ?? {};
  }

  /**
   * Clear translations for specified locale(s).
   * @param locales - Locale(s) to clear, or all if not specified
   */
  clear(locales?: string | string[] | undefined): void {
    const targets = this.resolveLocales(locales);

    for (const locale of targets) {
      this.rawCache.delete(locale);
      this.mergedCache.delete(locale);
      this.compiledCache.delete(locale);
      this.hashCache.delete(locale);
    }
  }

  private resolveLocales(locales?: string | string[] | undefined): string[] {
    if (!locales) {
      return this.config?.locales ?? [];
    }

    if (typeof locales === 'string') {
      return [locales];
    }

    return locales;
  }
}

export const i18n = new I18nSingleton();
