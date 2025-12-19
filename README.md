# Astroscope

SSR utilities for Astro - when standalone application is enough.

## Why?

Want to run something when app starts? Migrate old website to Astro gradually? Have observability in place?

Running Astro in middleware mode under Express/Fastify works, but comes with trade-offs:

- extra moving parts and runtime overhead
- two TypeScript compilers = duplicated constants, no easy code sharing

Let's fill these gaps so Astro can stand on its own.

## Packages

| Package | Description |
|---------|-------------|
| [@astroscope/boot](./packages/boot) | Lifecycle hooks for Astro SSR (startup/shutdown) |
| [@astroscope/csrf](./packages/csrf) | Extended CSRF protection middleware with path exclusions |
| [@astroscope/opentelemetry](./packages/opentelemetry) | OpenTelemetry support for Astro SSR |
| [@astroscope/proxy](./packages/proxy) | HTTP proxy for Astro SSR - migrate legacy websites or proxy to backend APIs |

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
