# @astroscope/opentelemetry

OpenTelemetry support for Astro SSR.

## Why?

OpenTelemetry's auto-instrumentation relies on monkey-patching Node.js modules, which has two challenges:

1. **ESM support is still experimental** - Node.js ESM modules can't be monkey-patched like CommonJS. The OpenTelemetry team has been working on this for years ([#1946](https://github.com/open-telemetry/opentelemetry-js/issues/1946), [#4553](https://github.com/open-telemetry/opentelemetry-js/issues/4553)), and while there's progress, it requires experimental loader hooks that aren't yet stable.

2. **Vite dev mode loads modules before instrumentation** - Auto-instrumentation must run before any instrumented modules (like `http`) are imported. In Vite's dev mode, modules are loaded dynamically, making it impossible to instrument them in time.

This middleware sidesteps both issues by creating spans directly in Astro's request lifecycle - no monkey-patching required. It works in both dev mode and production.

## Installation

```bash
npm install @astroscope/opentelemetry @opentelemetry/api @opentelemetry/core @opentelemetry/sdk-node
```

## Setup

### 1. Initialize the SDK

The OpenTelemetry SDK must be initialized before traces can be collected. Use [`@astroscope/boot`](../boot) for proper lifecycle management:

```ts
// src/boot.ts
import { NodeSDK } from "@opentelemetry/sdk-node";

const sdk = new NodeSDK({
  // Configure exporters, resource attributes, etc.
  // See: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
});

export function onBoot() {
  sdk.start();
}
```

### 2. Add the middleware

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import {
  createOpenTelemetryMiddleware,
  RECOMMENDED_EXCLUDES,
} from "@astroscope/opentelemetry";

export const onRequest = sequence(
  createOpenTelemetryMiddleware({
    exclude: [
      ...RECOMMENDED_EXCLUDES,
      { exact: "/health" }, // your health endpoint
    ],
  })
);
```

## Options

### `exclude` (optional)

Paths to exclude from tracing. Can be an array of patterns or a function.

**Note:** No paths are excluded by default. This is intentional - you control what gets traced.

**Pattern types:**

```ts
exclude: [
  { prefix: "/_astro" },          // path.startsWith("/_astro")
  { exact: "/health" },           // path === "/health"
  { pattern: /^\/api\/internal/ } // regex.test(path)
]

// Or a function
exclude: (context) => context.url.pathname === "/health"
```

**Pre-built exclude lists:**

| Export | Description |
|--------|-------------|
| `RECOMMENDED_EXCLUDES` | All excludes below combined |
| `DEV_EXCLUDES` | Vite/Astro dev server (`/@vite/`, `/@fs/`, etc.) |
| `ASTRO_STATIC_EXCLUDES` | Astro static assets (`/_astro/`, `/_image`) |
| `STATIC_EXCLUDES` | Common static files (`/assets/`, `/favicon.ico`, etc.) |

```ts
import {
  RECOMMENDED_EXCLUDES,
  DEV_EXCLUDES,
  ASTRO_STATIC_EXCLUDES,
} from "@astroscope/opentelemetry";

// Use all recommended excludes
exclude: [...RECOMMENDED_EXCLUDES, { exact: "/health" }]

// Or pick specific ones
exclude: [...DEV_EXCLUDES, ...ASTRO_STATIC_EXCLUDES]
```

## Trace Context Propagation

The middleware automatically extracts `traceparent` and `tracestate` headers from incoming requests, allowing traces to span across services.

## License

MIT
