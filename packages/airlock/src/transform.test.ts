import { describe, expect, test } from 'vitest';

import { type SchemaMapping, transformCompiledOutput } from './transform.js';

function makeCompiledOutput(components: { name: string; localVar: string; path: string; props: string }[]): string {
  const imports = [
    'import { renderComponent as $$renderComponent, createComponent as $$createComponent } from "astro/compiler-runtime";',
    ...components.map((c) => `import ${c.localVar} from "./${c.name}.mjs";`),
  ];

  const renders = components
    .map(
      (c) =>
        `\${$$renderComponent($$result, "${c.name}", ${c.localVar}, {${c.props}, "client:component-hydration": "load", "client:component-path": "${c.path}", "client:component-export": "default"})}`,
    )
    .join('\n');

  return `${imports.join('\n')}\nconst $$Page = $$createComponent(($$result) => {\n  return \`${renders}\`;\n});`;
}

const SIMPLE_OUTPUT = makeCompiledOutput([
  {
    name: 'UserCard',
    localVar: 'UserCard',
    path: '/src/components/UserCard',
    props: '"client:load": true, ...fullUser',
  },
]);

const MULTI_OUTPUT = makeCompiledOutput([
  {
    name: 'UserCard',
    localVar: 'UserCard',
    path: '/src/components/UserCard',
    props: '"client:load": true, ...fullUser',
  },
  {
    name: 'ItemList',
    localVar: 'ItemList',
    path: '/src/components/ItemList',
    props: '"client:visible": true, "items": fullItems, "heading": "Items"',
  },
]);

describe('transformCompiledOutput', () => {
  test('wraps props argument with __airlock_strip', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(SIMPLE_OUTPUT, schemas);

    expect(result.code).toContain('__airlock_strip(__s0, {');
    // renderComponent call is preserved (not renamed)
    expect(result.code).toContain('$$renderComponent($$result');
  });

  test('imports schemas and strip helper from virtual module', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(SIMPLE_OUTPUT, schemas);

    expect(result.code).toContain("from 'virtual:@astroscope/airlock/schemas'");
    expect(result.code).toContain('import { __s0, __airlock_strip }');
  });

  test('strips extension from component path in schema map match', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(SIMPLE_OUTPUT, schemas);

    // the call wraps with __s0 — meaning path without extension was matched
    expect(result.code).toContain('__airlock_strip(__s0');
  });

  test('handles multiple components with different schemas', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
      { specifier: '/src/components/ItemList.tsx', resolvedPath: '/src/components/ItemList.tsx', schemaId: '__s1' },
    ];
    const result = await transformCompiledOutput(MULTI_OUTPUT, schemas);

    expect(result.code).toContain('__airlock_strip(__s0');
    expect(result.code).toContain('__airlock_strip(__s1');
    expect(result.code).toContain('import { __s0, __s1, __airlock_strip }');
  });

  test('deduplicates schema imports', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
      { specifier: '/src/components/ItemList.tsx', resolvedPath: '/src/components/ItemList.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(MULTI_OUTPUT, schemas);

    const importLine = result.code.match(/import \{.*\} from 'virtual:/)?.[0];

    expect(importLine).toBeDefined();
    expect(importLine!.match(/__s0/g)).toHaveLength(1);
  });

  test('generates source map', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(SIMPLE_OUTPUT, schemas);

    expect(result.map).toBeDefined();
  });

  test('throws if renderComponent import not found', async () => {
    const code = 'const x = 1;';

    await expect(transformCompiledOutput(code, [])).rejects.toThrow('could not find renderComponent');
  });

  test('throws if expected component not found in compiled output', async () => {
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/Missing.tsx', resolvedPath: '/src/components/Missing.tsx', schemaId: '__s0' },
    ];

    await expect(transformCompiledOutput(SIMPLE_OUTPUT, schemas)).rejects.toThrow('not found in compiled output');
  });

  test('leaves non-hydrated renderComponent calls untouched', async () => {
    const code = makeCompiledOutput([
      { name: 'Layout', localVar: 'Layout', path: '', props: '"title": "Hello"' },
      {
        name: 'UserCard',
        localVar: 'UserCard',
        path: '/src/components/UserCard',
        props: '"client:load": true, ...user',
      },
    ]);
    const schemas: SchemaMapping[] = [
      { specifier: '/src/components/UserCard.tsx', resolvedPath: '/src/components/UserCard.tsx', schemaId: '__s0' },
    ];
    const result = await transformCompiledOutput(code, schemas);

    // Layout call has no schema wrapping (empty path, not in schema map)
    expect(result.code).toContain('$$renderComponent($$result, "Layout", Layout, {');
    // UserCard call IS wrapped
    expect(result.code).toContain('__airlock_strip(__s0');
  });

  test('handles plain renderComponent without $$ prefix', async () => {
    const code = `
import { renderComponent } from 'astro/compiler-runtime';
const page = () => renderComponent(result, "Comp", Comp, {"client:load": true, "client:component-path": "/src/Comp", "client:component-export": "default"});
`;
    const schemas: SchemaMapping[] = [{ specifier: '/src/Comp.tsx', resolvedPath: '/src/Comp.tsx', schemaId: '__s0' }];
    const result = await transformCompiledOutput(code, schemas);

    expect(result.code).toContain('__airlock_strip(__s0');
  });
});
