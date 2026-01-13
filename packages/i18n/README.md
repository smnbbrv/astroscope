# @astroscope/i18n

i18n for Astro + React islands — automatic tree-shaking, parallel loading, any translation source.

## Why this library?

**SSR-first** — The only i18n solution built specifically for SSR + islands architecture. Works seamlessly with Astro's partial hydration model where most i18n libraries fail.

**Automatic tree-shaking** — Only translations actually used by each component are delivered to the browser. No manual chunk splitting, no configuration. It just works.

**Parallel loading** — Translations load alongside component hydration via custom `client:*-x` directives. No waiting for translations before rendering.

**Unified API** — Same `t()` function works identically in Astro templates and React islands.

**Any translation source** — Fetch translations from any provider: JSON files, database, headless CMS, TMS, or custom API. All of them will be optimized and chunked automatically.

**Production optimized** — Fallback strings are stripped from production bundles via Babel, reducing bundle size while keeping fallbacks available via the manifest.

## Features

- **Per-chunk translation loading** — each island gets only its translations
- **ICU MessageFormat** support via `@messageformat/core`
- **Babel-based extraction** — robust AST parsing, source maps, production stripping
- **Manifest fallbacks** — missing translations automatically use extracted fallbacks
- **Full TypeScript support**
- **Tiny client runtime** — no heavy i18n framework

## Installation

```bash
npm install @astroscope/i18n @astroscope/boot
```

## Usage

### 1. Add the integration

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import boot from '@astroscope/boot';
import i18n from '@astroscope/i18n';

export default defineConfig({
  integrations: [
    boot(),
    i18n(),
  ],
});
```

### 2. Configure i18n in your boot file

**VERY IMPORTANT:** `i18n.configure` must be awaited during boot before handling any requests!

```ts
// src/boot.ts
import { i18n, type RawTranslations } from '@astroscope/i18n';

async function fetchTranslations(locale: string): Promise<RawTranslations> {
  // fetch from your CMS, API, or local files
  const response = await fetch(`https://api.example.com/translations/${locale}`);
  return response.json();
}

export async function onStartup() {
  await i18n.configure({
    locales: ['en', 'de'],
    defaultLocale: 'en',  // optional, defaults to first locale
  });

  // load translations for all locales
  const [en, de] = await Promise.all([
    fetchTranslations('en'),
    fetchTranslations('de'),
  ]);

  i18n.setTranslations('en', en);
  i18n.setTranslations('de', de);
}
```

### 3. Add the middleware

```ts
// src/middleware.ts
import { sequence } from 'astro:middleware';
import { createI18nChunkMiddleware, createI18nMiddleware, i18n } from '@astroscope/i18n';

export const onRequest = sequence(
  createI18nChunkMiddleware(),  // serves /_i18n/ translation chunks
  createI18nMiddleware({
    locale: (ctx) =>
      ctx.cookies.get('locale')?.value ??
      i18n.getConfig().defaultLocale,
  }),
);
```

### 4. Add `<I18nScript />` to your layout

Inject translations into the page for hydrated components:

```astro
---
import { I18nScript } from '@astroscope/i18n/components';
---
<html>
  <head>
    <I18nScript />
  </head>
  <body>
    <slot />
  </body>
</html>
```

### 5. Use `t()` in your components

```astro
---
// In .astro files
import { t } from '@astroscope/i18n/t';
---
<h1>{t('checkout.title', 'Order Summary')}</h1>
```

```tsx
// In React components
import { t } from '@astroscope/i18n/t';

export function CheckoutSummary() {
  return (
    <div>
      <h1>{t('checkout.title', 'Order Summary')}</h1>
      <p>{t('checkout.tax', 'Includes {tax} VAT', { tax: '19%' })}</p>
    </div>
  );
}
```

### 6. Use i18n-aware client directives

**The problem:** With standard `client:*` directives, the translation chunk loads *after* the component module. This delays hydration while translations are fetched sequentially.

**The solution:** Use `client:*-x` directives to load translations in parallel with the component code:

```astro
---
import Cart from '../components/Cart';
---
<!-- translations load alongside component code -->
<Cart client:load-x />
<Cart client:visible-x />
<Cart client:idle-x />
```

## API

### `t(key, fallback, values?)`

Translate a key with optional interpolation values.

```ts
// simple
t('checkout.title', 'Order Summary')

// with variables
t('checkout.tax', 'Includes {tax} VAT', { tax: '19%' })

// with pluralization (ICU MessageFormat)
t('cart.items', '{count, plural, one {# item} other {# items}}', { count: 5 })

// with metadata object (for extraction tooling)
t('cart.total', {
  fallback: 'Total: {amount}',
  description: 'Cart total price',
  variables: {
    amount: { fallback: '$0.00', description: 'Formatted price' }
  }
}, { amount: '$49.99' })
```

### `i18n` singleton

```ts
import { i18n } from '@astroscope/i18n';

// configure (call once at startup)
await i18n.configure({
  locales: ['en', 'de'],
  defaultLocale: 'en',
});

// set translations for a locale
i18n.setTranslations('en', { 'key': 'value' });

// get raw translations (includes manifest fallbacks)
i18n.getTranslations('en');

// get compiled translations (ICU MessageFormat functions)
i18n.getCompiledTranslations('en');

// get extraction manifest
// has all extracted keys with their metadata
// you can use this to generate translation files or upload to a TMS / CMS
i18n.getManifest();

// clear cached translations
i18n.clear();        // all locales
i18n.clear('en');    // specific locale
```

### Lazy loading with React.lazy()

Translations load automatically for lazy-loaded components.

```tsx
import { Suspense, lazy } from 'react';

const StatsModal = lazy(() => import('./StatsModal'));

export function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StatsModal />
    </Suspense>
  );
}
```

## How it works

1. **Build time** — Babel plugin extracts all `t()` calls, maps them to chunks, strips fallbacks from production bundles
2. **Manifest** — Extracted keys with fallbacks are written to `i18n-manifest.json`
3. **SSR** — Middleware provides translations to `t()`, merging manifest fallbacks for missing keys
4. **Client** — Custom directives load only the translations needed by each chunk

The same `import { t } from '@astroscope/i18n/t'` works everywhere — bundler picks the correct implementation via conditional exports (`browser` vs `default`).

### Client bundle

Translation chunks are served as raw ICU MessageFormat strings and compiled on the browser on first use. This keeps chunk sizes minimal but includes `@messageformat/core` (~15KB gzipped) in your client bundle. Compiled messages are cached for subsequent renders.

## Configuration

### i18n.configure()

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `locales` | `string[]` | required | Supported locales |
| `defaultLocale` | `string` | first locale | Default/fallback locale |
| `fallback` | `FallbackBehavior` | `'fallback'` | Behavior when translation missing |

### FallbackBehavior

- `'fallback'` — Use the fallback string from manifest (default)
- `'key'` — Return the translation key
- `'throw'` — Throw an error
- `(key, meta) => string` — Custom function

## License

MIT
