import ts from 'typescript';

/**
 * result of generating a Zod schema for a component's props.
 */
export interface SchemaGenResult {
  /** the root Zod schema expression (e.g., `z.object({...})`) */
  root: string;
  /** supporting type declarations for recursive types (e.g., z.lazy refs) */
  types: string[];
}

/**
 * generate a Zod schema expression for a resolved props type.
 *
 * @param checker - the TypeScript type checker
 * @param propsType - the resolved props type (framework adapter provides this)
 * @returns schema result, or null for ALLOW_ALL (any, unknown, index signatures)
 */
export function generateZodSchema(checker: ts.TypeChecker, propsType: ts.Type): SchemaGenResult | null {
  const ctx: GenContext = { visiting: new Set(), types: new Map(), counter: 0 };
  const root = toZod(checker, propsType, ctx);

  if (root === null) return null;

  return {
    root,
    types: [...ctx.types.values()].map((t) => `const ${t.name}: z.ZodType<any> = z.lazy(() => ${t.code});`),
  };
}

// --- context ---

interface GenContext {
  visiting: Set<ts.Type>;
  types: Map<ts.Type, { name: string; code: string }>;
  counter: number;
}

// --- core: type → Zod expression ---

/**
 * convert a TS type to a Zod expression string.
 * returns null for types that can't be represented as a Zod object schema (ALLOW_ALL).
 * for nested properties, null is mapped to 'z.any()' by the caller.
 */
function toZod(checker: ts.TypeChecker, type: ts.Type, ctx: GenContext): string | null {
  // recursion guard
  if (ctx.visiting.has(type)) return getOrCreateLazyRef(checker, type, ctx);

  const unwrapped = unwrapOptional(type);

  // primitives, any, unknown → can't build a schema
  if (isLeaf(unwrapped)) return null;

  // union of all primitives/literals (e.g. 'active' | 'inactive') → no object shape
  if (unwrapped.isUnion() && unwrapped.types.every((t) => isLeaf(t))) return null;

  // arrays → z.array(elementSchema)
  if (checker.isArrayType(type) || checker.isArrayType(unwrapped)) {
    return arrayToZod(checker, checker.isArrayType(type) ? type : unwrapped, ctx);
  }

  // Record<string, ...> / { [key: string]: ... } → allow all
  if (hasIndexSignature(checker, unwrapped)) return null;

  // discriminated union → z.discriminatedUnion(...)
  if (unwrapped.isUnion()) {
    const discriminant = findDiscriminant(checker, unwrapped);

    if (discriminant) return discriminatedUnionToZod(checker, unwrapped, discriminant, ctx);
  }

  // collect properties from the type (handles plain objects, unions, intersections)
  const properties = collectProperties(checker, unwrapped);

  if (!properties) return null;

  return propsToZodObject(checker, properties, type, ctx);
}

/**
 * build z.object({...}) from a map of property symbols.
 * marks the type as visiting for recursion detection.
 */
function propsToZodObject(
  checker: ts.TypeChecker,
  properties: Map<string, ts.Symbol>,
  type: ts.Type,
  ctx: GenContext,
): string {
  if (properties.size === 0) return 'z.object({})';

  ctx.visiting.add(type);

  const fields: string[] = [];

  for (const [name, prop] of properties) {
    const propType = checker.getTypeOfSymbol(prop);

    // pure function props (callbacks) → z.any()
    if (propType.getCallSignatures().length > 0 && !propType.getProperties().length) {
      fields.push(`${safeKey(name)}: z.any()`);
      continue;
    }

    fields.push(`${safeKey(name)}: ${toZod(checker, propType, ctx) ?? 'z.any()'}`);
  }

  ctx.visiting.delete(type);

  return `z.object({${fields.join(', ')}})`;
}

// --- property collection ---

/**
 * collect all named properties from a type.
 * for unions/intersections, merges properties from all branches.
 * returns null if any branch has an index signature (ALLOW_ALL).
 */
function collectProperties(checker: ts.TypeChecker, type: ts.Type): Map<string, ts.Symbol> | null {
  const result = new Map<string, ts.Symbol>();

  if (type.isUnion() || type.isIntersection()) {
    for (const member of type.types) {
      if (hasIndexSignature(checker, member)) return null;

      for (const prop of member.getProperties()) {
        result.set(prop.name, prop);
      }
    }
  } else {
    for (const prop of type.getProperties()) {
      result.set(prop.name, prop);
    }
  }

  return result;
}

// --- specific type handlers ---

function arrayToZod(checker: ts.TypeChecker, arrayType: ts.Type, ctx: GenContext): string {
  const typeArgs = (arrayType as ts.TypeReference).typeArguments;

  if (!typeArgs?.length) return 'z.any()';

  const elementZod = toZod(checker, typeArgs[0]!, ctx) ?? 'z.any()';

  return `z.array(${elementZod})`;
}

function discriminatedUnionToZod(
  checker: ts.TypeChecker,
  union: ts.UnionType,
  discriminant: string,
  ctx: GenContext,
): string {
  const variants: string[] = [];

  for (const member of union.types) {
    if (!isObjectLike(member)) continue;

    const fields: string[] = [];

    for (const prop of member.getProperties()) {
      const propType = checker.getTypeOfSymbol(prop);

      if (prop.name === discriminant && isLiteralType(propType)) {
        fields.push(`${safeKey(prop.name)}: z.literal(${getLiteralValue(propType)})`);
      } else {
        fields.push(`${safeKey(prop.name)}: ${toZod(checker, propType, ctx) ?? 'z.any()'}`);
      }
    }

    variants.push(`z.object({${fields.join(', ')}})`);
  }

  return `z.discriminatedUnion(${JSON.stringify(discriminant)}, [${variants.join(', ')}])`;
}

// --- recursion ---

function getOrCreateLazyRef(checker: ts.TypeChecker, type: ts.Type, ctx: GenContext): string {
  const existing = ctx.types.get(type);

  if (existing) return existing.name;

  const name = `__zr${ctx.counter++}`;

  ctx.types.set(type, { name, code: '' });
  ctx.visiting.delete(type);

  const code = toZod(checker, type, ctx) ?? 'z.any()';

  ctx.types.set(type, { name, code });

  return name;
}

// --- discriminant detection ---

function findDiscriminant(checker: ts.TypeChecker, union: ts.UnionType): string | null {
  if (union.types.length < 2) return null;

  const firstMember = union.types[0]!;

  for (const prop of firstMember.getProperties()) {
    if (!isLiteralType(checker.getTypeOfSymbol(prop))) continue;

    const allHaveLiteral = union.types.every((member) => {
      const memberProp = member.getProperty(prop.name);

      return memberProp ? isLiteralType(checker.getTypeOfSymbol(memberProp)) : false;
    });

    if (allHaveLiteral) return prop.name;
  }

  return null;
}

// --- type classification helpers ---

function isLeaf(type: ts.Type): boolean {
  return isPrimitive(type) || !!(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
}

function isPrimitive(type: ts.Type): boolean {
  const flags =
    // serializable primitives
    ts.TypeFlags.String |
    ts.TypeFlags.Number |
    ts.TypeFlags.Boolean |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.StringLiteral |
    ts.TypeFlags.NumberLiteral |
    ts.TypeFlags.BooleanLiteral |
    ts.TypeFlags.EnumLiteral |
    // not serializable but allowed — astro will error on these before airlock matters
    ts.TypeFlags.Void |
    ts.TypeFlags.BigInt |
    ts.TypeFlags.BigIntLiteral |
    ts.TypeFlags.ESSymbol |
    ts.TypeFlags.Never;

  return (type.flags & flags) !== 0;
}

function isObjectLike(type: ts.Type): boolean {
  return !isLeaf(type);
}

function isLiteralType(type: ts.Type): boolean {
  return !!(type.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral));
}

function getLiteralValue(type: ts.Type): string {
  if (type.isStringLiteral()) return JSON.stringify(type.value);

  if (type.isNumberLiteral()) return String(type.value);

  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return (type as unknown as { intrinsicName: string }).intrinsicName === 'true' ? 'true' : 'false';
  }

  return JSON.stringify(String(type));
}

// check for string index signatures (Record<string, ...>, { [key: string]: ... })
// these types accept arbitrary keys, so stripping doesn't apply → ALLOW_ALL
function hasIndexSignature(checker: ts.TypeChecker, type: ts.Type): boolean {
  try {
    return checker.getIndexTypeOfType(type, ts.IndexKind.String) !== undefined;
  } catch {
    return false;
  }
}

// strip undefined/null from unions to get the "real" type underneath optionals
// e.g. `string | undefined` → `string`, `number | null | undefined` → `number`
function unwrapOptional(type: ts.Type): ts.Type {
  if (!type.isUnion()) return type;

  const filtered = type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));

  if (filtered.length === 1) return filtered[0]!;

  return type;
}

// quote prop names that aren't valid JS identifiers (e.g. "data-hidden", "aria-label")
function safeKey(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}
