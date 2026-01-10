import type { APIContext, MiddlewareHandler } from 'astro';
import type { RawTranslations } from '../shared/types.js';
import { runWithContext } from './context.js';
import { i18n } from './i18n.js';
import type { I18nContext } from './types.js';

export type I18nMiddlewareOptions = {
  locale: (ctx: APIContext) => string;
};

const I18N_ENDPOINT_PREFIX = '/_i18n/';

/**
 * Create the i18n chunk middleware that serves translation chunks at `/_i18n/` endpoints.
 *
 * Place this early in your middleware sequence (before session/auth)
 * to avoid unnecessary overhead for static translation requests.
 *
 * @example
 * ```typescript
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { createI18nChunkMiddleware, createI18nMiddleware } from '@astroscope/i18n';
 *
 * export const onRequest = sequence(
 *   createI18nChunkMiddleware(),  // early: serves /_i18n/ chunks
 *   sessionMiddleware,
 *   createI18nMiddleware({ locale: (ctx) => ... }),  // after session
 * );
 * ```
 */
export function createI18nChunkMiddleware(): MiddlewareHandler {
  return (ctx, next) => {
    const { pathname } = ctx.url;

    if (!pathname.startsWith(I18N_ENDPOINT_PREFIX)) {
      return next();
    }

    const path = pathname.slice(I18N_ENDPOINT_PREFIX.length);

    // attempt to parse as efficient as possible
    // expected path format: {locale}/{chunkName}.{hash}.js
    // avoiding regex or split for performance
    const slashIdx = path.indexOf('/');

    if (slashIdx === -1) {
      return next();
    }

    const locale = path.slice(0, slashIdx);
    const rest = path.slice(slashIdx + 1);

    if (!rest.endsWith('.js')) {
      return next();
    }

    const withoutJs = rest.slice(0, -3);
    const lastDotIdx = withoutJs.lastIndexOf('.');

    if (lastDotIdx === -1) {
      return next();
    }

    const chunkName = withoutJs.slice(0, lastDotIdx);
    const keys = i18n.getManifest().chunks[chunkName];

    if (!keys) {
      return new Response(`/* chunk not found: ${chunkName} */`, {
        status: 404,
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    const translations = i18n.getTranslations(locale);
    const chunkTranslations: RawTranslations = {};

    for (const key of keys) {
      if (translations[key]) {
        chunkTranslations[key] = translations[key];
      }
    }

    const js = `/* @astroscope/i18n chunk: ${chunkName} */
(function() {
  var i = window.__i18n__;
  if (i) Object.assign(i.translations, ${JSON.stringify(chunkTranslations)});
})();
`;

    const body = new TextEncoder().encode(js);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  };
}

/**
 * Create the i18n locale middleware.
 *
 * Sets up the request context with locale and translations for use by
 * `t()` and `<I18nScript />`. Place this after session middleware if
 * your locale detection depends on session/cookies.
 *
 * @example
 * ```typescript
 * import { createI18nMiddleware, detectLocale, i18n } from '@astroscope/i18n';
 *
 * export const i18nMiddleware = createI18nMiddleware({
 *   locale: (ctx) =>
 *     ctx.cookies.get('locale')?.value ??
 *     detectLocale(ctx.request) ??
 *     i18n.getConfig().defaultLocale,
 * });
 * ```
 */
export function createI18nMiddleware(options: I18nMiddlewareOptions): MiddlewareHandler {
  return (ctx, next) => {
    const locale = options.locale(ctx);

    const context: I18nContext = {
      locale,
      translations: i18n.getCompiledTranslations(locale),
      fallback: i18n.getConfig().fallback,
    };

    return runWithContext(context, () => next());
  };
}
