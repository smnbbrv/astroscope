import type { PluginObj } from '@babel/core';
import type * as BabelTypes from '@babel/types';

import { VIRTUAL_MODULE_ID } from './schema-registry.js';
import { stripExt } from './utils.js';

export interface CompiledTransformResult {
  code: string;
  map: ReturnType<typeof JSON.parse> | null;
}

export interface SchemaMapping {
  /** import specifier as it appears in the .astro source (e.g. @/components/Cart) */
  specifier: string;
  /** absolute resolved file path (e.g. /Users/.../Cart.tsx) */
  resolvedPath: string;
  /** schema ID from the registry (e.g. __s0) */
  schemaId: string;
}

/**
 * transform compiled .astro output by wrapping renderComponent props
 * with Zod schema .parse() calls.
 *
 * uses Babel to:
 * 1. find the renderComponent import via AST
 * 2. get all call sites via scope binding.referencePaths
 * 3. for each call, check client:component-path against schema map
 * 4. wrap the props argument with __airlock_strip(schema, props)
 *
 * throws if expected components are not found — security-first.
 */
export async function transformCompiledOutput(
  code: string,
  schemas: SchemaMapping[],
): Promise<CompiledTransformResult> {
  const babel = await import('@babel/core');

  // build lookup: component path → schemaId
  // astro uses the import specifier for aliases (@/) but resolved absolute paths for relative imports
  const schemaMap = new Map<string, string>();

  for (const m of schemas) {
    // alias specifiers (e.g. @/components/Cart) — used as-is by Astro
    schemaMap.set(m.specifier, m.schemaId);
    // resolved absolute path without extension (e.g. /Users/.../Cart) — used for relative imports
    schemaMap.set(stripExt(m.resolvedPath), m.schemaId);
  }

  const matched = new Set<string>();
  const usedSchemaIds = new Set<string>();
  let renderComponentFound = false;

  const plugin = ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    visitor: {
      ImportDeclaration(path) {
        if (!path.node.source.value.includes('compiler-runtime')) return;

        for (const specifier of path.node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const imported = specifier.imported;
          const importedName = 'name' in imported ? imported.name : imported.value;

          if (importedName !== 'renderComponent') continue;

          renderComponentFound = true;

          const localName = specifier.local.name;
          const binding = path.scope.getBinding(localName);

          if (!binding) break;

          for (const refPath of binding.referencePaths) {
            const callPath = refPath.parentPath;

            if (!callPath?.isCallExpression()) continue;

            const propsArg = callPath.node.arguments[3];

            if (!propsArg || !t.isObjectExpression(propsArg)) continue;

            const componentPath = getStringProp(t, propsArg);

            if (!componentPath) continue;

            const schemaId = schemaMap.get(componentPath);

            if (!schemaId) continue;

            matched.add(componentPath);
            usedSchemaIds.add(schemaId);

            callPath.node.arguments[3] = t.callExpression(t.identifier('__airlock_strip'), [
              t.identifier(schemaId),
              propsArg,
            ]);
          }

          break;
        }
      },
    },
  });

  const result = babel.transformSync(code, {
    plugins: [plugin],
    sourceType: 'module',
    sourceMaps: true,
    configFile: false,
    babelrc: false,
  });

  if (!renderComponentFound) {
    throw new Error(
      'could not find renderComponent import in compiled output. ' +
        "this may indicate a breaking change in Astro's compilation format. " +
        'airlock refuses to continue to prevent potential data leaks.',
    );
  }

  // verify all expected components were found in compiled output
  for (const m of schemas) {
    if (!matched.has(m.specifier) && !matched.has(stripExt(m.resolvedPath))) {
      const foundPaths = [...matched].join(', ') || '(none)';

      throw new Error(
        `component "${m.specifier}" was detected in .astro source ` +
          `but not found in compiled output (matched: ${foundPaths}). ` +
          'airlock refuses to continue to prevent potential data leaks.',
      );
    }
  }

  if (!result?.code) {
    throw new Error('babel transform returned no output.');
  }

  // prepend: import schemas + strip helper from virtual module
  const imports = [...usedSchemaIds, '__airlock_strip'];
  const importLine = `import { ${imports.join(', ')} } from '${VIRTUAL_MODULE_ID}';`;

  return {
    code: `${importLine}\n${result.code}`,
    map: result.map,
  };
}

// extract the string value of "client:component-path" from a props object expression
function getStringProp(t: typeof BabelTypes, obj: BabelTypes.ObjectExpression): string | null {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;

    let propName: string | null = null;

    if (t.isIdentifier(prop.key)) propName = prop.key.name;
    else if (t.isStringLiteral(prop.key)) propName = prop.key.value;

    if (propName !== 'client:component-path') continue;

    if (t.isStringLiteral(prop.value)) return prop.value.value;
  }

  return null;
}
