# @astroscope/opentelemetry

OpenTelemetry for Astro — tracing, metrics, and component instrumentation that works in dev mode. No monkey-patching required.

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
| Metrics (Prometheus-compatible) | ✅ | ✅ |
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
  // configuration at https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
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
import opentelemetry from "@astroscope/opentelemetry";

export default defineConfig({
  integrations: [opentelemetry(), boot()], // opentelemetry() should come as early as possible in the list
});
```

This automatically:
- Adds middleware to trace incoming HTTP requests
- Instruments `fetch()` to trace outgoing requests
- Uses `RECOMMENDED_EXCLUDES` to skip static assets
- Provides `<Trace>` component for tracing specific sections or components

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

## Metrics

To export metrics, configure a metrics reader in your SDK (e.g., Prometheus exporter):

```ts
// src/boot.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";

const prometheusExporter = new PrometheusExporter({ port: 9464 });

const sdk = new NodeSDK({
  serviceName: "my-astro-app",
  metricReader: prometheusExporter,
});

export function onStartup() {
  sdk.start();
}
```

or use OTLP metrics exporter (for Grafana, Datadog, etc.):

```ts
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter(),
  exportIntervalMillis: 60000,
});

const sdk = new NodeSDK({ metricReader });
```

### Collected Metrics

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `http.server.request.duration` | Histogram | seconds | Duration of incoming HTTP requests |
| `http.server.active_requests` | UpDownCounter | requests | Number of active HTTP requests |
| `http.client.request.duration` | Histogram | seconds | Duration of outgoing fetch requests |
| `astro.action.duration` | Histogram | seconds | Duration of Astro action executions |

### Metric Attributes

**HTTP Server metrics:**
- `http.request.method` - HTTP method (GET, POST, etc.)
- `http.route` - Request path
- `http.response.status_code` - Response status code

**HTTP Client (fetch) metrics:**
- `http.request.method` - HTTP method
- `server.address` - Target hostname
- `http.response.status_code` - Response status code

**Astro Action metrics:**
- `astro.action.name` - Action name (e.g., `newsletter.subscribe`)
- `http.response.status_code` - Response status code
```

### Host & Runtime Metrics

For system-level and Node.js runtime metrics (CPU, memory, event loop, GC), add these packages:

```bash
npm install @opentelemetry/host-metrics @opentelemetry/instrumentation-runtime-node
```

```ts
// src/boot.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";

const sdk = new NodeSDK({
  serviceName: "my-astro-app",
  metricReader: new PrometheusExporter({ port: 9464 }),
  instrumentations: [new RuntimeNodeInstrumentation()],
});

let hostMetrics: HostMetrics;

export function onStartup() {
  sdk.start();

  // the host metrics should be called after sdk.start()
  hostMetrics = new HostMetrics({ name: "my-astro-app" });
  hostMetrics.start();
}
```

This adds:
- **Host metrics**: `process.cpu.*`, `system.cpu.*`, `system.memory.*`, `system.network.*`
- **Runtime metrics**: `nodejs.eventloop.delay.*`, `nodejs.gc.duration`, `nodejs.eventloop.utilization`

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
import opentelemetry from "@astroscope/opentelemetry";
import { RECOMMENDED_EXCLUDES } from "@astroscope/excludes";

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
    http: { enabled: false }, // let native instrumentation work for incoming requests
    // fetch remains enabled by default - native doesn't support it in ESM yet
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

## License

MIT
