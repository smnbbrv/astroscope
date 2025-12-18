# @astroscope/boot

Run initialization code before your Astro server starts handling requests.

## Installation

```bash
bun add @astroscope/boot
```

## Usage

1. Create a boot file at `src/boot.ts` (or `src/boot/index.ts`):

```ts
// src/boot.ts
export async function onBoot() {
  // Initialize database connections, load config, etc.
  console.log("Bootstrapping the app...");

  await someAsyncInitialization();

  console.log("Ready!");
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

## Options

### `entry`

Path to the boot file relative to the project root.

- **Type**: `string`
- **Default**: `"src/boot.ts"`

```ts
boot({ entry: "src/startup.ts" });
```

## How it works

- **Development**: The boot file runs _after_ the dev server starts listening (Vite limitation)
- **Production**: The boot file runs _before_ the server starts handling requests

## Requirements

- The boot file must export a named `onBoot` function
- Only works with SSR output mode (`output: "server"`)

## License

MIT
