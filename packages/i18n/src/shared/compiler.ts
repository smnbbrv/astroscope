import { MessageFormat } from 'messageformat';
import { DraftFunctions } from 'messageformat/functions';

import type { CompiledTranslation, CompiledTranslations, RawTranslations } from './types.js';

// enable draft functions for :currency, :date, :datetime, :time, :percent, :unit
const mfOptions = { functions: DraftFunctions };

const cache = new Map<string, MessageFormat<string, string>>();

export function compileMessage(locale: string, message: string): CompiledTranslation {
  const cacheKey = `${locale}:${message}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return (values) => cached.format(values);
  }

  try {
    const mf = new MessageFormat(locale, message, mfOptions);

    cache.set(cacheKey, mf);

    return (values) => mf.format(values);
  } catch {
    // if MF2 parsing fails, return raw message so the problem is visible to the user
    return () => message;
  }
}

export function compileTranslations(locale: string, raw: RawTranslations): CompiledTranslations {
  const compiled: CompiledTranslations = {};

  for (const [key, message] of Object.entries(raw)) {
    compiled[key] = compileMessage(locale, message);
  }

  return compiled;
}
