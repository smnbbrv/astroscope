import { z } from 'astro/zod';
import { defineAction } from 'astro:actions';

export const server = {
  ping: defineAction({
    input: z.object({ message: z.string() }),
    handler: ({ message }) => ({ echo: message }),
  }),
};
