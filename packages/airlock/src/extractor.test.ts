import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { type SchemaGenResult, generateZodSchema } from './extractor.js';

/**
 * helper to create an in-memory TypeScript program and extract a Zod schema.
 */
function extractFromSource(source: string, exportName = 'default'): SchemaGenResult | null {
  const fileName = '/test.tsx';

  const reactTypes = `
    declare namespace React {
      type ReactNode = string | number | boolean | null | undefined;
      type FC<P = {}> = (props: P) => ReactNode;
    }
  `;

  const files = new Map<string, string>([
    [fileName, source],
    ['/react.d.ts', reactTypes],
  ]);

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
  };

  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (name, languageVersion) => {
    const content = files.get(name);

    if (content !== undefined) {
      return ts.createSourceFile(name, content, languageVersion);
    }

    return originalGetSourceFile(name, languageVersion);
  };

  host.fileExists = (name) => files.has(name) || ts.sys.fileExists(name);
  host.readFile = (name) => files.get(name) ?? ts.sys.readFile(name);

  const program = ts.createProgram([fileName, '/react.d.ts'], compilerOptions, host);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName);

  if (!sourceFile) throw new Error('source file not found');

  // resolve the props type the same way the React adapter does
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

  if (!moduleSymbol) return null;

  const target = exportName === 'default' ? 'default' : exportName;
  let exportSymbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.escapedName === target);

  if (!exportSymbol) return null;

  while (exportSymbol.flags & ts.SymbolFlags.Alias) {
    exportSymbol = checker.getAliasedSymbol(exportSymbol);
  }

  const callSigs = checker.getTypeOfSymbol(exportSymbol).getCallSignatures();

  if (!callSigs.length || !callSigs[0]!.getParameters().length) return null;

  const propsType = checker.getTypeOfSymbol(callSigs[0]!.getParameters()[0]!);

  return generateZodSchema(checker, propsType);
}

/**
 * recursively inline all variable references (_t0, _t1, ...) in the root schema code,
 * producing a fully-expanded expression string for backward-compatible assertions.
 *
 * uses a stack to detect true recursion (a schema referencing itself) — leaves the name as-is.
 */
function resolveInline(result: SchemaGenResult): string {
  const { rootRef, schemas } = result;
  const rootCode = schemas.get(rootRef);

  if (!rootCode) return rootRef;

  function inline(code: string, stack: Set<string>): string {
    return code.replace(/_s[0-9a-f]{8}/g, (match) => {
      if (stack.has(match)) return match;

      const resolved = schemas.get(match);

      if (!resolved) return match;

      stack.add(match);
      const result = inline(resolved, stack);

      stack.delete(match);

      return result;
    });
  }

  return inline(rootCode, new Set([rootRef]));
}

/** shorthand: extract, resolve inline, and return the fully-expanded schema expression */
function schemaOf(source: string, exportName = 'default'): string | null {
  const result = extractFromSource(source, exportName);

  if (!result) return null;

  return resolveInline(result);
}

describe('generateZodSchema', () => {
  test('simple props { title: string; count: number }', () => {
    const schema = schemaOf(`
      interface Props { title: string; count: number; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.object(');
    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('count: z.any()');
  });

  test('nested objects', () => {
    const schema = schemaOf(`
      interface Props { user: { name: string; email: string }; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('user: z.object({name: z.any(), email: z.any()})');
  });

  test('object arrays', () => {
    const schema = schemaOf(`
      interface Props { items: { id: string; label: string }[]; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('items: z.array(z.object({id: z.any(), label: z.any()}))');
  });

  test('primitive arrays', () => {
    const schema = schemaOf(`
      interface Props { tags: string[]; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('tags: z.array(z.any())');
  });

  test('optional props are included', () => {
    const schema = schemaOf(`
      interface Props { title?: string | undefined; count: number; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('count: z.any()');
  });

  test('union of primitives → z.any()', () => {
    const schema = schemaOf(`
      interface Props { status: 'active' | 'inactive'; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('status: z.any()');
  });

  test('Record<string, unknown> → null (ALLOW_ALL)', () => {
    const result = extractFromSource(`
      export default function Comp(props: Record<string, unknown>) { return null; }
    `);

    expect(result).toBeNull();
  });

  test('any props → null (ALLOW_ALL)', () => {
    const result = extractFromSource(`
      export default function Comp(props: any) { return null; }
    `);

    expect(result).toBeNull();
  });

  test('function component with parameter type', () => {
    const schema = schemaOf(`
      type Props = { name: string; age: number; };
      export default function MyComponent(props: Props) { return null; }
    `);

    expect(schema).toContain('name: z.any()');
    expect(schema).toContain('age: z.any()');
  });

  test('arrow function component', () => {
    const schema = schemaOf(`
      type Props = { value: string; };
      const Comp = (props: Props) => null;
      export default Comp;
    `);

    expect(schema).toContain('value: z.any()');
  });

  test('React.FC<Props> pattern', () => {
    const schema = schemaOf(`
      type Props = { title: string; active: boolean; };
      const Comp: React.FC<Props> = (props) => null;
      export default Comp;
    `);

    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('active: z.any()');
  });

  test('intersection types → merged', () => {
    const schema = schemaOf(`
      type Base = { id: string; };
      type Extra = { label: string; };
      export default function Comp(props: Base & Extra) { return null; }
    `);

    expect(schema).toContain('id: z.any()');
    expect(schema).toContain('label: z.any()');
  });

  test('interface inheritance → merged', () => {
    const schema = schemaOf(`
      interface Base { id: string; }
      interface Props extends Base { label: string; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('id: z.any()');
    expect(schema).toContain('label: z.any()');
  });

  test('empty/no props → null', () => {
    const result = extractFromSource(`
      export default function Comp() { return null; }
    `);

    expect(result).toBeNull();
  });

  test('children prop is included', () => {
    const schema = schemaOf(`
      interface Props { title: string; children: React.ReactNode; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('children: z.any()');
  });

  test('named export extraction', () => {
    const schema = schemaOf(
      `
      interface Props { x: number; }
      export function Widget(props: Props) { return null; }
    `,
      'Widget',
    );

    expect(schema).toContain('x: z.any()');
  });

  test('deeply nested objects', () => {
    const schema = schemaOf(`
      interface Props {
        config: {
          theme: { primary: string; secondary: string; };
          debug: boolean;
        };
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('config: z.object(');
    expect(schema).toContain('theme: z.object({primary: z.any(), secondary: z.any()})');
    expect(schema).toContain('debug: z.any()');
  });

  test('callback props → z.any()', () => {
    const schema = schemaOf(`
      interface Props { onClick: () => void; onChange: (value: string) => void; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('onClick: z.any()');
    expect(schema).toContain('onChange: z.any()');
  });

  test('index signature on props → null (ALLOW_ALL)', () => {
    const result = extractFromSource(`
      interface Props { [key: string]: unknown; title: string; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).toBeNull();
  });

  test('nonexistent export returns null', () => {
    const result = extractFromSource(
      `export default function Comp(props: { x: number }) { return null; }`,
      'NonExistent',
    );

    expect(result).toBeNull();
  });

  test('direct recursive type — produces schemas with cycle reference', () => {
    const result = extractFromSource(`
      interface TreeNode {
        label: string;
        children: TreeNode[];
      }
      interface Props {
        tree: TreeNode;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    // root references a named schema
    expect(result!.schemas.has(result!.rootRef)).toBe(true);
    // should have multiple schemas (root props + TreeNode + TreeNode[])
    expect(result!.schemas.size).toBeGreaterThan(1);

    // the inlined schema should contain tree and reference the cycle
    const inlined = resolveInline(result!);

    expect(inlined).toContain('tree:');
    expect(inlined).toContain('children:');
  });

  test('indirect recursive types — produces schemas with cycle reference', () => {
    const result = extractFromSource(`
      interface NodeA {
        value: string;
        related: NodeB;
      }
      interface NodeB {
        count: number;
        parent: NodeA;
      }
      interface Props {
        root: NodeA;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    expect(result!.schemas.size).toBeGreaterThan(1);

    const inlined = resolveInline(result!);

    expect(inlined).toContain('root:');
    expect(inlined).toContain('related:');
  });

  test('self-referencing optional property — produces schemas with cycle reference', () => {
    const result = extractFromSource(`
      interface LinkedNode {
        value: number;
        next?: LinkedNode | undefined;
      }
      interface Props {
        head: LinkedNode;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    expect(result!.schemas.size).toBeGreaterThan(1);

    const inlined = resolveInline(result!);

    expect(inlined).toContain('head:');
    expect(inlined).toContain('next:');
  });

  test('generic component — unconstrained T falls back to z.any()', () => {
    const schema = schemaOf(`
      interface Props<T> {
        items: T[];
        label: string;
      }
      export default function List<T>(props: Props<T>) { return null; }
    `);

    expect(schema).toContain('label: z.any()');
    // T is unresolved — items should still be captured as array
    expect(schema).toContain('items:');
  });

  test('generic component — constrained T uses constraint shape', () => {
    const schema = schemaOf(`
      interface HasId { id: string; name: string; }
      interface Props<T extends HasId> {
        items: T[];
        title: string;
      }
      export default function List<T extends HasId>(props: Props<T>) { return null; }
    `);

    expect(schema).toContain('title: z.any()');
    // constraint shape { id, name } is extracted from the type parameter bound
    expect(schema).toContain('items: z.array(z.object({id: z.any(), name: z.any()}))');
  });

  test('discriminated union', () => {
    const schema = schemaOf(`
      type Shape =
        | { type: 'circle'; radius: number }
        | { type: 'rect'; width: number; height: number };
      interface Props {
        shape: Shape;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion(');
    expect(schema).toContain('z.literal(');
  });

  test('recursive discriminated union inside array — no stack overflow', () => {
    const result = extractFromSource(`
      type ContentBlock =
        | { type: 'text'; value: string }
        | { type: 'group'; children: ContentBlock[] };
      interface Props {
        blocks: ContentBlock[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    expect(result!.schemas.size).toBeGreaterThan(1);

    const inlined = resolveInline(result!);

    expect(inlined).toContain('blocks:');
    expect(inlined).toContain('z.discriminatedUnion(');
  });

  test('deeply nested array of discriminated unions — no stack overflow', () => {
    const result = extractFromSource(`
      type Node =
        | { kind: 'leaf'; label: string }
        | { kind: 'branch'; items: Node[]; meta: { score: number } };
      interface Props {
        tree: Node[];
        title: string;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();

    const inlined = resolveInline(result!);

    expect(inlined).toContain('tree:');
    expect(inlined).toContain('title: z.any()');
  });

  test('kitchen sink — nested types, unions, recursion, generics, discriminated unions', () => {
    const result = extractFromSource(`
      // recursive tree node
      interface TreeNode {
        label: string;
        children: TreeNode[];
      }

      // discriminated union
      type Media =
        | { kind: 'image'; src: string; alt: string }
        | { kind: 'video'; url: string; duration: number };

      // generic with constraint
      interface HasId { id: string }
      interface Paginated<T extends HasId> {
        items: T[];
        total: number;
        nextCursor?: string | undefined;
      }

      // nested config
      interface Theme {
        colors: { primary: string; secondary: string };
        fonts: string[];
      }

      interface Props {
        // primitives
        title: string;
        count: number;
        active: boolean;

        // nested object
        theme: Theme;

        // recursive
        tree: TreeNode;

        // discriminated union
        media: Media;

        // generic with constraint
        page: Paginated<{ id: string; name: string; secret: string }>;

        // callback
        onClick: () => void;

        // optional
        subtitle?: string | undefined;

        // Record — allow all
        metadata: Record<string, unknown>;

        // array of primitives
        tags: string[];

        // data attribute (needs quoting)
        "data-testid": string;
      }

      export default function KitchenSink(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();

    const schema = resolveInline(result!);

    // primitives → z.any()
    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('count: z.any()');
    expect(schema).toContain('active: z.any()');

    // nested object
    expect(schema).toContain('theme: z.object({colors: z.object({primary: z.any(), secondary: z.any()})');

    // recursive — produces multiple schemas
    expect(result!.schemas.size).toBeGreaterThan(1);

    // discriminated union
    expect(schema).toContain('z.discriminatedUnion("kind"');
    expect(schema).toContain('z.literal("image")');
    expect(schema).toContain('z.literal("video")');

    // generic with constraint — extracts id, name, secret from the concrete type arg
    expect(schema).toContain('page: z.object({items: z.array(z.object({id: z.any(), name: z.any(), secret: z.any()}))');
    expect(schema).toContain('total: z.any()');
    expect(schema).toContain('nextCursor: z.any()');

    // callback → z.any()
    expect(schema).toContain('onClick: z.any()');

    // optional → still present
    expect(schema).toContain('subtitle: z.any()');

    // Record<string, unknown> → z.any() (allow all for that prop)
    expect(schema).toContain('metadata: z.any()');

    // primitive array
    expect(schema).toContain('tags: z.array(z.any())');

    // quoted key
    expect(schema).toContain('"data-testid": z.any()');
  });

  test('deeply nested protobuf/GQL-like types — no infinite loop', () => {
    const result = extractFromSource(`
      // simulates generated protobuf/GQL types with deep nesting
      interface Address {
        street: string;
        city: string;
        country: { code: string; name: string; continent: { id: string; regions: { name: string }[] } };
      }

      interface OrderItem {
        product: {
          id: string;
          name: string;
          category: { id: string; parent?: { id: string; parent?: { id: string } | undefined } | undefined };
          variants: { sku: string; price: { amount: number; currency: string }; attributes: Record<string, string> }[];
        };
        quantity: number;
      }

      interface PaymentInfo {
        method: { type: 'card'; last4: string } | { type: 'paypal'; email: string } | { type: 'invoice'; ref: string };
        billing: Address;
      }

      interface Props {
        customer: { name: string; email: string; addresses: Address[] };
        items: OrderItem[];
        payment: PaymentInfo;
        meta: Record<string, unknown>;
      }

      export default function Checkout(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();

    const inlined = resolveInline(result!);

    expect(inlined).toContain('customer:');
    expect(inlined).toContain('items:');
    expect(inlined).toContain('payment:');
    // Record<string, unknown> → z.any()
    expect(inlined).toContain('meta: z.any()');
  });

  test('optional object prop (T | undefined) generates .optional()', () => {
    const schema = schemaOf(`
      type Info = { id: string };
      interface Props {
        config: Info | undefined;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('config: z.object({id: z.any()}).optional()');
  });

  test('optional array prop (T[] | undefined) generates .optional()', () => {
    const schema = schemaOf(`
      interface Props {
        items: { id: string }[] | undefined;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('items: z.array(z.object({id: z.any()})).optional()');
  });

  test('required object prop does not get .optional()', () => {
    const schema = schemaOf(`
      type Info = { id: string };
      interface Props {
        config: Info;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('config: z.object({id: z.any()})');
    expect(schema).not.toContain('.optional()');
  });

  test('discriminated union with union-of-literals discriminant', () => {
    const schema = schemaOf(`
      type Item =
        | { kind: 'a'; extras: string[] }
        | { kind: 'b' | 'c'; price: { amount: number } };
      interface Props {
        items: Item[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion("kind"');
    expect(schema).toContain('z.literal("a")');
    expect(schema).toContain('z.literal("b")');
    expect(schema).toContain('z.literal("c")');
  });

  test('discriminated union with number literal discriminant', () => {
    const schema = schemaOf(`
      type Item =
        | { code: 1; label: string }
        | { code: 2; value: number };
      interface Props { item: Item; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion("code"');
    expect(schema).toContain('z.literal(1)');
    expect(schema).toContain('z.literal(2)');
  });

  test('discriminated union with boolean literal discriminant', () => {
    const schema = schemaOf(`
      type Item =
        | { active: true; data: { id: string } }
        | { active: false; reason: string };
      interface Props { item: Item; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion("active"');
    expect(schema).toContain('z.literal(true)');
    expect(schema).toContain('z.literal(false)');
  });

  test('discriminated union with enum discriminant including multi-value member', () => {
    const schema = schemaOf(`
      enum Kind { A = "a", B = "b", C = "c" }
      type Item =
        | { kind: Kind.A; extras: string[] }
        | { kind: Kind.B | Kind.C; price: { amount: number } };
      interface Props {
        items: Item[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion("kind"');
    expect(schema).toContain('z.literal("a")');
    expect(schema).toContain('z.literal("b")');
    expect(schema).toContain('z.literal("c")');
  });

  test('intersection of union and object with T | undefined prop generates .optional()', () => {
    const result = extractFromSource(`
      type Card = { image: string };
      type Item = (
        | { type: 'custom'; links: string[] }
        | { type: 'regions'; items: string[] }
        | { type: 'link'; url: string }
      ) & {
        title: string;
        teaserCard: Card | undefined;
      };
      interface Props {
        navigationItems: Item[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();

    const inlined = resolveInline(result!);

    expect(inlined).toContain('teaserCard:');
    expect(inlined).toContain('.optional()');
    // teaserCard should be optional, not required
    expect(inlined).not.toMatch(/teaserCard: z\.object\(\{image: z\.any\(\)\}\)[^.]/);
  });

  test('symbol-optional object prop (foo?: T) generates .optional()', () => {
    const schema = schemaOf(`
      type Card = { image: string };
      interface Props {
        teaserCard?: Card;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('teaserCard: z.object({image: z.any()}).optional()');
  });

  test('non-discriminated union — variant-specific props become optional', () => {
    const schema = schemaOf(`
      type Item =
        | { title: string; href: string; teaserCard: { image: string } }
        | { title: string; href: string };
      interface Props {
        items: Item[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('title: z.any()');
    expect(schema).toContain('href: z.any()');
    // teaserCard only exists on one variant → must be optional
    expect(schema).toContain('teaserCard: z.object({image: z.any()}).optional()');
  });

  test('CMS content block recursive discriminated union — no infinite loop', () => {
    // simulates CMS rich-text content blocks (like Contello)
    const result = extractFromSource(`
      type InlineNode =
        | { type: 'text'; value: string; bold?: boolean | undefined }
        | { type: 'link'; href: string; children: InlineNode[] };

      type BlockNode =
        | { type: 'paragraph'; children: InlineNode[] }
        | { type: 'heading'; level: number; children: InlineNode[] }
        | { type: 'list'; ordered: boolean; items: BlockNode[] }
        | { type: 'blockquote'; children: BlockNode[] }
        | { type: 'image'; src: string; alt: string };

      interface Props {
        content: BlockNode[];
        className?: string | undefined;
      }

      export default function RichText(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    expect(result!.schemas.size).toBeGreaterThan(1);

    const inlined = resolveInline(result!);

    expect(inlined).toContain('content:');
    expect(inlined).toContain('className: z.any()');
  });

  test('deep nesting (55 levels) — no depth limit, all types get schemas', () => {
    // generate a chain of 55 distinct non-recursive types: L0 = { nested: L1 }, L1 = { nested: L2 }, ...
    const types = Array.from({ length: 55 }, (_, i) => {
      const inner = i < 54 ? `L${i + 1}` : '{ value: string }';

      return `interface L${i} { nested: ${inner}; tag: string; }`;
    }).join('\n');

    const source = `
      ${types}
      interface Props { root: L0; }
      export default function Comp(props: Props) { return null; }
    `;

    const result = extractFromSource(source);

    expect(result).not.toBeNull();
    // no depth limit — all 55 levels + the leaf { value: string } + root props get schemas
    expect(result!.schemas.size).toBeGreaterThan(55);

    const inlined = resolveInline(result!);

    // the deepest leaf should be fully inlined
    expect(inlined).toContain('value: z.any()');
  });

  test('content-hash deduplication — same type reused produces one schema', () => {
    const result = extractFromSource(`
      type Info = { id: string; name: string };
      interface Props {
        primary: Info;
        secondary: Info;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();

    const inlined = resolveInline(result!);

    expect(inlined).toContain('primary: z.object({id: z.any(), name: z.any()})');
    expect(inlined).toContain('secondary: z.object({id: z.any(), name: z.any()})');
    // both should reference the same schema — only 2 schemas total (root + Info)
    expect(result!.schemas.size).toBe(2);
  });

  test('discriminated union variant with optional prop in member', () => {
    const schema = schemaOf(`
      type Shape =
        | { type: 'circle'; radius: number; label?: string | undefined }
        | { type: 'rect'; width: number };
      interface Props { shape: Shape; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.discriminatedUnion(');
    expect(schema).toContain('label: z.any().optional()');
    expect(schema).not.toMatch(/width: z\.any\(\)\.optional/);
  });

  test('mutual recursion — A references B, B references A', () => {
    const result = extractFromSource(`
      interface Person {
        name: string;
        company: Company;
      }
      interface Company {
        title: string;
        ceo: Person;
      }
      interface Props {
        person: Person;
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    expect(result!.schemas.size).toBeGreaterThan(2);

    // no leaked temp placeholders
    for (const code of result!.schemas.values()) {
      expect(code).not.toMatch(/__t\d+/);
    }

    const inlined = resolveInline(result!);

    expect(inlined).toContain('person:');
    expect(inlined).toContain('company:');
    expect(inlined).toContain('ceo:');
  });

  test('indexed access on union yielding structurally identical arrays → z.array', () => {
    // when you index a discriminated union on a shared
    // array-typed prop, TS distributes but does NOT dedupe structurally identical members,
    // so the resulting type is `T[] | T[]`. without explicit handling this fell through
    // to object-property collection and emitted z.object({ length, push, ... }).
    const schema = schemaOf(`
      type Toggle =
        | { categories: { id: string; title: string }[]; multiple?: false | undefined }
        | { categories: { id: string; title: string }[]; multiple: true };
      interface Props {
        categories: Toggle['categories'];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('categories: z.array(z.object({id: z.any(), title: z.any()}))');
    expect(schema).not.toContain('length:');
    expect(schema).not.toContain('push:');
  });

  test('union of distinct array types → z.union of arrays', () => {
    const schema = schemaOf(`
      interface Props {
        items: { a: string }[] | { b: number }[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('z.union([');
    expect(schema).toContain('z.array(z.object({a: z.any()}))');
    expect(schema).toContain('z.array(z.object({b: z.any()}))');
  });

  test('tuple-like array (no type args) falls back to z.any()', () => {
    const schema = schemaOf(`
      interface Props {
        items: { id: string }[];
        raw: any[];
      }
      export default function Comp(props: Props) { return null; }
    `);

    expect(schema).toContain('items:');
    expect(schema).toContain('raw: z.array(z.any())');
  });

  test('schema result uses rootRef and schemas map', () => {
    const result = extractFromSource(`
      interface Props { user: { name: string }; }
      export default function Comp(props: Props) { return null; }
    `);

    expect(result).not.toBeNull();
    // rootRef is a hash-based variable name
    expect(result!.rootRef).toMatch(/^_s[0-9a-f]{8}$/);
    // schemas map contains entries
    expect(result!.schemas.size).toBeGreaterThan(0);
    // rootRef exists in schemas
    expect(result!.schemas.has(result!.rootRef)).toBe(true);
    // root schema is a z.object expression
    expect(result!.schemas.get(result!.rootRef)).toContain('z.object(');
  });
});
