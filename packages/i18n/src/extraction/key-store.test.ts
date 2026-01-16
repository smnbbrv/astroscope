import type { AstroIntegrationLogger } from 'astro';
import { describe, expect, test } from 'bun:test';
import { KeyStore } from './key-store.js';
import type { ExtractedKey } from './types.js';

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  label: 'test',
  fork: () => mockLogger,
} as unknown as AstroIntegrationLogger;

const createKey = (key: string, file: string, line = 1): ExtractedKey => ({
  key,
  file,
  line,
  meta: { fallback: `fallback for ${key}` },
});

describe('KeyStore', () => {
  describe('addFileKeys', () => {
    test('adds keys for a new file', () => {
      const store = new KeyStore(mockLogger);
      const keys = [createKey('hello', 'a.ts'), createKey('world', 'a.ts')];

      store.addFileKeys('a.ts', keys);

      expect(store.extractedKeys).toEqual(keys);
      expect(store.fileToKeys.get('a.ts')).toEqual(['hello', 'world']);
      expect(store.filesWithI18n.has('a.ts')).toBe(true);
    });

    test('replaces keys for existing file', () => {
      const store = new KeyStore(mockLogger);
      const oldKeys = [createKey('old', 'a.ts')];
      const newKeys = [createKey('new', 'a.ts')];

      store.addFileKeys('a.ts', oldKeys);
      store.addFileKeys('a.ts', newKeys);

      expect(store.extractedKeys).toEqual(newKeys);
      expect(store.fileToKeys.get('a.ts')).toEqual(['new']);
    });

    test('handles empty keys array', () => {
      const store = new KeyStore(mockLogger);

      store.addFileKeys('a.ts', []);

      expect(store.extractedKeys).toEqual([]);
      expect(store.fileToKeys.get('a.ts')).toEqual([]);
      expect(store.filesWithI18n.has('a.ts')).toBe(true);
    });

    test('keeps keys from other files when replacing', () => {
      const store = new KeyStore(mockLogger);
      const keysA = [createKey('a', 'a.ts')];
      const keysB = [createKey('b', 'b.ts')];
      const newKeysA = [createKey('a2', 'a.ts')];

      store.addFileKeys('a.ts', keysA);
      store.addFileKeys('b.ts', keysB);
      store.addFileKeys('a.ts', newKeysA);

      expect(store.extractedKeys).toHaveLength(2);
      expect(store.extractedKeys.map((k) => k.key)).toEqual(['b', 'a2']);
    });
  });

  describe('uniqueKeyCount', () => {
    test('counts unique keys', () => {
      const store = new KeyStore(mockLogger);

      store.addFileKeys('a.ts', [createKey('hello', 'a.ts')]);
      store.addFileKeys('b.ts', [createKey('world', 'b.ts')]);

      expect(store.uniqueKeyCount).toBe(2);
    });

    test('counts same key in different files once', () => {
      const store = new KeyStore(mockLogger);

      store.addFileKeys('a.ts', [createKey('shared', 'a.ts')]);
      store.addFileKeys('b.ts', [createKey('shared', 'b.ts')]);

      expect(store.uniqueKeyCount).toBe(1);
    });
  });

  describe('merge', () => {
    test('merges two stores', () => {
      const store1 = new KeyStore(mockLogger);
      const store2 = new KeyStore(mockLogger);

      store1.addFileKeys('a.ts', [createKey('a', 'a.ts')]);
      store2.addFileKeys('b.ts', [createKey('b', 'b.ts')]);

      store1.merge(store2);

      expect(store1.extractedKeys).toHaveLength(2);
      expect(store1.fileToKeys.size).toBe(2);
      expect(store1.filesWithI18n.size).toBe(2);
    });

    test('overwrites fileToKeys on merge', () => {
      const store1 = new KeyStore(mockLogger);
      const store2 = new KeyStore(mockLogger);

      store1.addFileKeys('a.ts', [createKey('old', 'a.ts')]);
      store2.addFileKeys('a.ts', [createKey('new', 'a.ts')]);

      store1.merge(store2);

      expect(store1.fileToKeys.get('a.ts')).toEqual(['new']);
    });
  });
});
