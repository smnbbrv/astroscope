# Astroscope

> **Note:** This project is in active development. APIs may change between versions.

A collection of Astro integrations for common server-side needs — logging, tracing, security, i18n, and more.

## Packages

| Package | Description |
|---------|-------------|
| [@astroscope/boot](./packages/boot) | Startup and graceful shutdown lifecycle hooks |
| [@astroscope/csrf](./packages/csrf) | CSRF protection with path exclusions for webhooks and OIDC callbacks |
| [@astroscope/excludes](./packages/excludes) | Reusable exclude patterns and helpers for middleware |
| [@astroscope/health](./packages/health) | Kubernetes-style health probes — livez, readyz, startupz, healthz |
| [@astroscope/i18n](./packages/i18n) | i18n for Astro + React islands — dynamic translations from any source, auto-split per component, parallel loading |
| [@astroscope/opentelemetry](./packages/opentelemetry) | OpenTelemetry tracing and metrics — works in dev mode, no monkey-patching |
| [@astroscope/pino](./packages/pino) | Pino logging with request-scoped context |
| [@astroscope/proxy](./packages/proxy) | HTTP proxy for strangler fig migrations and API gateways |
| [@astroscope/wormhole](./packages/wormhole) | Share dynamic server data with React islands and client scripts — typed, reactive |

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run demo app
bun run dev

# Run tests
bun test

# Typecheck
bun run typecheck
```

## License

MIT
