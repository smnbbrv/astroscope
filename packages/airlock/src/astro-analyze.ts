import { parse } from '@astrojs/compiler';
import type { AttributeNode, ComponentNode, Node } from '@astrojs/compiler/types';
import ts from 'typescript';

export interface ImportInfo {
  specifier: string;
  exportName: string;
}

export interface HydratedComponent {
  name: string;
  importInfo?: ImportInfo | undefined;
}

export interface AnalysedAstroSource {
  imports: Map<string, ImportInfo>;
  hydratedComponents: HydratedComponent[];
}

/**
 * parse raw .astro source and extract all relevant info in a single pass:
 * AST, imports, and hydrated components.
 */
export async function analyzeAstroSource(raw: string): Promise<AnalysedAstroSource> {
  const { ast } = await parse(raw);

  // extract frontmatter value from AST — only parse that, not the template
  const frontmatterNode = ast.children.find((n): n is Node & { value: string } => n.type === 'frontmatter');
  const frontmatter = frontmatterNode?.value ?? '';

  const imports = resolveImports(frontmatter);
  const hydratedComponents = findHydratedComponents(ast.children, imports);

  return { imports, hydratedComponents };
}

/**
 * parse import declarations from frontmatter using TypeScript's parser.
 * returns a map of local binding name → { specifier, exportName }.
 */
function resolveImports(frontmatter: string): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();

  if (!frontmatter) return imports;

  const sourceFile = ts.createSourceFile(
    '__airlock__.ts',
    frontmatter,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;

    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;

    const specifier = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;

    if (!clause) continue;

    // default import: import Name from '...'
    if (clause.name) {
      imports.set(clause.name.text, { specifier, exportName: 'default' });
    }

    // named imports: import { A, B as C } from '...'
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const localName = element.name.text;
        const exportName = element.propertyName?.text ?? element.name.text;

        imports.set(localName, { specifier, exportName });
      }
    }

    // namespace import: import * as Name from '...'
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.set(clause.namedBindings.name.text, { specifier, exportName: '*' });
    }
  }

  return imports;
}

function findHydratedComponents(nodes: Node[], imports: Map<string, ImportInfo>): HydratedComponent[] {
  const components: HydratedComponent[] = [];

  function process(nodes: Node[], visitor: (node: Node) => void): void {
    for (const node of nodes) {
      visitor(node);

      if ('children' in node && Array.isArray(node.children)) {
        process(node.children as Node[], visitor);
      }
    }
  }

  process(nodes, (node) => {
    if (node.type !== 'component') return;

    const comp = node as ComponentNode;

    if (!comp.attributes.some((a: AttributeNode) => a.type === 'attribute' && a.name.startsWith('client:'))) return;

    components.push({
      name: comp.name,
      importInfo: imports.get(comp.name),
    });
  });

  return components;
}
