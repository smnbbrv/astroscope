import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
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
