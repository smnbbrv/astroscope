# @astroscope/health

> **Note:** This package is in active development. APIs may change between versions.

Kubernetes-style health check endpoints for Astro SSR. Provides `/livez`, `/readyz`, `/startupz`, and `/healthz` probes on a separate HTTP server.

## Examples

See the [demo/health](../../demo/health) directory for a working example.

## Installation

```bash
npm install @astroscope/health
```

## Usage

This package is designed to work with [@astroscope/boot](../boot) for lifecycle management.

```ts
// src/boot.ts
import type { BootContext } from "@astroscope/boot";
import { checks, probes, server } from "@astroscope/health";

export async function onStartup({ dev, host, port }: BootContext) {
  // start health server on a separate port
  server.start({ port: 9090 });

  // enable liveness immediately
  probes.livez.enable();

  // initialize your app...
  await connectToDatabase();

  // register health checks
  checks.register("database", () => db.ping());

  // enable startup probe (initialization complete)
  probes.startupz.enable();

  // enable readiness probe (ready for traffic)
  probes.readyz.enable();
}

export async function onShutdown() {
  // disable readiness first (stop receiving traffic)
  probes.readyz.disable();

  await disconnectFromDatabase();

  // stop health server
  await server.stop();
}
```

## Probes

### `/livez` — Liveness Probe

Indicates if the process is running. If this fails, Kubernetes will restart the container.

```ts
probes.livez.enable(); // returns 200 OK
probes.livez.disable(); // returns 503 Service Unavailable
```

### `/startupz` — Startup Probe

Indicates if the application has finished initializing. Kubernetes waits for this before sending traffic or checking liveness.

```ts
probes.startupz.enable();
probes.startupz.disable();
```

### `/readyz` — Readiness Probe

Indicates if the application is ready to receive traffic. When disabled or when required health checks fail, Kubernetes removes the pod from load balancer rotation.

```ts
probes.readyz.enable();
probes.readyz.disable();
```

The readiness probe automatically runs all non-optional health checks and returns 503 if any fail.

### `/healthz` — Health Status

Returns detailed JSON status of all probes and health checks. Useful for debugging and dashboards.

```json
{
  "status": "healthy",
  "probes": {
    "livez": true,
    "startupz": true,
    "readyz": true
  },
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 12
    },
    "redis": {
      "status": "unhealthy",
      "latency": 5003,
      "error": "check \"redis\" timed out after 5000ms"
    }
  }
}
```

Status values:
- `healthy` — all checks pass
- `degraded` — optional checks failing, required checks pass
- `unhealthy` — required checks failing

## Health Checks

Register health checks to verify dependencies are working:

```ts
import { checks } from "@astroscope/health";

// return result (recommended for boolean checks)
checks.register("database", () => ({
  status: db.isConnected() ? "healthy" : "unhealthy",
  error: db.isConnected() ? undefined : "connection lost",
}));

// throw-based (classic pattern)
checks.register("cache", async () => {
  await redis.ping(); // throws if fails
});

// with options
checks.register({
  name: "external-api",
  check: () => fetch("https://api.example.com/health").then(() => {}),
  optional: true, // doesn't affect /readyz, only /healthz status
  timeout: 10000, // custom timeout (default: 5000ms)
});
```

The check function can either:
- Return `HealthCheckResult` with status and optional error
- Return `void` (completing without error = healthy)
- Throw an error (= unhealthy with error message)

### Unregistering Checks

`register()` returns an unregister function:

```ts
const unregister = checks.register({
  name: "database",
  check: () => db.ping(),
});

// later...
unregister();
```

## Server Options

```ts
server.start({
  host: "0.0.0.0", // default: "localhost"
  port: 9090, // default: 9090
});
```

## Kubernetes Configuration

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: app
      ports:
        - containerPort: 4321 # astro
        - containerPort: 9090 # health
      livenessProbe:
        httpGet:
          path: /livez
          port: 9090
        initialDelaySeconds: 0
        periodSeconds: 10
      startupProbe:
        httpGet:
          path: /startupz
          port: 9090
        failureThreshold: 30
        periodSeconds: 2
      readinessProbe:
        httpGet:
          path: /readyz
          port: 9090
        periodSeconds: 5
```

## API Reference

### Server

```ts
import { server } from "@astroscope/health";

server.start(options?: HealthServerOptions): void;
server.stop(): Promise<void>;
```

### Probes

```ts
import { probes } from "@astroscope/health";

probes.livez.enable(): void;
probes.livez.disable(): void;
probes.livez.get(): Promise<HealthProbeResult>;
probes.livez.response(): Promise<Response>;

// same for startupz, readyz

probes.healthz.get(): Promise<HealthzResult>;
probes.healthz.response(): Promise<Response>;
```

### Checks

```ts
import { checks } from "@astroscope/health";

checks.register(name: string, check: CheckFn): () => void;
checks.register(check: HealthCheck): () => void;

// CheckFn = () => Promise<HealthCheckResult | void> | HealthCheckResult | void
checks.getChecks(): HealthCheck[];
checks.runAll(): Promise<Record<string, HealthCheckResult>>;
checks.runRequired(): Promise<boolean>;
```

## Types

```ts
interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult | void> | HealthCheckResult | void;
  optional?: boolean; // default: false
  timeout?: number; // default: 5000
}

interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  latency?: number;
  error?: string;
}

interface HealthProbeResult {
  passing: boolean;
}

interface HealthzResult {
  status: "healthy" | "degraded" | "unhealthy";
  probes: {
    livez: boolean;
    startupz: boolean;
    readyz: boolean;
  };
  checks: Record<string, HealthCheckResult>;
}

interface HealthServerOptions {
  host?: string; // default: "localhost"
  port?: number; // default: 9090
}
```

## License

MIT
