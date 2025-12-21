# @astroscope/opentelemetry

OpenTelemetry support for Astro SSR.

## Examples

- [demo/opentelemetry](../../demo/opentelemetry) - Integration-based tracing (works in dev and production)
- [demo/opentelemetry-native](../../demo/opentelemetry-native) - Native ESM auto-instrumentation (production only)

## Why?

OpenTelemetry's auto-instrumentation relies on monkey-patching Node.js modules, which has two challenges:

1. **ESM support is still experimental** - Node.js ESM modules can't be monkey-patched like CommonJS. The OpenTelemetry team has been working on this for years ([#1946](https://github.com/open-telemetry/opentelemetry-js/issues/1946), [#4553](https://github.com/open-telemetry/opentelemetry-js/issues/4553)), and while there's progress, it requires experimental loader hooks that aren't yet stable.

2. **Vite dev mode loads modules before instrumentation** - Auto-instrumentation must run before any instrumented modules (like `http`) are imported. In Vite's dev mode, modules are loaded dynamically, making it impossible to instrument them in time.

This package handles both issues by creating spans directly in Astro's request lifecycle - no monkey-patching required. It works in both dev mode and production.

### Comparison

| Feature | @astroscope/opentelemetry | Native auto-instrumentation |
|---------|---------------------------|----------------------------|
| Works in dev mode | ✅ | ❌ |
| Works in production | ✅ | ✅ |
| Incoming HTTP requests | ✅ | ✅ |
| Outgoing fetch requests | ✅ | ❌ (ESM not supported) |
| Astro actions | ✅ (named spans) | ❌ |
| Component tracing | ✅ (`<Trace>` component) | ❌ |
| Other libraries | ❌ | ✅ (varies by library) |
| Setup complexity | Simple | Requires `--import` flag |
| Bundle size | Minimal | Heavy (30+ packages) |
| Cold start impact | Negligible | Significant |


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

export function onStartup() {
  sdk.start();
}

export async function onShutdown() {
  await sdk.shutdown();
}
```

Note, since this integration creates spans directly, you don't need to 

- add any instrumentations to the SDK configuration
- use specific import order for auto-instrumentation (since none is used)

### 2. Add the integration

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import boot from "@astroscope/boot";
import { opentelemetry } from "@astroscope/opentelemetry";

export default defineConfig({
  integrations: [opentelemetry(), boot()], // opentelemetry() should come as early as possible in the list
});
```

**Important:** `opentelemetry()` must be listed before `boot()`. This ensures fetch is instrumented before any code (including your boot file) can cache a reference to the original fetch.

This automatically:
- Adds middleware to trace incoming HTTP requests
- Instruments `fetch()` to trace outgoing requests
- Uses `RECOMMENDED_EXCLUDES` to skip static assets

## Integration Options

```ts
opentelemetry({
  instrumentations: {
    http: {
      enabled: true, // default: true
      exclude: [...RECOMMENDED_EXCLUDES, { exact: "/health" }],
    },
    fetch: {
      enabled: true, // default: true
    },
  },
})
```

### `instrumentations.http`

Controls incoming HTTP request tracing via middleware.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable HTTP tracing |
| `exclude` | `ExcludePattern[]` | `RECOMMENDED_EXCLUDES` | Paths to exclude from tracing |

### `instrumentations.fetch`

Controls outgoing fetch request tracing.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable fetch tracing |

## Component Tracing

Trace specific sections or components using the `<Trace>` component:

```astro
---
import { Trace } from "@astroscope/opentelemetry/components";
---

<Trace name="hero">
  <HeroSection />
</Trace>

<Trace name="sidebar">
  <Sidebar />
</Trace>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | required | Span name |
| `params` | `Record<string, AttributeValue>` | `{}` | Custom span attributes |
| `enabled` | `boolean` | `true` | Enable/disable tracing (useful for conditional tracing) |
| `withTimings` | `boolean` | `false` | Enable accurate duration measurement |

### Streaming vs Timing Mode

By default, `<Trace>` preserves Astro's streaming behavior by creating an instant marker span (`>> name`). This is safe to use anywhere without affecting performance.

```astro
<!-- Default: streaming preserved, instant span -->
<Trace name="section">
  <SlowComponent />
  <FastComponent />
</Trace>
```

For accurate render duration measurement, use `withTimings`:

```astro
<!-- With timing: accurate duration, but buffers content -->
<Trace name="data-table" withTimings>
  <DataTable data={data} />
</Trace>
```

**Important:** `withTimings` buffers all children before streaming. Use it only when:
- Wrapping a **single component** where you need timing
- You understand it will block streaming for that section

### Span Names

| Mode | Span Name | Description |
|------|-----------|-------------|
| `withTimings={false}` | `>> section-name` | Instant marker, no duration |
| `withTimings={true}` | `RENDER section-name` | Full render duration |

### Conditional Tracing

Use `enabled` to conditionally trace (e.g., in recursive components):

```astro
---
const { depth = 0 } = Astro.props;
---

<Trace name="tree-node" enabled={depth < 3} params={{ depth }}>
  <TreeNode>
    {children.map(child => <Astro.self depth={depth + 1} {...child} />)}
  </TreeNode>
</Trace>
```

### Context Propagation

Nested `<Trace>` components with `withTimings` create proper parent-child relationships:

```astro
<Trace name="page" withTimings>
  <Trace name="header" withTimings>
    <Header />
  </Trace>
  <Trace name="content" withTimings>
    <Content />
  </Trace>
</Trace>
```

Results in:
```
RENDER page
├── RENDER header
└── RENDER content
```

## Exclude Patterns

**Pattern types:**

```ts
exclude: [
  { prefix: "/_astro" },          // path.startsWith("/_astro")
  { exact: "/health" },           // path === "/health"
  { pattern: /^\/api\/internal/ } // regex.test(path)
]
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
  opentelemetry,
  RECOMMENDED_EXCLUDES,
} from "@astroscope/opentelemetry";

opentelemetry({
  instrumentations: {
    http: {
      enabled: true,
      exclude: [...RECOMMENDED_EXCLUDES, { exact: "/health" }],
    },
  },
})
```

## Trace Context Propagation

The middleware automatically extracts `traceparent` and `tracestate` headers from incoming requests, allowing traces to span across services.

## Manual Setup

If you prefer manual control instead of using the integration:

### Manual middleware

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import {
  createOpenTelemetryMiddleware,
  RECOMMENDED_EXCLUDES,
} from "@astroscope/opentelemetry";

export const onRequest = sequence(
  createOpenTelemetryMiddleware({
    exclude: [...RECOMMENDED_EXCLUDES, { exact: "/health" }],
  })
);
```

### Manual fetch instrumentation

```ts
// src/boot.ts
import { instrumentFetch } from "@astroscope/opentelemetry";

export function onStartup() {
  instrumentFetch();
}
```

## Alternative: Native ESM Auto-Instrumentation

If you only need tracing in production builds, you can use OpenTelemetry's native ESM loader hooks instead of this middleware. This approach uses Node.js module hooks to auto-instrument libraries like `http`, `express`, `pg`, etc.

**Advantages:**

- Full auto-instrumentation (HTTP client requests, database queries, etc.)
- No middleware code required

**Disadvantages:**

- Only works in production builds (not in Vite dev mode)
- Not all instrumentations support ESM yet ([tracking issue](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1942))

**Recommendation:** Use this package for Astro-specific tracing (HTTP, fetch, actions). For database and other library instrumentation, add only the specific instrumentations you need (e.g., `@opentelemetry/instrumentation-pg`) rather than `@opentelemetry/auto-instrumentations-node`, which pulls dozens of packages - most of which won't work in ESM anyway.

**Note:** When combining with native auto-instrumentation, you can disable the HTTP middleware (to avoid duplicate incoming request spans) while keeping fetch instrumentation (enabled by default):

```ts
opentelemetry({
  instrumentations: {
    http: { enabled: false }, // Let native handle incoming requests
    // fetch remains enabled by default - native doesn't support it in ESM
  },
})
```

### Setup

1. Create a `register.mjs` file:

```js
// register.mjs
import { register } from "node:module";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

// Register the OpenTelemetry ESM loader hook
// See: https://github.com/open-telemetry/opentelemetry-js/issues/4392#issuecomment-2115512083
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

const sdk = new NodeSDK({
  serviceName: "my-astro-app",
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

2. Start your production server with the `--import` flag:

```bash
node --import=./register.mjs ./dist/server/entry.mjs
```

### ESM-Compatible Instrumentations

The following instrumentations have ESM support ([full list](https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1942)).

**Note:** Native `fetch` is **not yet supported** in ESM mode. Outgoing HTTP requests made with `fetch()` won't generate child spans, unless you use this package's fetch instrumentation.

## License

MIT
