import { defineWormhole } from '@astroscope/wormhole';

export type Config = {
  siteName: string;
  features: string[];
};

export type Counter = {
  count: number;
};

export const configWormhole = defineWormhole<Config>('config');

export const counterWormhole = defineWormhole<Counter>('counter');
