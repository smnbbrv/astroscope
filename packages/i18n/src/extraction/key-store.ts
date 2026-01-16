import type { AstroIntegrationLogger } from 'astro';
import type { ExtractedKey, ExtractedKeyOccurrence } from './types.js';

/**
 * Store for extracted i18n keys.
 * Stores occurrences and produces deduplicated keys with all file locations.
 */
export class KeyStore {
  /** All key occurrences (may have duplicates) */
  private readonly occurrences: ExtractedKeyOccurrence[] = [];

  readonly fileToKeys = new Map<string, string[]>();
  readonly filesWithI18n = new Set<string>();

  constructor(private readonly logger: AstroIntegrationLogger) {}

  /**
   * Add key occurrences for a file, replacing any existing occurrences for that file.
   */
  addFileKeys(filename: string, keys: ExtractedKeyOccurrence[]): void {
    const newKeyStrings = keys.map((k) => k.key);
    const oldKeys = this.fileToKeys.get(filename);

    // log key changes on HMR
    if (oldKeys) {
      const uniqueNew = [...new Set(newKeyStrings)];
      const uniqueOld = [...new Set(oldKeys)];
      const added = uniqueNew.filter((k) => !uniqueOld.includes(k));
      const removed = uniqueOld.filter((k) => !uniqueNew.includes(k));
      const file = filename.split('/').pop();

      if (added.length > 0 || removed.length > 0) {
        const parts: string[] = [];

        if (added.length > 0) parts.push(`+${added.length}`);
        if (removed.length > 0) parts.push(`-${removed.length}`);

        this.logger.info(`hmr: ${parts.join(' ')} key(s) in ${file}`);
      }
    }

    // remove old occurrences for this file (if any)
    if (oldKeys) {
      for (let i = this.occurrences.length - 1; i >= 0; i--) {
        if (this.occurrences[i]?.file === filename) {
          this.occurrences.splice(i, 1);
        }
      }
    }

    this.filesWithI18n.add(filename);

    if (keys.length > 0) {
      this.occurrences.push(...keys);
    }

    this.fileToKeys.set(filename, newKeyStrings);
  }

  /**
   * Get deduplicated keys with all file locations merged.
   * Last occurrence's meta wins for each key.
   */
  get extractedKeys(): ExtractedKey[] {
    const keyMap = new Map<string, ExtractedKey>();

    for (const occurrence of this.occurrences) {
      const existing = keyMap.get(occurrence.key);
      const fileLocation = `${occurrence.file}:${occurrence.line}`;

      if (existing) {
        // add file location if not already present
        if (!existing.files.includes(fileLocation)) {
          existing.files.push(fileLocation);
        }

        // update meta (last one wins)
        existing.meta = occurrence.meta;
      } else {
        keyMap.set(occurrence.key, {
          key: occurrence.key,
          meta: occurrence.meta,
          files: [fileLocation],
        });
      }
    }

    return Array.from(keyMap.values());
  }

  /**
   * Get count of unique keys.
   */
  get uniqueKeyCount(): number {
    return new Set(this.occurrences.map((k) => k.key)).size;
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

    this.occurrences.push(...other.occurrences);
  }

  /**
   * Internal access to occurrences (for merge)
   */
  get occurrencesList(): ExtractedKeyOccurrence[] {
    return this.occurrences;
  }
}
