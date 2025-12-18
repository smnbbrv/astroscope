import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import boot from "@astroscope/boot";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [boot()],
});
