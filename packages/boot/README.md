# @astroscope/boot

Run initialization and cleanup code for your Astro server.

## Examples

See the [demo/boot](../../demo/boot) directory for a working example.

## Installation

```bash
bun add @astroscope/boot
```

## Usage

1. Create a boot file at `src/boot.ts` (or `src/boot/index.ts`):

```ts
// src/boot.ts
export async function onStartup() {
  // Initialize database connections, load config, etc.
  console.log("Starting up...");

  await someAsyncInitialization();

  console.log("Ready!");
}

export async function onShutdown() {
  // Close database connections, cleanup resources, etc.
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

## Options

### `entry`

Path to the boot file relative to the project root.

- **Type**: `string`
- **Default**: `"src/boot.ts"`

```ts
boot({ entry: "src/startup.ts" });
```

### `hmr`

Re-run `onStartup` when the boot file changes during development. This is disabled by default to avoid side effects, because `onStartup` may perform operations that should only run once (e.g., database connections).

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
