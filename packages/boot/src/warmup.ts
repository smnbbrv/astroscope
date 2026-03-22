import fs from 'node:fs';
import path from 'node:path';

/**
 * Default warmup glob patterns covering Astro pages and middleware.
 */
export const WARMUP_PAGE_MODULES = ['src/pages/**/*.{astro,ts,tsx,js,jsx,md,mdx}'];

export const WARMUP_MIDDLEWARE_MODULES = ['src/middleware.{ts,js}', 'src/middleware/index.{ts,js}'];

/**
 * All default warmup glob patterns.
 */
export const WARMUP_MODULES = [...WARMUP_PAGE_MODULES, ...WARMUP_MIDDLEWARE_MODULES];

export const VIRTUAL_MODULE_ID = 'virtual:@astroscope/boot/warmup';
export const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

export async function resolveWarmupFiles(patterns: string[], projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
    for await (const entry of fs.promises.glob(pattern, {
      cwd: projectRoot,
      exclude: (name) => name === 'node_modules',
    })) {
      files.push(path.resolve(projectRoot, entry));
    }
  }

  return [...new Set(files)];
}

export function generateWarmupCode(files: string[]): string {
  if (files.length === 0) return '';

  return `${files.map((f) => `import ${JSON.stringify(f)};`).join('\n')}\n`;
}
