# @astroscope/csrf

CSRF protection with path exclusions — for webhooks, OIDC callbacks, and third-party integrations.

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
import { defineConfig } from 'astro/config';
import csrf from '@astroscope/csrf';

export default defineConfig({
  security: {
    allowedDomains: [
      /* your configuration here */
    ],
  },
  integrations: [
    csrf({
      exclude: [{ prefix: '/auth/' }, { exact: '/webhook' }],
    }),
  ],
});
```

Origin validation compares the request's `Origin` header against `context.url.origin`. Configure [`security.allowedDomains`](https://docs.astro.build/en/reference/configuration-reference/#securityalloweddomains) in your Astro config to ensure `context.url` reflects the actual request host.

## Options

### `exclude` (optional)

Paths to exclude from CSRF protection:

```ts
exclude: [
  { prefix: '/auth/' }, // path.startsWith("/auth/")
  { exact: '/webhook' }, // path === "/webhook"
  { pattern: /^\/api\/public\// }, // regex.test(path)
];
```

Or a function for complex logic:

```ts
exclude: (context) => context.url.pathname.startsWith('/public/');
```

### `enabled` (optional)

Disable CSRF protection (e.g., in development):

```ts
csrf({ enabled: import.meta.env.PROD });
```

## Manual middleware setup

For custom middleware chains, use `createCsrfMiddleware` directly:

```ts
// src/middleware.ts
import { sequence } from 'astro:middleware';
import { createCsrfMiddleware } from '@astroscope/csrf';

export const onRequest = sequence(
  createCsrfMiddleware({
    exclude: [{ prefix: '/auth/' }],
  }),
);
```

When using manual setup, disable Astro's built-in check:

```ts
// astro.config.ts
export default defineConfig({
  security: {
    checkOrigin: false,
    allowedDomains: [{}],
  },
});
```

## How it works

1. Skips non-mutating methods (GET, HEAD, OPTIONS)
2. Skips excluded paths
3. Compares request `Origin` header against `context.url.origin`
4. Returns 403 if origins don't match or Origin header is missing

## License

MIT
