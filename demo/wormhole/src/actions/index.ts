import { z } from 'astro/zod';
import { defineAction } from 'astro:actions';
import { setCount } from '../server/store';

export const server = {
  updateCounter: defineAction({
    input: z.object({
      count: z.number(),
    }),
    handler: ({ count }) => {
      return { count: setCount(count) };
    },
  }),
};
