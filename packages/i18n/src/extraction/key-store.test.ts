import type { AstroIntegrationLogger } from 'astro';
import { describe, expect, test } from 'bun:test';
import { KeyStore } from './key-store.js';
import type { ExtractedKeyOccurrence } from './types.js';

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  label: 'test',
  fork: () => mockLogger,
} as unknown as AstroIntegrationLogger;

const createOccurrence = (key: string, file: string, line = 1): ExtractedKeyOccurrence => ({
  key,
  file,
  line,
  meta: { fallback: `fallback for ${key}` },
});

describe('KeyStore', () => {
  describe('addFileKeys', () => {
    test('adds keys for a new file', () => {
      const store = new KeyStore(mockLogger);
      const keys = [createOccurrence('hello', 'a.ts'), createOccurrence('world', 'a.ts')];

      store.addFileKeys('a.ts', keys);

      expect(store.extractedKeys).toHaveLength(2);
      expect(store.extractedKeys.map((k) => k.key)).toEqual(['hello', 'world']);
      expect(store.fileToKeys.get('a.ts')).toEqual(['hello', 'world']);
      expect(store.filesWithI18n.has('a.ts')).toBe(true);
    });

    test('replaces keys for existing file', () => {
      const store = new KeyStore(mockLogger);
      const oldKeys = [createOccurrence('old', 'a.ts')];
      const newKeys = [createOccurrence('new', 'a.ts')];

      store.addFileKeys('a.ts', oldKeys);
      store.addFileKeys('a.ts', newKeys);

      expect(store.extractedKeys).toHaveLength(1);
      expect(store.extractedKeys[0]?.key).toBe('new');
      expect(store.fileToKeys.get('a.ts')).toEqual(['new']);
    });

    test('handles empty keys array', () => {
      const store = new KeyStore(mockLogger);

      store.addFileKeys('a.ts', []);

      expect(store.extractedKeys).toEqual([]);
      expect(store.fileToKeys.get('a.ts')).toEqual([]);
      expect(store.filesWithI18n.has('a.ts')).toBe(true);
    });

    test('deduplicates keys within same file and collects all locations', () => {
      const store = new KeyStore(mockLogger);
      const keys = [
        createOccurrence('title', 'a.ts', 10),
        createOccurrence('description', 'a.ts', 20),
        createOccurrence('title', 'a.ts', 30), // duplicate
      ];

      store.addFileKeys('a.ts', keys);

      expect(store.extractedKeys).toHaveLength(2);
      expect(store.extractedKeys.map((k) => k.key)).toEqual(['title', 'description']);

      // title should have both locations
      const titleKey = store.extractedKeys.find((k) => k.key === 'title');
      expect(titleKey?.files).toEqual(['a.ts:10', 'a.ts:30']);

      // last occurrence's meta wins
      expect(titleKey?.meta.fallback).toBe('fallback for title');

      expect(store.fileToKeys.get('a.ts')).toEqual(['title', 'description', 'title']);
    });

    test('keeps keys from other files when replacing', () => {
      const store = new KeyStore(mockLogger);
      const keysA = [createOccurrence('a', 'a.ts')];
      const keysB = [createOccurrence('b', 'b.ts')];
      const newKeysA = [createOccurrence('a2', 'a.ts')];

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

      store.addFileKeys('a.ts', [createOccurrence('hello', 'a.ts')]);
      store.addFileKeys('b.ts', [createOccurrence('world', 'b.ts')]);

      expect(store.uniqueKeyCount).toBe(2);
    });

    test('counts same key in different files once', () => {
      const store = new KeyStore(mockLogger);

      store.addFileKeys('a.ts', [createOccurrence('shared', 'a.ts')]);
      store.addFileKeys('b.ts', [createOccurrence('shared', 'b.ts')]);

      expect(store.uniqueKeyCount).toBe(1);
    });
  });

  describe('merge', () => {
    test('merges two stores', () => {
      const store1 = new KeyStore(mockLogger);
      const store2 = new KeyStore(mockLogger);

      store1.addFileKeys('a.ts', [createOccurrence('a', 'a.ts')]);
      store2.addFileKeys('b.ts', [createOccurrence('b', 'b.ts')]);

      store1.merge(store2);

      expect(store1.extractedKeys).toHaveLength(2);
      expect(store1.fileToKeys.size).toBe(2);
      expect(store1.filesWithI18n.size).toBe(2);
    });

    test('overwrites fileToKeys on merge', () => {
      const store1 = new KeyStore(mockLogger);
      const store2 = new KeyStore(mockLogger);

      store1.addFileKeys('a.ts', [createOccurrence('old', 'a.ts')]);
      store2.addFileKeys('a.ts', [createOccurrence('new', 'a.ts')]);

      store1.merge(store2);

      expect(store1.fileToKeys.get('a.ts')).toEqual(['new']);
    });

    test('merges same key from different files into one with multiple locations', () => {
      const store1 = new KeyStore(mockLogger);
      const store2 = new KeyStore(mockLogger);

      store1.addFileKeys('a.ts', [createOccurrence('shared', 'a.ts', 10)]);
      store2.addFileKeys('b.ts', [createOccurrence('shared', 'b.ts', 20)]);

      store1.merge(store2);

      expect(store1.extractedKeys).toHaveLength(1);
      expect(store1.extractedKeys[0]?.files).toEqual(['a.ts:10', 'b.ts:20']);
    });
  });
});
