# @astroscope/excludes

Shared exclude patterns for Astro middleware packages.

## Installation

```bash
npm install @astroscope/excludes
```

## Usage

```ts
import {
  RECOMMENDED_EXCLUDES,
  DEV_EXCLUDES,
  ASTRO_STATIC_EXCLUDES,
  STATIC_EXCLUDES,
  shouldExclude,
} from '@astroscope/excludes';

if (shouldExclude(ctx, RECOMMENDED_EXCLUDES)) {
  return next();
}

const excludes = [
  ...RECOMMENDED_EXCLUDES,
  { exact: '/health' },
  { prefix: '/api/internal/' },
  { pattern: /\.map$/ },
];

if (shouldExclude(ctx, (ctx) => ctx.url.pathname.startsWith('/admin'))) {
  return next();
}
```

## Exclude Pattern Sets

### `RECOMMENDED_EXCLUDES`

All recommended excludes combined. Use this as a starting point.

### `DEV_EXCLUDES`

Vite/Astro dev server paths (only relevant in development):
- `/@id/*`
- `/@fs/*`
- `/@vite/*`
- `/src/*`
- `/node_modules/*`

### `ASTRO_STATIC_EXCLUDES`

Astro internal paths:
- `/_astro/*` - bundled assets
- `/_image*` - image optimization

### `STATIC_EXCLUDES`

Common static files:
- `/favicon.ico`
- `/robots.txt`
- `/sitemap.xml`
- `/browserconfig.xml`
- `/manifest.json`
- `/manifest.webmanifest`

## Pattern Types

```ts
type ExcludePattern =
  | { exact: string }   // Exact match
  | { prefix: string }  // Starts with
  | { pattern: RegExp } // Regex match
```

## License

MIT
