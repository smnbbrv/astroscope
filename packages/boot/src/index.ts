import fs from "node:fs";
import path from "node:path";
import type { AstroIntegration } from "astro";

export interface BootOptions {
  /**
   * Path to the boot file relative to the project root.
   * @default "src/boot.ts"
   */
  entry?: string;
  /**
   * Enable HMR for the boot file. When true, `onBoot` will re-run when the boot file changes.
   * @default false
   */
  hmr?: boolean;
}

interface BootModule {
  onBoot?: () => Promise<void> | void;
}

function resolveEntry(entry: string | undefined): string {
  if (entry) return entry;

  // Check for src/boot.ts first, then src/boot/index.ts
  if (fs.existsSync("src/boot.ts")) return "src/boot.ts";
  if (fs.existsSync("src/boot/index.ts")) return "src/boot/index.ts";

  // Default to src/boot.ts (will error if not found)
  return "src/boot.ts";
}

export default function boot(options: BootOptions = {}): AstroIntegration {
  const entry = resolveEntry(options.entry);
  const hmr = options.hmr ?? false;

  let isBuild = false;
  let isSSR = false;
  let bootChunkRef: string | null = null;

  return {
    name: "@astroscope/boot",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, logger }) => {
        isBuild = command === "build";

        updateConfig({
          vite: {
            plugins: [
              {
                name: "@astroscope/boot",
                configureServer(server) {
                  // Skip in build mode - Astro spins up a temporary server during build
                  if (isBuild) return;

                  server.httpServer?.once("listening", async () => {
                    try {
                      const module = (await server.ssrLoadModule(
                        `/${entry}`,
                      )) as BootModule;

                      if (module.onBoot) {
                        await module.onBoot();
                      }
                    } catch (error) {
                      logger.error(`Error running boot script: ${error}`);
                    }
                  });

                  if (hmr) {
                    server.watcher.on("change", async (changedPath) => {
                      if (!changedPath.endsWith(entry)) return;

                      logger.info("boot file changed, re-running onBoot...");
                      try {
                        server.moduleGraph.invalidateAll();
                        const module = (await server.ssrLoadModule(
                          `/${entry}`,
                        )) as BootModule;

                        if (module.onBoot) {
                          await module.onBoot();
                        }
                      } catch (error) {
                        logger.error(`Error running boot script: ${error}`);
                      }
                    });
                  }
                },
                configResolved(config) {
                  isSSR = !!config.build?.ssr;
                },
                buildStart() {
                  if (!isSSR) return;

                  try {
                    bootChunkRef = this.emitFile({
                      type: "chunk",
                      id: entry,
                      name: "boot",
                    });
                  } catch {
                    // emitFile not available in serve mode
                  }
                },
                writeBundle(outputOptions) {
                  const outDir = outputOptions.dir;
                  if (!outDir || !bootChunkRef) return;

                  const entryPath = path.join(outDir, "entry.mjs");
                  if (!fs.existsSync(entryPath)) return;

                  const bootChunkName = this.getFileName(bootChunkRef);
                  if (!bootChunkName) {
                    logger.warn("boot chunk not found");
                    return;
                  }

                  const sourcemapPath = `${entryPath}.map`;
                  if (fs.existsSync(sourcemapPath)) {
                    logger.warn(
                      "sourcemap detected for entry.mjs - line numbers may be off by 2 lines due to boot injection",
                    );
                  }

                  let content = fs.readFileSync(entryPath, "utf-8");
                  const bootImport = `import { onBoot } from './${bootChunkName}';\nawait onBoot();\n`;
                  content = bootImport + content;
                  fs.writeFileSync(entryPath, content);

                  logger.info(`injected ${bootChunkName} into entry.mjs`);
                },
              },
            ],
          },
        });
      },
    },
  };
}
