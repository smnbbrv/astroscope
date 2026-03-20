import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineWormhole } from './define';

describe('defineWormhole', () => {
  describe('get', () => {
    test('throws when not initialized', () => {
      const wh = defineWormhole('test-uninit');

      expect(() => wh.get()).toThrow('wormhole "test-uninit" is not initialized');
    });

    test('reads from globalThis getter', () => {
      const wh = defineWormhole('test-global');

      (globalThis as any)[wh.key] = () => ({ value: 42 });

      try {
        expect(wh.get()).toEqual({ value: 42 });
      } finally {
        delete (globalThis as any)[wh.key];
      }
    });
  });

  describe('set', () => {
    test('throws on server (no window)', () => {
      const wh = defineWormhole<{ v: number }>('test-server-set');

      expect(() => wh.set({ v: 1 })).toThrow('set() cannot be called on the server');
    });

    test('works when window is defined', () => {
      (globalThis as any).window = {};

      try {
        const wh = defineWormhole<{ v: number }>('test-client-set');

        wh.set({ v: 1 });

        expect(wh.get()).toEqual({ v: 1 });
      } finally {
        delete (globalThis as any).window;
      }
    });
  });

  describe('subscribe', () => {
    afterEach(() => {
      delete (globalThis as any).window;
    });

    test('notifies listeners on set', () => {
      (globalThis as any).window = {};

      const wh = defineWormhole<number>('test-sub');
      const handler = vi.fn(() => {});

      wh.subscribe(handler);
      wh.set(42);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(42);
    });

    test('unsubscribe stops notifications', () => {
      (globalThis as any).window = {};

      const wh = defineWormhole<number>('test-unsub');
      const handler = vi.fn(() => {});

      const unsub = wh.subscribe(handler);

      unsub();
      wh.set(42);

      expect(handler).toHaveBeenCalledTimes(0);
    });
  });
});
