import { useSyncExternalStore } from 'react';
import type { Wormhole } from '../types.js';

export function useWormhole<T>(wormhole: Wormhole<T>): T {
  return useSyncExternalStore(wormhole.subscribe, wormhole.get, wormhole.get);
}
