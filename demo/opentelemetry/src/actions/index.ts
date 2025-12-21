import { defineAction } from "astro:actions";
import { z } from "astro:schema";

export const server = {
  greet: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async ({ name }) => {
      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { message: `Hello, ${name}!` };
    },
  }),
};
