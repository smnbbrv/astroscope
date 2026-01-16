import type { ExtractedKey } from './types.js';

/**
 * Store for extracted i18n keys.
 * Handles deduplication and provides utilities.
 */
export class KeyStore {
  readonly extractedKeys: ExtractedKey[] = [];
  readonly fileToKeys = new Map<string, string[]>();
  readonly filesWithI18n = new Set<string>();

  /**
   * Add keys for a file, replacing any existing keys for that file.
   */
  addFileKeys(filename: string, keys: ExtractedKey[]): void {
    // remove old keys for this file (if any)
    if (this.fileToKeys.has(filename)) {
      for (let i = this.extractedKeys.length - 1; i >= 0; i--) {
        if (this.extractedKeys[i]?.file === filename) {
          this.extractedKeys.splice(i, 1);
        }
      }
    }

    this.filesWithI18n.add(filename);

    if (keys.length > 0) {
      this.extractedKeys.push(...keys);
    }

    this.fileToKeys.set(
      filename,
      keys.map((k) => k.key),
    );
  }

  /**
   * Get count of unique keys.
   */
  get uniqueKeyCount(): number {
    return new Set(this.extractedKeys.map((k) => k.key)).size;
  }

  /**
   * Get count of duplicate keys.
   */
  get duplicateCount(): number {
    return this.extractedKeys.length - this.uniqueKeyCount;
  }

  /**
   * Merge another store's data into this one.
   */
  merge(other: KeyStore): void {
    for (const [file, keys] of other.fileToKeys) {
      this.fileToKeys.set(file, keys);
    }

    for (const file of other.filesWithI18n) {
      this.filesWithI18n.add(file);
    }

    this.extractedKeys.push(...other.extractedKeys);
  }
}
