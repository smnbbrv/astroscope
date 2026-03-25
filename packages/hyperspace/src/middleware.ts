import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { MiddlewareHandler } from 'astro';

import { MIME_TYPES } from './mime.js';
import type { CachedFile } from './types.js';

function negotiateEncoding(acceptEncoding: string | null, file: CachedFile): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null;
  if (file.br && acceptEncoding.includes('br')) return 'br';
  if (file.gz && acceptEncoding.includes('gzip')) return 'gzip';

  return null;
}

async function loadAll(staticDir: string): Promise<Map<string, CachedFile>> {
  const map = new Map<string, CachedFile>();

  try {
    const entries = await readdir(staticDir, { withFileTypes: true, recursive: true });
    const files = entries.filter((e) => e.isFile() && !e.name.endsWith('.br') && !e.name.endsWith('.gz'));

    await Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(entry.parentPath, entry.name);
        const ext = path.extname(entry.name);
        const type = MIME_TYPES.get(ext) ?? 'application/octet-stream';

        const urlPath = `/${path.relative(staticDir, filePath).split(path.sep).join('/')}`;
        const raw = await readFile(filePath);
        const etag = `"${createHash('md5').update(raw).digest('hex')}"`;

        const cached: CachedFile = { raw, type, etag };

        // load pre-compressed variants if they exist
        try {
          cached.br = await readFile(`${filePath}.br`);
        } catch {
          // no brotli variant
        }

        try {
          cached.gz = await readFile(`${filePath}.gz`);
        } catch {
          // no gzip variant
        }

        map.set(urlPath, cached);
      }),
    );
  } catch {
    // no static dir — dev mode or static output
  }

  return map;
}

export function createHyperspaceMiddleware(staticDir: string): MiddlewareHandler {
  const ready = loadAll(staticDir);

  return async (ctx, next) => {
    const files = await ready;
    const file = files.get(ctx.url.pathname);

    if (!file) {
      return next();
    }

    // conditional request
    if (ctx.request.headers.get('if-none-match') === file.etag) {
      return new Response(null, { status: 304, headers: { etag: file.etag } });
    }

    const encoding = negotiateEncoding(ctx.request.headers.get('accept-encoding'), file);
    const buf = encoding === 'br' ? file.br! : encoding === 'gzip' ? file.gz! : file.raw;
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

    const headers = new Headers({
      'content-type': file.type,
      'content-length': String(buf.byteLength),
      vary: 'accept-encoding',
      etag: file.etag,
    });

    if (encoding) {
      headers.set('content-encoding', encoding);
    }

    if (ctx.url.pathname.startsWith('/_astro/')) {
      headers.set('cache-control', 'public, immutable, max-age=31536000');
    }

    return new Response(body as unknown as BodyInit, { status: 200, headers });
  };
}
