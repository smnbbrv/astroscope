import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import boot from "@astroscope/boot";
import {
  opentelemetry,
  RECOMMENDED_EXCLUDES,
} from "@astroscope/opentelemetry";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    opentelemetry({
      instrumentations: {
        http: {
          enabled: true,
          exclude: [...RECOMMENDED_EXCLUDES, { exact: "/health" }],
        },
      },
    }),
    boot(),
  ],
});
