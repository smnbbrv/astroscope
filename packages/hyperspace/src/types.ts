export type ServeMode = 'compressible' | 'all';

export interface HyperspaceOptions {
  /** which files to serve from memory
   * @default 'compressible' */
  serve?: ServeMode | undefined;
  /** memory budget in bytes — logs a warning when total in-memory size exceeds this
   * @default 10_485_760 (10 MB) */
  budget?: number | undefined;
}

export interface CachedFile {
  raw: Buffer;
  br?: Buffer | undefined;
  gz?: Buffer | undefined;
  type: string;
  etag: string;
}
