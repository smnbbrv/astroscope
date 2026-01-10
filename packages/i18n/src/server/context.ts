import { AsyncLocalStorage } from 'node:async_hooks';
import type { I18nContext } from './types.js';

const als = new AsyncLocalStorage<I18nContext>();

/**
 * Run a function with i18n context (called by middleware)
 */
export function runWithContext<T>(context: I18nContext, fn: () => T): T {
  return als.run(context, fn);
}

/**
 * Get the current i18n context
 */
export function getContext(): I18nContext | null {
  return als.getStore() ?? null;
}
