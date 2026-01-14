import type { TranslationMeta } from '../shared/types.js';

/**
 * Extracted metadata for a single translation key
 */
export type ExtractedKey = {
  key: string;
  meta: TranslationMeta;
  file: string;
  line: number;
};

/**
 * Chunk-to-keys mapping produced by Vite plugin
 */
export type ChunkManifest = Record<string, string[]>;

/**
 * Chunk imports mapping: chunk name → array of imported chunk names that have i18n
 * All direct and indirect descendants are flattened into a single array
 */
export type ImportsManifest = Record<string, string[]>;

/**
 * Full extraction manifest
 */
export type ExtractionManifest = {
  keys: ExtractedKey[];
  chunks: ChunkManifest;
  imports: ImportsManifest;
};
