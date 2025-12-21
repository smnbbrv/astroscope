import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import { csrf } from "@astroscope/csrf";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    csrf({
      trustProxy: true,
      exclude: [
        { prefix: "/auth/" }, // OIDC callbacks
        { exact: "/webhook" }, // Payment webhooks
      ],
    }),
  ],
});
