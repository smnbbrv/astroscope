import type { AstroIntegrationLogger } from 'astro';
import type { ExtractedKey } from './types.js';

/**
 * Store for extracted i18n keys.
 * Handles deduplication and provides utilities.
 */
export class KeyStore {
  readonly extractedKeys: ExtractedKey[] = [];
  readonly fileToKeys = new Map<string, string[]>();
  readonly filesWithI18n = new Set<string>();

  constructor(private readonly logger: AstroIntegrationLogger) {}

  /**
   * Add keys for a file, replacing any existing keys for that file.
   */
  addFileKeys(filename: string, keys: ExtractedKey[]): void {
    const oldKeys = this.fileToKeys.get(filename);
    const newKeyStrings = keys.map((k) => k.key);

    // log key changes on HMR
    if (oldKeys) {
      const added = newKeyStrings.filter((k) => !oldKeys.includes(k));
      const removed = oldKeys.filter((k) => !newKeyStrings.includes(k));
      const file = filename.split('/').pop();

      if (added.length > 0 || removed.length > 0) {
        const parts: string[] = [];

        if (added.length > 0) parts.push(`+${added.length}`);
        if (removed.length > 0) parts.push(`-${removed.length}`);

        this.logger.info(`hmr: ${parts.join(' ')} key(s) in ${file}`);
      }
    }

    // remove old keys for this file (if any)
    if (oldKeys) {
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

    this.fileToKeys.set(filename, newKeyStrings);
  }

  /**
   * Get count of unique keys.
   */
  get uniqueKeyCount(): number {
    return new Set(this.extractedKeys.map((k) => k.key)).size;
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
