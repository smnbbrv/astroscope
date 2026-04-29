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
import type { BootContext } from '@astroscope/boot';

export async function onStartup({ dev, host, port }: BootContext) {
  console.log('Starting up...');

  await someAsyncInitialization();

  console.log(`Ready at ${host}:${port} (dev: ${dev})`);
}

export async function onShutdown({ dev }: BootContext) {
  console.log('Shutting down...');

  await closeConnections();

  console.log('Goodbye!');
}
```

2. Add the integration to your Astro config:

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import boot from '@astroscope/boot';

export default defineConfig({
  output: 'server',
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

## Warmup

Pre-imports server modules at startup to eliminate cold-start latency on the first request. At build time, a virtual module is generated that statically imports all matched files. At runtime, this module is loaded in parallel with `onStartup`, so warmup doesn't delay server readiness.

### Enable warmup

```ts
boot({ warmup: true });
```

This uses the default glob patterns (`WARMUP_MODULES`) which cover:

- `src/pages/**/*.{astro,ts,tsx,js,jsx,md,mdx}`
- `src/middleware.{ts,js}` / `src/middleware/index.{ts,js}`

### Custom patterns

Pass an array of glob patterns to control exactly which files are warmed up:

```ts
import { WARMUP_MODULES } from '@astroscope/boot';

// defaults + custom patterns
boot({ warmup: [...WARMUP_MODULES, 'src/components/**/*.tsx'] });

// only custom patterns (no defaults)
boot({ warmup: ['src/lib/heavy-module.ts'] });
```

### Exported constants

The default glob patterns are exported for composition:

```ts
import { WARMUP_PAGE_MODULES, WARMUP_MIDDLEWARE_MODULES, WARMUP_MODULES } from '@astroscope/boot';
```

## Options

### `entry`

Path to the boot file relative to the project root.

- **Type**: `string`
- **Default**: `"src/boot.ts"`

```ts
boot({ entry: 'src/startup.ts' });
```

### `watch`

Restart the dev server when the boot file (or any of its dependencies) changes, and when Vite issues an SSR full-reload (which would otherwise wipe singletons configured in `onStartup`).

Make sure your `onShutdown` releases everything `onStartup` acquired (sockets, ports, intervals, locks) — the previous module is fully shut down before the new one starts on each restart.

- **Type**: `boolean`
- **Default**: `true`

```ts
boot({ watch: false });
```

### `warmup`

Pre-import server modules on startup to eliminate cold-start latency.

- **Type**: `boolean | string[]`
- **Default**: `false`

```ts
// use default patterns
boot({ warmup: true });

// custom patterns
boot({ warmup: [...WARMUP_MODULES, 'src/components/**/*.tsx'] });
```

## How it works

- **Development**: The boot file runs _after_ the dev server starts listening (Vite limitation). `onShutdown` is called when the dev server closes.
- **Production**: `onStartup` runs _before_ the server starts handling requests. `onShutdown` is called on SIGTERM. When warmup is enabled, module pre-loading runs in parallel with `onStartup`.

## Requirements

- Node.js runtime
- SSR output mode (`output: "server"`)

## License

MIT
