# @astroscope/csrf

CSRF protection middleware for Astro with path exclusions.

## Why?

Astro has built-in CSRF protection via `security.checkOrigin`, but it doesn't support excluding paths. This is a problem when you need to allow cross-origin POST requests for:

- **OIDC callbacks** (Apple Sign-In, back-channel logout)
- **Payment webhooks** (Stripe, PayPal)
- **Third-party integrations** that POST to your endpoints

## Installation

```bash
npm install @astroscope/csrf
```

## Usage

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { createCsrfMiddleware } from "@astroscope/csrf";

export const onRequest = sequence(
  createCsrfMiddleware({
    origin: "https://example.com",
    exclude: [
      { prefix: "/auth/" },      // OIDC callbacks
      { exact: "/stripe/webhook" },
      { pattern: /^\/api\/public\// },
    ],
  })
);
```

```ts
// astro.config.ts
export default defineConfig({
  security: {
    checkOrigin: false, // Disable built-in, use @astroscope/csrf instead
  },
});
```

## Options

### `origin` (required)

The expected origin(s) to validate against.

```ts
// Single origin
origin: "https://example.com"

// Multiple origins (multi-domain apps)
origin: ["https://example.com", "https://app.example.com"]

// Dynamic (for runtime config)
origin: () => process.env.ALLOWED_ORIGINS.split(",")
```

### `exclude` (optional)

Paths to exclude from CSRF protection. Can be an array of patterns or a function.

**Pattern types:**

```ts
exclude: [
  { prefix: "/auth/" },           // path.startsWith("/auth/")
  { exact: "/webhook" },          // path === "/webhook"
  { pattern: /^\/api\/public\// } // regex.test(path)
]
```

**Function:**

```ts
exclude: (context) => {
  // Full access to APIContext for complex logic
  return context.url.pathname.startsWith("/public/");
}
```

## How it works

1. Skips non-mutating methods (GET, HEAD, OPTIONS)
2. Skips excluded paths
3. Compares request `Origin` header against `origin`
4. Returns 403 if origins don't match

## License

MIT
