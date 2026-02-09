import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { WarmupResult } from './types.js';

declare global {
  var __astroscope_server_url: string | undefined;
}

const WARMUP_MANIFEST_FILE = 'warmup-manifest.json';

function isDevMode(): boolean {
  return Boolean(import.meta.env?.['DEV']);
}

interface ManifestResult {
  modules: string[];
  serverDir: string;
}

function loadManifest(): ManifestResult | null {
  // in dev mode, return null
  if (isDevMode()) {
    return null;
  }

  const serverUrl = globalThis.__astroscope_server_url;

  if (!serverUrl) {
    return null;
  }

  // entry.mjs is at dist/server/entry.mjs, manifest is at dist/server/chunks/warmup-manifest.json
  const serverDir = dirname(fileURLToPath(serverUrl));
  const manifestPath = join(serverDir, 'chunks', WARMUP_MANIFEST_FILE);

  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { modules?: string[] };

  return {
    modules: manifest.modules ?? [],
    serverDir,
  };
}

/**
 * Warms up V8 by importing all page modules and middleware.
 *
 * In development mode, this is a no-op that returns empty results.
 * In production, reads the warmup manifest and imports all discovered modules.
 *
 * @example
 * ```ts
 * import { warmup } from '@astroscope/boot/warmup';
 *
 * const result = await warmup();
 * console.log(`warmed up ${result.success.length} modules`);
 * ```
 */
export async function warmup(): Promise<WarmupResult> {
  const manifest = loadManifest();

  if (!manifest || manifest.modules.length === 0) {
    return { success: [], failed: [], duration: 0 };
  }

  const { modules, serverDir } = manifest;
  const start = Date.now();

  // resolve module paths relative to the server directory and convert to file:// URLs
  const resolvedModules = modules.map((mod) => {
    const absolutePath = resolve(serverDir, mod);

    return pathToFileURL(absolutePath).href;
  });

  const results = await Promise.allSettled(resolvedModules.map((mod) => import(/* @vite-ignore */ mod)));

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
