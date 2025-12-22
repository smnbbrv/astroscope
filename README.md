# Astroscope

A collection of Astro packages to make production-ready applications.

## Why?

Running Astro in middleware mode under Express/Fastify works, but comes with trade-offs:

- extra moving parts and runtime overhead
- two TypeScript compilers = duplicated constants, no easy code sharing

Astroscope packages are designed to turn the standalone Astro into a production-ready web server with minimal complexity.

## Packages

| Package | Description |
|---------|-------------|
| [@astroscope/boot](./packages/boot) | Lifecycle hooks for Astro SSR (startup/shutdown) |
| [@astroscope/csrf](./packages/csrf) | Extended CSRF protection middleware with path exclusions |
| [@astroscope/opentelemetry](./packages/opentelemetry) | OpenTelemetry support for Astro SSR |
| [@astroscope/proxy](./packages/proxy) | HTTP proxy for Astro SSR - migrate legacy websites or use Astro as gateway |

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
