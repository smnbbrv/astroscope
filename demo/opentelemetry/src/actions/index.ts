import { z } from 'astro/zod';
import { defineAction } from 'astro:actions';

export const server = {
  greet: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async ({ name }) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { message: `Hello, ${name}!` };
    },
  }),
};
