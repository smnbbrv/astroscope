# Astroscope

A collection of Astro integrations.

## Packages

| Package | Description |
|---------|-------------|
| [@astroscope/boot](./packages/boot) | Lifecycle hooks for Astro SSR (startup/shutdown) |
| [@astroscope/csrf](./packages/csrf) | Extended CSRF protection middleware with path exclusions |
| [@astroscope/opentelemetry](./packages/opentelemetry) | OpenTelemetry support for Astro SSR |

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
