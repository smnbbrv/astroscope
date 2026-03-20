import fs from 'node:fs';
import path from 'node:path';
import type { Rollup } from 'vite';

const WARMUP_MANIFEST_FILE = 'warmup-manifest.json';

const MIDDLEWARE_VIRTUAL_ID = '\0virtual:astro:middleware';

export interface WarmupModules {
  pageModules: string[];
  middlewarePath: string | null;
}

export function collectWarmupModules(bundle: Rollup.OutputBundle): WarmupModules {
  const pageModules: string[] = [];
  let middlewarePath: string | null = null;

  // identify middleware by its virtual module ID
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type === 'chunk' && chunk.facadeModuleId === MIDDLEWARE_VIRTUAL_ID) {
      middlewarePath = fileName;
      break;
    }
  }

  // find pages via the server manifest chunk's dynamic imports
  const entryChunk = bundle['entry.mjs'];

  if (entryChunk?.type !== 'chunk') {
    return { pageModules, middlewarePath };
  }

  // the server manifest chunk has the most dynamic imports (pageMap, middleware, etc.)
  let serverChunk: Rollup.OutputChunk | null = null;

  for (const imp of entryChunk.imports) {
    const chunk = bundle[imp];

    if (chunk?.type !== 'chunk') continue;

    if (!serverChunk || chunk.dynamicImports.length > serverChunk.dynamicImports.length) {
      serverChunk = chunk;
    }
  }

  if (serverChunk) {
    const skip = new Set([middlewarePath]);

    for (const dynImport of serverChunk.dynamicImports) {
      if (skip.has(dynImport)) continue;

      const chunk = bundle[dynImport];

      if (chunk?.type !== 'chunk') continue;

      // skip virtual astro infrastructure and noop stubs (but keep pages)
      const facadeId = chunk.facadeModuleId ?? '';

      if (
        facadeId.includes('noop-') ||
        facadeId.includes('virtual:astro:server-island') ||
        facadeId.includes('virtual:astro:session')
      ) {
        continue;
      }

      pageModules.push(dynImport);
    }
  }

  return { pageModules, middlewarePath };
}

export function writeWarmupManifest(
  outDir: string,
  { pageModules, middlewarePath }: WarmupModules,
  logger: { info(msg: string): void },
): void {
  const modules: string[] = [];

  if (middlewarePath) {
    modules.push(`./${middlewarePath}`);
  }

  for (const page of pageModules) {
    modules.push(`./${page}`);
  }

  const manifestPath = path.join(outDir, 'chunks', WARMUP_MANIFEST_FILE);

  fs.writeFileSync(manifestPath, JSON.stringify({ modules }));

  logger.info(`generated warmup for ${pageModules.length} pages`);
}
