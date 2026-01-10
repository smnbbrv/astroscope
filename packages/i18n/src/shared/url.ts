/**
 * Convert a Vite chunk ID to a clean chunk name
 * Strips the _astro/ prefix that Vite adds
 *
 * @example
 * chunkIdToName('_astro/Cart.C_sxtxbl') // → 'Cart.C_sxtxbl'
 * chunkIdToName('Cart.C_sxtxbl') // → 'Cart.C_sxtxbl'
 */
export function chunkIdToName(chunkId: string): string {
  return chunkId.replace(/^_astro\//, '');
}

/**
 * Extract chunk name from a component URL
 * Used by client directives to get the hash lookup key
 *
 * @example
 * componentUrlToChunkName('/_astro/Cart.C_sxtxbl.js') // → 'Cart.C_sxtxbl'
 */
export function componentUrlToChunkName(componentUrl: string): string {
  return componentUrl.replace(/^\/_astro\//, '').replace(/\.js$/, '');
}

/**
 * Build the URL path for fetching a translation chunk
 *
 * @example
 * buildI18nChunkUrl('en', '_astro/Cart.C_sxtxbl', 'bzh6rx')
 * // → '/_i18n/en/Cart.C_sxtxbl.bzh6rx.js'
 */
export function buildI18nChunkUrl(locale: string, chunkId: string, hash: string): string {
  return `/_i18n/${locale}/${chunkIdToName(chunkId)}.${hash}.js`;
}
