# Astroscope

> **Note:** This project is in active development. APIs may change between versions.

A collection of Astro integrations for common server-side needs — logging, tracing, security, i18n, and more.

## Packages

| Package | Description |
|---------|-------------|
| [@astroscope/boot](./packages/boot) | Startup and graceful shutdown lifecycle hooks |
| [@astroscope/csrf](./packages/csrf) | CSRF protection with path exclusions for webhooks and OIDC callbacks |
| [@astroscope/excludes](./packages/excludes) | Reusable exclude patterns and helpers for middleware |
| [@astroscope/i18n](./packages/i18n) | i18n for Astro + React islands — automatic tree-shaking, parallel loading, any translation source |
| [@astroscope/opentelemetry](./packages/opentelemetry) | OpenTelemetry tracing and metrics — works in dev mode, no monkey-patching |
| [@astroscope/pino](./packages/pino) | Pino logging with request-scoped context |
| [@astroscope/proxy](./packages/proxy) | HTTP proxy for strangler fig migrations and API gateways |

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
