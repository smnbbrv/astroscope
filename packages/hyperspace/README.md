# @astroscope/hyperspace

> **Note:** This package is in active development. APIs may change between versions.

Pre-compressed in-memory static file serving for Astro SSR. Save space, serve from hyperspace.

CDNs and reverse proxies often compress on the fly with conservative settings — or sometimes not at all. Hyperspace pre-compresses static files at build time with maximum brotli and gzip quality, then serves them from memory at startup. The result is smaller responses than most CDNs produce in real-time, with zero per-request CPU or disk overhead. Works great standalone or behind a proxy.

## Examples

See the [demo/hyperspace](../../demo/hyperspace) directory for a working example.

## Installation

```bash
npm install @astroscope/hyperspace
```

## Usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import hyperspace from '@astroscope/hyperspace';

export default defineConfig({
  output: 'server',
  integrations: [hyperspace()],
});
```

That's it. No configuration needed.

## What it does

### Build time

After Astro finishes building, hyperspace walks `dist/client/` and compresses every text-based static file:

- **Brotli** at maximum quality (level 11)
- **Gzip** at level 9
- Skips variants where compressed size >= original size
- Writes `.br` and `.gz` files next to originals

Compressible extensions: `.html`, `.css`, `.js`, `.mjs`, `.json`, `.xml`, `.svg`, `.txt`, `.wasm`, `.map`, `.webmanifest`, `.xhtml`

### Runtime

On server startup, the middleware loads all compressible files and their pre-compressed variants. When a request comes in, it:

1. Checks if the request path matches a cached file
2. Negotiates encoding from `Accept-Encoding` (prefers br > gzip > raw)
3. Returns the best variant from memory with correct headers
4. Falls through to Astro for non-static requests

### Headers

- `Content-Encoding: br` or `gzip` when serving compressed
- `Vary: accept-encoding` on all cached responses
- `Cache-Control: public, immutable, max-age=31536000` for `/_astro/` files (hashed filenames)

## Memory footprint

Typical memory usage is modest:

| Site size (raw) | Estimated memory (raw + br + gz) |
| --------------- | -------------------------------- |
| 400 KB          | ~600 KB                          |
| 3 MB            | ~5 MB                            |
| 10 MB           | ~15 MB                           |

Only text-based files are loaded. Images, fonts, and other binaries are left to Astro's default static file handling.

## Dev mode

In development, there are no compressed files — the middleware gracefully no-ops and passes all requests through to Astro.

## Behind nginx

Since hyperspace sets `Content-Encoding` and `Vary` headers, nginx needs to cache separate variants per encoding. A minimal reverse proxy config:

```nginx
proxy_cache_path /tmp/astro-cache levels=1:2 keys_zone=astro:10m inactive=60m;

server {
    listen 443 ssl http2;

    location / {
        proxy_pass http://localhost:4321;
        proxy_cache astro;
        proxy_cache_key $host$uri$upstream_http_content_encoding;
        proxy_cache_valid 200 304 10m;
    }
}
```

The key part is `proxy_cache_key` — without `$upstream_http_content_encoding`, nginx can cache a brotli response and serve it to clients that only support gzip.

## Requirements

- Node.js runtime
- SSR output mode (`output: "server"`)

## License

MIT
