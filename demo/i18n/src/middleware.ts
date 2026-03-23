import { createI18nChunkMiddleware, createI18nMiddleware, detectLocale, i18n } from '@astroscope/i18n';
import { sequence } from 'astro:middleware';

export const onRequest = sequence(
  createI18nChunkMiddleware(), // early: serves /_i18n/ chunks before session
  // sessionMiddleware would go here
  createI18nMiddleware({
    // locale context (may depend on session)
    locale: ({ request, url, cookies }) =>
      url.searchParams.get('locale') ??
      cookies.get('locale')?.value ??
      detectLocale(request) ??
      i18n.getConfig().defaultLocale,
  }),
);
