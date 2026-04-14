import type { PluginObj } from '@babel/core';
import type * as BabelTypes from '@babel/types';

import { VIRTUAL_MODULE_ID } from './schema-registry.js';
import { stripExt } from './utils.js';

export interface CompiledTransformResult {
  code: string;
  map: ReturnType<typeof JSON.parse> | null;
}

export interface SchemaMapping {
  /** component file path with extension (will be stripped for matching) */
  componentPath: string;
  /** schema ID from the registry (e.g. __s0) */
  schemaId: string;
}

/**
 * transform compiled .astro output by wrapping renderComponent props
 * with Zod schema .parse() calls.
 *
 * uses Babel to:
 * 1. find the renderComponent import via AST
 * 2. get all usages via scope binding.referencePaths
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

  // build lookup: path without extension → schemaId
  const schemaMap = new Map<string, string>();

  for (const m of schemas) {
    schemaMap.set(stripExt(m.componentPath), m.schemaId);
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
      '[@astroscope/airlock] could not find renderComponent import in compiled output. ' +
        "this may indicate a breaking change in Astro's compilation format. " +
        'airlock refuses to continue to prevent potential data leaks.',
    );
  }

  // verify all expected components were found in compiled output
  for (const m of schemas) {
    const pathWithoutExt = stripExt(m.componentPath);

    if (!matched.has(pathWithoutExt)) {
      throw new Error(
        `[@astroscope/airlock] component "${pathWithoutExt}" was detected in .astro source ` +
          'but not found in compiled output. airlock refuses to continue to prevent potential data leaks.',
      );
    }
  }

  if (!result?.code) {
    throw new Error('[@astroscope/airlock] babel transform returned no output.');
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
