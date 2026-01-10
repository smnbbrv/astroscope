import MessageFormat from '@messageformat/core';
import type { CompiledTranslation, CompiledTranslations, RawTranslations } from './types.js';

const cache = new Map<string, MessageFormat>();

function getMessageFormat(locale: string): MessageFormat {
  let mf = cache.get(locale);

  if (!mf) {
    mf = new MessageFormat(locale);

    cache.set(locale, mf);
  }

  return mf;
}

export function compileMessage(locale: string, message: string): CompiledTranslation {
  const mf = getMessageFormat(locale);

  try {
    return mf.compile(message);
  } catch {
    // if ICU parsing fails, return raw message so the problem is visible to the user
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
