import fs from 'node:fs';
import type { AstroIntegrationLogger } from 'astro';
import { glob } from 'glob';
import { BABEL_EXTENSIONS, extractKeysFromFile } from './extract.js';
import { KeyStore } from './key-store.js';

const GLOB_PATTERN = `src/**/*.{${BABEL_EXTENSIONS.map((e) => e.slice(1)).join(',')}}`;

/**
 * Eagerly scan all source files for t() calls.
 * Used in dev mode to extract all keys upfront, instead of waiting for
 * Vite's lazy transform hook to process files on-demand.
 */
export async function scan(projectRoot: string, logger: AstroIntegrationLogger): Promise<KeyStore> {
  const store = new KeyStore();

  // only scan files Babel can parse directly
  // .astro files need Astro's compiler first and are handled by the transform hook
  const files = await glob(GLOB_PATTERN, {
    cwd: projectRoot,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  const results = await Promise.all(
    files.map(async (file) => {
      const code = await fs.promises.readFile(file, 'utf-8');

      // quick check: skip files without i18n import
      if (!code.includes('@astroscope/i18n/t')) {
        return { file, keys: null };
      }

      const result = await extractKeysFromFile({
        filename: file,
        code,
        logger,
        stripFallbacks: false,
      });

      return { file, keys: result.keys.length > 0 ? result.keys : null };
    }),
  );

  for (const { file, keys } of results) {
    if (keys) {
      store.addFileKeys(file, keys);
    }
  }

  return store;
}
