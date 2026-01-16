import { describe, expect, test } from 'bun:test';
import { buildI18nChunkUrl, chunkIdToName, componentUrlToChunkName } from './url.js';

describe('chunkIdToName', () => {
  test('strips _astro/ prefix', () => {
    expect(chunkIdToName('_astro/Cart.C_sxtxbl')).toBe('Cart.C_sxtxbl');
  });

  test('returns unchanged if no prefix', () => {
    expect(chunkIdToName('Cart.C_sxtxbl')).toBe('Cart.C_sxtxbl');
  });
});

describe('componentUrlToChunkName', () => {
  test('strips /_astro/ prefix and .js extension', () => {
    expect(componentUrlToChunkName('/_astro/Cart.C_sxtxbl.js')).toBe('Cart.C_sxtxbl');
  });

  test('handles path without prefix', () => {
    expect(componentUrlToChunkName('/Cart.C_sxtxbl.js')).toBe('/Cart.C_sxtxbl');
  });
});

describe('buildI18nChunkUrl', () => {
  test('builds correct URL with _astro prefix', () => {
    expect(buildI18nChunkUrl('en', '_astro/Cart.C_sxtxbl', 'bzh6rx')).toBe('/_i18n/en/Cart.C_sxtxbl.bzh6rx.js');
  });

  test('builds correct URL without prefix', () => {
    expect(buildI18nChunkUrl('de', 'Cart.C_sxtxbl', 'abc123')).toBe('/_i18n/de/Cart.C_sxtxbl.abc123.js');
  });
});
