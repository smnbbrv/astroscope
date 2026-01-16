import type { TranslationMeta } from '../shared/types.js';

/**
 * Single occurrence of a translation key (used during extraction)
 */
export type ExtractedKeyOccurrence = {
  key: string;
  meta: TranslationMeta;
  file: string;
  line: number;
};

/**
 * Deduplicated translation key with all file locations (used in manifest)
 */
export type ExtractedKey = {
  key: string;
  meta: TranslationMeta;
  /** All locations where this key is used (file:line format) */
  files: string[];
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
