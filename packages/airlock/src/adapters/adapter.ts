import type { SchemaGenResult } from '../extractor.js';

/**
 * framework adapter interface for extracting component prop schemas.
 *
 * each supported framework (React, Vue, Svelte, etc.) implements this
 * to teach airlock how to extract prop types from its component files.
 */
export interface FrameworkAdapter {
  /** human-readable name for debug logging */
  readonly name: string;

  /** file extensions this adapter handles (e.g. ['.tsx', '.ts', '.jsx', '.js']) */
  readonly extensions: string[];

  /**
   * check whether this adapter can handle the given file.
   */
  canHandle(filePath: string): boolean;

  /**
   * extract a Zod schema for a component's props.
   *
   * @param filePath - absolute path to the component file
   * @param exportName - the export to extract ('default' or named)
   * @returns schema result, null for ALLOW_ALL, or undefined if extraction failed
   */
  extractSchema(filePath: string, exportName: string): SchemaGenResult | null | undefined;

  /**
   * resolve an import specifier to an absolute file path.
   */
  resolveModulePath(importSpecifier: string, fromFile: string): string | undefined;

  /**
   * invalidate any cached state for a changed file.
   */
  invalidate(filePath: string): void;
}
