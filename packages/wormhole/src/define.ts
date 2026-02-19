import type { Wormhole } from './types.js';

export function defineWormhole<T>(name: string): Wormhole<T> {
  const listeners = new Set<(data: T) => void>();
  const key = `__wormhole_${name}__`;
  let store: T | undefined;

  return {
    name,
    key,

    get(): T {
      if (store !== undefined) return store;

      const getter = (globalThis as any)[key];

      if (typeof getter === 'function') return getter() as T;

      throw new Error(`wormhole "${name}" is not initialized`);
    },

    set(data: T): void {
      store = data;

      for (const fn of listeners) fn(data);
    },

    subscribe(fn: (data: T) => void): () => void {
      listeners.add(fn);

      return () => {
        listeners.delete(fn);
      };
    },
  };
}
