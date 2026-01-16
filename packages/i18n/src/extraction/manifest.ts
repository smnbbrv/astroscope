/**
 * Manifest state management for i18n extraction
 *
 * Separated from vite-plugin to avoid bundling Babel at runtime
 */

import path from 'node:path';
import type { ChunkManifest, ExtractedKey, ExtractionManifest, ImportsManifest } from './types.js';

// global state for dev mode live access via globalThis
// this allows the virtual module to access current extraction data
// even after initial import (since dev mode transforms are on-demand)
const I18N_MANIFEST_GLOBAL_KEY = '__astroscope_i18n_manifest__';

export type GlobalI18nState = {
  // actual manifest data
  extractedKeys: ExtractedKey[];
  chunkManifest: ChunkManifest;
  importsManifest: ImportsManifest;

  // project root for relative paths
  projectRoot: string;
};

export function getGlobalState(): GlobalI18nState {
  const g = globalThis as Record<string, unknown>;

  // in dev mode, initialize global state if not present
  if (!g[I18N_MANIFEST_GLOBAL_KEY]) {
    g[I18N_MANIFEST_GLOBAL_KEY] = {
      extractedKeys: [],
      chunkManifest: {},
      importsManifest: {},
      projectRoot: '',
    };
  }

  return g[I18N_MANIFEST_GLOBAL_KEY] as GlobalI18nState;
}

/**
 * Get the current extraction manifest (for dev mode live access).
 * This bypasses Vite's module caching to return fresh data.
 */
export function getManifest(): ExtractionManifest {
  const state = getGlobalState();

  const keys = state.extractedKeys.map((key) => ({
    ...key,
    // make file paths relative to project root for better readability
    // and avoiding leaking absolute paths from dev or ci environments
    files: key.files.map((fileLocation) => {
      const [filePath, line] = fileLocation.split(':');

      if (!filePath) return fileLocation;

      const relativePath = state.projectRoot ? path.relative(state.projectRoot, filePath) : filePath;

      return line ? `${relativePath}:${line}` : relativePath;
    }),
  }));

  return { keys, chunks: state.chunkManifest, imports: state.importsManifest };
}
