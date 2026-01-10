import { i18n } from './i18n.js';

/**
 * Detect locale from Accept-Language header.
 * Returns best match from configured locales, or undefined if none match.
 */
export function detectLocale(request: Request): string | undefined {
  const config = i18n.getConfig();

  if (!config) return undefined;

  const { locales } = config;
  const acceptLanguage = request.headers.get('accept-language');

  if (!acceptLanguage) return undefined;

  const preferred = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q = 'q=1'] = part.trim().split(';');
      return {
        lang: lang.split('-')[0].toLowerCase(),
        q: parseFloat(q.replace('q=', '')),
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (locales.includes(lang)) {
      return lang;
    }
  }

  return undefined;
}
