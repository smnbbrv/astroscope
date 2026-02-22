import fs from 'node:fs';
import path from 'node:path';
import type { Rollup } from 'vite';

const WARMUP_MANIFEST_FILE = 'warmup-manifest.json';

export interface WarmupModules {
  pageModules: string[];
  middlewarePath: string | null;
}

export function collectWarmupModules(bundle: Rollup.OutputBundle): WarmupModules {
  const pageModules: string[] = [];
  let middlewarePath: string | null = null;

  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type !== 'chunk') continue;

    // collect page modules
    if (fileName.startsWith('pages/') && fileName.endsWith('.mjs')) {
      pageModules.push(fileName);
    }

    // find middleware (both real and noop)
    if (fileName.includes('_astro-internal_middleware') || fileName.includes('_noop-middleware')) {
      middlewarePath = fileName;
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
