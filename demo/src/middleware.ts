import { sequence } from "astro:middleware";
import { createCsrfMiddleware } from "@astroscope/csrf";

export const onRequest = sequence(
  createCsrfMiddleware({
    origin: "http://localhost:4321",
    exclude: [{ prefix: "/auth/" }], // OIDC callbacks
  })
);
