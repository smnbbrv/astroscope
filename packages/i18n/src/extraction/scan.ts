import fs from 'node:fs';
import type { AstroIntegrationLogger } from 'astro';
import { glob } from 'glob';
import { ALL_EXTENSIONS, extractKeysFromFile } from './extract.js';
import { KeyStore } from './key-store.js';

const GLOB_PATTERN = `src/**/*.{${ALL_EXTENSIONS.map((e) => e.slice(1)).join(',')}}`;

/**
 * Compile .astro file to JS using Astro's compiler.
 * Returns the compiled code or null if compilation fails.
 */
async function compileAstro(code: string, filename: string): Promise<string | null> {
  try {
    const { transform } = await import('@astrojs/compiler');
    const result = await transform(code, { filename });

    return result.code;
  } catch {
    return null;
  }
}

/**
 * Eagerly scan all source files for t() calls.
 * Used in dev mode to extract all keys upfront, instead of waiting for
 * Vite's lazy transform hook to process files on-demand.
 */
export async function scan(projectRoot: string, logger: AstroIntegrationLogger): Promise<KeyStore> {
  const store = new KeyStore(logger);

  const files = await glob(GLOB_PATTERN, {
    cwd: projectRoot,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  const results = await Promise.all(
    files.map(async (file) => {
      let code = await fs.promises.readFile(file, 'utf-8');

      // quick check: skip files without i18n translate import
      if (!code.includes('@astroscope/i18n/translate')) {
        return { file, keys: null };
      }

      // compile .astro files first
      if (file.endsWith('.astro')) {
        const compiled = await compileAstro(code, file);

        if (!compiled) {
          return { file, keys: null };
        }

        code = compiled;
      }

      // extract keys
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
