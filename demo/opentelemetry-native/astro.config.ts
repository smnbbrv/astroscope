import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import { opentelemetry } from "@astroscope/opentelemetry";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    // Use our integration only for fetch - native handles HTTP incoming requests
    opentelemetry({
      instrumentations: {
        http: { enabled: false }, // Let native auto-instrumentation handle this
        // fetch remains enabled by default - native doesn't support it in ESM
      },
    }),
  ],
});
