import { describe, expect, test } from 'vitest';

import { analyzeAstroSource } from './astro-analyze.js';

function importOf(code: string, componentName: string) {
  return analyzeAstroSource(code).then((r) => r.imports.get(componentName));
}

describe('analyzeAstroSource — import resolution', () => {
  test('default import', async () => {
    const info = await importOf('---\nimport UserCard from "./UserCard";\n---\n<UserCard client:load />', 'UserCard');

    expect(info).toEqual({ specifier: './UserCard', exportName: 'default' });
  });

  test('named import', async () => {
    const info = await importOf(
      '---\nimport { UserCard } from "./components";\n---\n<UserCard client:load />',
      'UserCard',
    );

    expect(info).toEqual({ specifier: './components', exportName: 'UserCard' });
  });

  test('aliased default import', async () => {
    const info = await importOf(
      '---\nimport { default as UserCard } from "./UserCard";\n---\n<UserCard client:load />',
      'UserCard',
    );

    expect(info).toEqual({ specifier: './UserCard', exportName: 'default' });
  });

  test('aliased named import', async () => {
    const info = await importOf(
      '---\nimport { Card as UserCard } from "./components";\n---\n<UserCard client:load />',
      'UserCard',
    );

    expect(info).toEqual({ specifier: './components', exportName: 'Card' });
  });

  test('mixed default + named import', async () => {
    const info = await importOf(
      '---\nimport Layout, { UserCard } from "./components";\n---\n<UserCard client:load />',
      'UserCard',
    );

    expect(info).toEqual({ specifier: './components', exportName: 'UserCard' });
  });

  test('mixed default + named — default binding', async () => {
    const info = await importOf(
      '---\nimport Layout, { UserCard } from "./components";\n---\n<Layout client:load />',
      'Layout',
    );

    expect(info).toEqual({ specifier: './components', exportName: 'default' });
  });

  test('multiple named imports', async () => {
    const code = '---\nimport { UserCard, Newsletter } from "./components";\n---\n<UserCard client:load />';
    const result = await analyzeAstroSource(code);

    expect(result.imports.get('UserCard')).toEqual({ specifier: './components', exportName: 'UserCard' });
    expect(result.imports.get('Newsletter')).toEqual({ specifier: './components', exportName: 'Newsletter' });
  });
});

describe('analyzeAstroSource — hydrated component detection', () => {
  test('finds components with client:* directives', async () => {
    const code = '---\nimport A from "./A";\nimport B from "./B";\n---\n<A client:load /><B />';
    const result = await analyzeAstroSource(code);

    expect(result.hydratedComponents).toHaveLength(1);
    expect(result.hydratedComponents[0]!.name).toBe('A');
  });

  test('detects various client: directive forms', async () => {
    const code = `---
import A from "./A";
import B from "./B";
import C from "./C";
---
<A client:load />
<B client:visible />
<C client:idle />`;
    const result = await analyzeAstroSource(code);

    expect(result.hydratedComponents).toHaveLength(3);
  });

  test('skips components without client: directives', async () => {
    const code = '---\nimport Layout from "./Layout";\n---\n<Layout title="test" />';
    const result = await analyzeAstroSource(code);

    expect(result.hydratedComponents).toHaveLength(0);
  });

  test('skips native HTML elements', async () => {
    const code = '<div class="test">hello</div>';
    const result = await analyzeAstroSource(code);

    expect(result.hydratedComponents).toHaveLength(0);
  });
});
