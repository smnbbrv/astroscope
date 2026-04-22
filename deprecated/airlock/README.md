# DEPRECATED @astroscope/airlock

> Stripped excess props from hydrated Astro islands at runtime. Superseded by [`@astroscope/eslint-plugin`'s `no-excess-jsx-props`](../../packages/eslint-plugin), which catches the same leaks at lint time — before they ship.

Strip excess props from hydrated Astro islands — prevents server data leaking to the client, reduces HTML payload size.

## Why?

When Astro hydrates a framework component with `client:*` directives, **all props are serialized** into the HTML. TypeScript's structural typing allows passing objects with extra properties — those silently leak to the client.

```astro
---
const user = await db.getUser(id);
// user = { name, email, passwordHash, sessionToken, ... }
---

<!-- passwordHash and sessionToken end up in the page source -->
<UserCard client:load {...user} />
```

Airlock uses the component's TypeScript prop types to strip unknown keys before serialization. If `UserCard` declares `{ name: string; email: string }`, only those fields reach the client.

## Installation

```bash
npm install @astroscope/airlock
```

## Usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import airlock from '@astroscope/airlock';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react(), airlock()],
});
```

That's it. No changes to your components or templates.

## Important disclaimer

Airlock is **not a silver bullet** — it is an additional layer of defense. Passing sensitive server data to client components is still a bad practice. The best approach is to explicitly map only the fields you need. Airlock catches the cases where that discipline slips.

Example: a component that was correctly stripped can silently break if someone changes its props type to `any` or `Record<string, unknown>` — airlock sees "allow all" and stops stripping. A refactor that widens a type can undo the protection without any visible error. Airlock catches accidental leaks, but it can't protect against type definitions that explicitly opt out of safety.

If hydrated components in your `.astro` source are detected but cannot be matched in the compiled output, **the build will fail**. This is intentional — breaking the build is safer than silently leaking data.

## How it works

Under the hood, airlock generates [Zod](https://zod.dev) schemas from your component's TypeScript types and uses `.parse()` to strip unknown keys at the serialization boundary.

1. **Detects hydrated components** — parses raw `.astro` source using `@astrojs/compiler` to find components with `client:*` directives
2. **Extracts prop types** — uses the TypeScript compiler API to resolve the component's declared prop types
3. **Generates Zod schemas** — converts prop types to Zod schema code (e.g. `z.object({ name: z.any(), email: z.any() })`)
4. **Wraps props in compiled output** — uses Babel to find `renderComponent` calls via scope analysis and wraps their props argument with `schema.parse()`
5. **Schemas are shared** — a virtual module holds all schemas, so each is created once at runtime regardless of how many pages use the component
6. **Verifies completeness** — every detected component must be found in the compiled output, otherwise the build fails

### Before (what Astro serializes)

```html
<astro-island
  props='{"name":"John","email":"j@test.com","passwordHash":"$2b$10$...","sessionToken":"eyJ..."}'
></astro-island>
```

### After (with airlock)

```html
<astro-island props='{"name":"John","email":"j@test.com"}'></astro-island>
```

## What it handles

- **Flat objects** — strips top-level excess keys
- **Nested objects** — recursively strips at every level
- **Arrays of objects** — strips excess keys from each element
- **Discriminated unions** — uses `z.discriminatedUnion()` for precise per-variant stripping
- **Recursive types** — handles self-referencing types via `z.lazy()`
- **Generic components** — extracts prop shapes from type parameter constraints
- **All import styles** — default, named, aliased (`import { Card as UserCard }`)
- **Record / index signatures** — treated as ALLOW_ALL (no stripping)

### When stripping is skipped

Airlock skips stripping entirely for components whose props type intentionally accepts arbitrary keys:

- **Entire props type** is `any`, `unknown`, or `Record<string, unknown>` — no type info to strip with
- Components with no user props (only `client:*` directives)

Note: individual properties typed as `any` are still kept — only their **keys** matter for stripping. `{ data: any; title: string }` keeps both `data` and `title`, but strips any other key. The `data` contents will be passed as-is.

These components pass all props through unchanged.

## Framework support

Currently supports **React / Preact** components (`.tsx`, `.ts`, `.jsx`, `.js`).

The architecture uses a pluggable adapter pattern — Vue and Svelte adapters can be added without changing the core.

## Logging

Airlock always logs a summary during build:

```
[@astroscope/airlock] transformed 3 of 4 hydrated component usage(s)
```

Per-component details (ALLOW_ALL types, unresolved imports, etc.) are logged at debug level — visible with `--verbose`.

## License

MIT
