# @astroscope/csrf

CSRF protection integration for Astro with path exclusions and proxy support.

## Why?

Astro has built-in CSRF protection via `security.checkOrigin`, but it doesn't support excluding paths. This is needed when you allow cross-origin POST requests for:

- **OIDC callbacks** (Apple Sign-In, back-channel logout)
- **Payment webhooks** (Stripe, PayPal)
- **Third-party integrations** that POST to your endpoints

## Installation

```bash
npm install @astroscope/csrf
```

## Usage (Integration)

The recommended approach - automatically configures middleware and disables Astro's built-in `checkOrigin`:

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import { csrf } from "@astroscope/csrf";

export default defineConfig({
  integrations: [
    csrf({
      trustProxy: true,
      exclude: [
        { prefix: "/auth/" },
        { exact: "/webhook" },
      ],
    }),
  ],
});
```

## Options

### Origin validation

Choose one of two modes:

**Trust proxy** (recommended when behind a load balancer):

```ts
csrf({
  trustProxy: true, // Compares Origin header against Astro.url.origin
})
```

**Explicit origins:**

```ts
csrf({
  origin: "https://example.com",
  // or multiple:
  origin: ["https://example.com", "https://app.example.com"],
})
```

### `exclude` (optional)

Paths to exclude from CSRF protection:

```ts
exclude: [
  { prefix: "/auth/" },           // path.startsWith("/auth/")
  { exact: "/webhook" },          // path === "/webhook"
  { pattern: /^\/api\/public\// } // regex.test(path)
]
```

Or a function for complex logic:

```ts
exclude: (context) => context.url.pathname.startsWith("/public/")
```

### `enabled` (optional)

Disable CSRF protection (e.g., in development):

```ts
csrf({
  enabled: import.meta.env.PROD,
  trustProxy: true,
})
```

## Manual middleware setup

For dynamic configuration or custom middleware chains, use `createCsrfMiddleware` directly:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { createCsrfMiddleware } from "@astroscope/csrf";

export const onRequest = sequence(
  createCsrfMiddleware({
    // Dynamic origin from environment
    origin: () => process.env.ALLOWED_ORIGINS?.split(",") ?? [],
    exclude: [{ prefix: "/auth/" }],
  })
);
```

When using manual setup, disable Astro's built-in check:

```ts
// astro.config.ts
export default defineConfig({
  security: {
    checkOrigin: false,
  },
});
```

## How it works

1. Skips non-mutating methods (GET, HEAD, OPTIONS)
2. Skips excluded paths
3. Compares request `Origin` header against allowed origin(s)
4. Returns 403 if origins don't match or Origin header is missing

## License

MIT
