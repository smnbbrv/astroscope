# @astroscope/boot

> **Note:** This package is in active development. APIs may change between versions.

Startup and graceful shutdown hooks for Astro SSR. Run initialization code before the server starts and cleanup code when it shuts down.

## Examples

See the [demo/boot](../../demo/boot) directory for a working example.

## Installation

```bash
npm install @astroscope/boot
```

## Usage

1. Create a boot file at `src/boot.ts` (or `src/boot/index.ts`):

```ts
// src/boot.ts
import type { BootContext } from "@astroscope/boot";

export async function onStartup({ dev, host, port }: BootContext) {
  console.log("Starting up...");

  await someAsyncInitialization();

  console.log(`Ready at ${host}:${port} (dev: ${dev})`);
}

export async function onShutdown({ dev }: BootContext) {
  console.log("Shutting down...");

  await closeConnections();

  console.log("Goodbye!");
}
```

2. Add the integration to your Astro config:

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import boot from "@astroscope/boot";

export default defineConfig({
  output: "server",
  integrations: [boot()],
});
```

## Boot Context

Both `onStartup` and `onShutdown` receive a `BootContext` object:

```ts
interface BootContext {
  /** Whether running in development mode */
  dev: boolean;
  /** Server host (from Astro config or HOST env var) */
  host: string;
  /** Server port (from Astro config or PORT env var) */
  port: number;
}
```

In development, `host` and `port` are read from the actual server address. In production, they default to Astro config values but can be overridden via `HOST` and `PORT` environment variables at runtime.

## Lifecycle Hooks

### `onStartup`

Called before the server starts handling requests. Use this for:

- Database connection initialization
- Loading configuration
- Warming caches
- Setting up external service clients

### `onShutdown`

Called when the server is shutting down (SIGTERM in production, server close in development). Use this for:

- Closing database connections
- Flushing buffers
- Cleaning up resources
- Graceful shutdown of external services

## V8 Warmup

The package includes a warmup utility that pre-imports all page modules and middleware to warm up the V8 JIT compiler, reducing cold start latency for the first requests.

```ts
// src/boot.ts
import type { BootContext } from "@astroscope/boot";
import { warmup } from "@astroscope/boot/warmup";

export async function onStartup({ host, port }: BootContext) {
  const result = await warmup();

  if (result.success.length > 0) {
    console.log(`Warmed up ${result.success.length} modules in ${result.duration}ms`);
  }

  if (result.failed.length > 0) {
    console.warn(`Failed to warm up: ${result.failed.join(", ")}`);
  }

  console.log(`Server ready at ${host}:${port}`);
}
```

### `WarmupResult`

```ts
interface WarmupResult {
  /** Modules that were successfully loaded */
  success: string[];
  /** Modules that failed to load */
  failed: string[];
  /** Time taken in milliseconds */
  duration: number;
}
```

In development mode, `warmup()` is a no-op that returns empty results. In production, it reads a manifest generated during the build and imports all discovered page modules and middleware in parallel.

## Options

### `entry`

Path to the boot file relative to the project root.

- **Type**: `string`
- **Default**: `"src/boot.ts"`

```ts
boot({ entry: "src/startup.ts" });
```

### `hmr`

Re-run `onStartup` when the boot file changes during development. This is disabled by default to avoid side effects, because `onStartup` may perform operations that should only run once (e.g., database connections). Please ensure your `onShutdown` function destroys any resources created by `onStartup` to prevent leaks / unexpected behavior.

- **Type**: `boolean`
- **Default**: `false`

```ts
boot({ hmr: true });
```

## How it works

- **Development**: The boot file runs _after_ the dev server starts listening (Vite limitation). `onShutdown` is called when the dev server closes.
- **Production**: `onStartup` runs _before_ the server starts handling requests. `onShutdown` is called on SIGTERM.

## Requirements

- Only works with SSR output mode (`output: "server"`)

## License

MIT
