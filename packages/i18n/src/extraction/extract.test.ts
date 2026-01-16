import type { AstroIntegrationLogger } from 'astro';
import { describe, expect, test } from 'bun:test';
import { extractKeysFromFile } from './extract.js';

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  label: 'test',
  fork: () => mockLogger,
} as unknown as AstroIntegrationLogger;

describe('extractKeysFromFile', () => {
  describe('TypeScript files', () => {
    test('extracts simple t() call with string fallback', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('hello', 'Hello World');
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.key).toBe('hello');
      expect(result.keys[0]?.meta.fallback).toBe('Hello World');
    });

    test('extracts t() call with object meta', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('greeting', { fallback: 'Hello {name}', description: 'Greeting message' });
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.key).toBe('greeting');
      expect(result.keys[0]?.meta.fallback).toBe('Hello {name}');
      expect(result.keys[0]?.meta.description).toBe('Greeting message');
    });

    test('extracts multiple t() calls', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          const a = t('key1', 'Fallback 1');
          const b = t('key2', 'Fallback 2');
          return a + b;
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(2);
      expect(result.keys.map((k) => k.key)).toEqual(['key1', 'key2']);
    });

    test('extracts t() with variables definition', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('cart.items', {
            fallback: '{count, plural, one {# item} other {# items}}',
            variables: {
              count: { fallback: '0', description: 'Number of items' }
            }
          });
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.meta.variables?.['count']).toEqual({
        fallback: '0',
        description: 'Number of items',
      });
    });

    test('ignores non-t() calls', async () => {
      const code = `
        function render() {
          return otherFunction('key', 'value');
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(0);
    });
  });

  describe('TSX files', () => {
    test('extracts t() from JSX', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        export function Component() {
          return <div>{t('title', 'Page Title')}</div>;
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.tsx',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.key).toBe('title');
    });
  });

  describe('stripFallbacks', () => {
    test('strips fallback when enabled', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('hello', 'Hello World');
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
        stripFallbacks: true,
      });

      expect(result.code).toContain("t('hello')");
      expect(result.code).not.toContain('Hello World');
    });

    test('strips fallback but keeps values argument', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('hello', 'Hello {name}', { name: 'World' });
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
        stripFallbacks: true,
      });

      expect(result.code).toContain("t('hello', undefined,");
      expect(result.code).toContain('name:');
    });

    test('does not strip fallback when disabled', async () => {
      const code = `
        import { t } from '@astroscope/i18n/t';
        function render() {
          return t('hello', 'Hello World');
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'test.ts',
        code,
        logger: mockLogger,
        stripFallbacks: false,
      });

      // code is still returned but fallback is preserved
      expect(result.code).toContain('Hello World');
    });
  });

  describe('compiled Astro output', () => {
    test('extracts from code that looks like compiled Astro', async () => {
      // simulates what Astro compiler outputs - the render function
      const code = `
        import { t } from '@astroscope/i18n/t';
        function $$render() {
          const $$result = t('page.title', 'Welcome');
          return '<h1>' + $$result + '</h1>';
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'Page.astro',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.key).toBe('page.title');
    });

    test('extracts from Astro file with TypeScript type imports', async () => {
      // .astro files use TypeScript by default and can have type imports
      const code = `
        import { t } from '@astroscope/i18n/t';
        import { type SomeType, someFunction } from './utils';
        function $$render() {
          const $$result = t('cart.title', 'Shopping Cart');
          return '<h1>' + $$result + '</h1>';
        }
      `;

      const result = await extractKeysFromFile({
        filename: 'cart.astro',
        code,
        logger: mockLogger,
      });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]?.key).toBe('cart.title');
    });
  });
});
