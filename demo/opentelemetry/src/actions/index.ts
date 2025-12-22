import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';

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
