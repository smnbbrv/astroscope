import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WarmupResult } from './types.js';

const WARMUP_MANIFEST_FILE = 'warmup-manifest.json';

function isDevMode(): boolean {
  return Boolean(import.meta.env?.['DEV']);
}

function loadModules(): string[] {
  // in dev mode or when manifest doesn't exist, return empty
  if (isDevMode()) {
    return [];
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(readFileSync(join(__dirname, WARMUP_MANIFEST_FILE), 'utf-8')) as { modules?: string[] };

  return manifest.modules ?? [];
}

/**
 * Warms up V8 by importing all page modules and middleware.
 *
 * In development mode, this is a no-op that returns empty results.
 * In production, reads the warmup manifest and imports all discovered modules.
 */
export async function warmup(): Promise<WarmupResult> {
  const modules = loadModules();

  if (isDevMode() || modules.length === 0) {
    return { success: [], failed: [], duration: 0 };
  }

  const start = Date.now();
  const results = await Promise.allSettled(modules.map((mod) => import(mod)));

  const success: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    if (results[i]!.status === 'fulfilled') {
      success.push(modules[i]!);
    } else {
      failed.push(modules[i]!);
    }
  }

  return { success, failed, duration: Date.now() - start };
}

export type { WarmupResult };
