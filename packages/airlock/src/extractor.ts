import { createHash } from 'node:crypto';
import ts from 'typescript';

/**
 * result of generating a Zod schema for a component's props.
 *
 * every non-leaf type becomes its own named schema variable wrapped in z.lazy().
 * this eliminates manual recursion tracking — Zod handles circular refs natively.
 */
export interface SchemaGenResult {
  /** variable name referencing the root schema */
  rootRef: string;
  /** map of variable name → Zod code body (without z.lazy wrapper) */
  schemas: Map<string, string>;
}

/**
 * generate a Zod schema for a resolved props type.
 *
 * @param checker - the TypeScript type checker
 * @param propsType - the resolved props type (framework adapter provides this)
 * @returns schema result, or null for ALLOW_ALL (any, unknown, index signatures)
 */
export function generateZodSchema(checker: ts.TypeChecker, propsType: ts.Type): SchemaGenResult | null {
  const ctx: GenContext = { typeToName: new Map(), schemas: new Map(), tempToHash: new Map(), counter: 0 };
  const rootRef = toZod(checker, propsType, ctx);

  if (rootRef === null) return null;

  // fix leaked temp names from recursive cycles:
  // when A→B→A, B's code contains A's temp placeholder because A's hash
  // wasn't known yet when B was registered. patch them now.
  if (ctx.tempToHash.size > 0) {
    for (const [key, code] of ctx.schemas) {
      if (code.includes('__t')) {
        ctx.schemas.set(
          key,
          code.replace(/__t\d+/g, (m) => ctx.tempToHash.get(m) ?? m),
        );
      }
    }
  }

  return { rootRef, schemas: ctx.schemas };
}

// --- context ---

interface GenContext {
  /** TS type identity → hash-based schema name (serves as cycle detector) */
  typeToName: Map<ts.Type, string>;
  /** hash-based name → Zod code body */
  schemas: Map<string, string>;
  /** temp placeholder → hash name (for fixing leaked temps from recursive cycles) */
  tempToHash: Map<string, string>;
  /** monotonic counter for temp self-reference placeholders */
  counter: number;
}

// --- core: type → Zod expression or variable name ---

/**
 * convert a TS type to either a variable name (for non-leaf types) or null (for leaf/allow-all).
 * null is mapped to 'z.any()' by the caller.
 */
function toZod(checker: ts.TypeChecker, type: ts.Type, ctx: GenContext): string | null {
  const unwrapped = unwrapOptional(type);

  // primitives, any, unknown → can't build a schema
  if (isLeaf(unwrapped)) return null;

  // union of all primitives/literals (e.g. 'active' | 'inactive') → no object shape
  if (unwrapped.isUnion() && unwrapped.types.every((t) => isLeaf(t))) return null;

  // already assigned? return existing name (handles cycles and reuse)
  const existing = ctx.typeToName.get(unwrapped);

  if (existing) return existing;

  // assign temp placeholder BEFORE recursing — this is the cycle breaker.
  // children's toZod calls will see this and return it for self-references.
  // after code generation, we hash the code and replace the placeholder.
  const temp = `__t${ctx.counter++}`;

  ctx.typeToName.set(type, temp);
  ctx.typeToName.set(unwrapped, temp);

  let code: string | null = null;

  // arrays → z.array(elementRef)
  if (checker.isArrayType(type) || checker.isArrayType(unwrapped)) {
    code = arrayToZod(checker, checker.isArrayType(type) ? type : unwrapped, ctx);
  }

  // union where every member is an array (e.g. A[] | B[]) → z.union([z.array(A), z.array(B)])
  // typescript distributes indexed access over unions without structural dedup, so accessing
  // a shared prop on a discriminated union often lands here even when members look identical.
  if (code === null && unwrapped.isUnion() && unwrapped.types.every((t) => checker.isArrayType(t))) {
    code = arrayUnionToZod(checker, unwrapped, ctx);
  }

  // Record<string, ...> / { [key: string]: ... } → allow all
  if (code === null && hasIndexSignature(checker, unwrapped)) {
    ctx.typeToName.delete(type);
    ctx.typeToName.delete(unwrapped);

    return null;
  }

  // discriminated union → z.discriminatedUnion(...)
  if (code === null && unwrapped.isUnion()) {
    const discriminant = findDiscriminant(checker, unwrapped);

    if (discriminant) {
      code = discriminatedUnionToZod(checker, unwrapped, discriminant, ctx);
    }
  }

  // collect properties from the type (handles plain objects, unions, intersections)
  if (code === null) {
    const collected = collectProperties(checker, unwrapped);

    if (!collected) {
      ctx.typeToName.delete(type);
      ctx.typeToName.delete(unwrapped);

      return null;
    }

    code = propsToZodObject(checker, collected.properties, collected.partialKeys, ctx);
  }

  // compute content hash and register the schema
  return registerSchema(type, unwrapped, temp, code, ctx);
}

/**
 * hash the generated code and store the schema under its content-hash name.
 * replaces the temp self-reference placeholder with the final hash name.
 * by this point, all child references in `code` are already hash names
 * (because children are fully processed before parents).
 */
function registerSchema(type: ts.Type, unwrapped: ts.Type, temp: string, code: string, ctx: GenContext): string {
  const hashName = `_s${createHash('sha256').update(code).digest('hex').slice(0, 8)}`;

  // replace self-references (from recursive types) with the hash name
  const final = code.includes(temp) ? code.replaceAll(temp, hashName) : code;

  // update maps so future references use the hash name
  ctx.typeToName.set(type, hashName);
  ctx.typeToName.set(unwrapped, hashName);
  ctx.tempToHash.set(temp, hashName);
  ctx.schemas.set(hashName, final);

  return hashName;
}

/**
 * build z.object({...}) from a map of property symbols.
 */
function propsToZodObject(
  checker: ts.TypeChecker,
  properties: Map<string, ts.Symbol>,
  partialKeys: Set<string>,
  ctx: GenContext,
): string {
  if (properties.size === 0) return 'z.object({})';

  const fields: string[] = [];

  for (const [name, prop] of properties) {
    const propType = checker.getTypeOfSymbol(prop);

    const isSymbolOptional = !!(prop.flags & ts.SymbolFlags.Optional);

    // pure function props (callbacks) → z.any()
    if (propType.getCallSignatures().length > 0 && !propType.getProperties().length) {
      fields.push(`${safeKey(name)}: z.any()${isSymbolOptional || partialKeys.has(name) ? '.optional()' : ''}`);
      continue;
    }

    const isOptional =
      isSymbolOptional ||
      partialKeys.has(name) ||
      (propType.isUnion() && propType.types.some((t) => !!(t.flags & ts.TypeFlags.Undefined)));
    const ref = toZod(checker, propType, ctx);
    const code = ref ?? 'z.any()';

    fields.push(`${safeKey(name)}: ${code}${isOptional ? '.optional()' : ''}`);
  }

  return `z.object({${fields.join(', ')}})`;
}

// --- property collection ---

interface CollectedProperties {
  properties: Map<string, ts.Symbol>;
  /** property names that exist in some but not all union members — must be optional */
  partialKeys: Set<string>;
}

/**
 * collect all named properties from a type.
 * for unions/intersections, merges properties from all branches.
 * returns null if any branch has an index signature (ALLOW_ALL).
 */
function collectProperties(checker: ts.TypeChecker, type: ts.Type): CollectedProperties | null {
  const properties = new Map<string, ts.Symbol>();
  const partialKeys = new Set<string>();

  if (type.isUnion()) {
    const memberPropSets: Set<string>[] = [];

    for (const member of type.types) {
      if (hasIndexSignature(checker, member)) return null;

      const memberKeys = new Set<string>();

      for (const prop of member.getProperties()) {
        properties.set(prop.name, prop);
        memberKeys.add(prop.name);
      }

      memberPropSets.push(memberKeys);
    }

    // properties not present in ALL members are partial → optional
    for (const name of properties.keys()) {
      if (!memberPropSets.every((s) => s.has(name))) {
        partialKeys.add(name);
      }
    }
  } else if (type.isIntersection()) {
    for (const member of type.types) {
      if (hasIndexSignature(checker, member)) return null;

      for (const prop of member.getProperties()) {
        properties.set(prop.name, prop);
      }
    }
  } else {
    for (const prop of type.getProperties()) {
      properties.set(prop.name, prop);
    }
  }

  return { properties, partialKeys };
}

// --- specific type handlers ---

function arrayToZod(checker: ts.TypeChecker, arrayType: ts.Type, ctx: GenContext): string {
  const typeArgs = (arrayType as ts.TypeReference).typeArguments;

  if (!typeArgs?.length) return 'z.any()';

  const elementRef = toZod(checker, typeArgs[0]!, ctx) ?? 'z.any()';

  return `z.array(${elementRef})`;
}

function arrayUnionToZod(checker: ts.TypeChecker, union: ts.UnionType, ctx: GenContext): string {
  const codes = new Set<string>();

  for (const member of union.types) {
    codes.add(arrayToZod(checker, member, ctx));
  }

  const unique = [...codes];

  if (unique.length === 1) return unique[0]!;

  return `z.union([${unique.join(', ')}])`;
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

    const discProp = member.getProperty(discriminant);
    const discType = discProp ? checker.getTypeOfSymbol(discProp) : undefined;

    // collect literal values for the discriminant — may be a single literal or a union of literals
    const literalValues: string[] = [];

    if (discType) {
      if (isLiteralType(discType)) {
        literalValues.push(getLiteralValue(discType));
      } else if (discType.isUnion()) {
        for (const t of discType.types) {
          if (isLiteralType(t)) literalValues.push(getLiteralValue(t));
        }
      }
    }

    // build non-discriminant fields once (shared across expanded variants)
    const otherFields: string[] = [];

    for (const prop of member.getProperties()) {
      if (prop.name === discriminant) continue;

      const propType = checker.getTypeOfSymbol(prop);
      const isOptional =
        !!(prop.flags & ts.SymbolFlags.Optional) ||
        (propType.isUnion() && propType.types.some((t) => !!(t.flags & ts.TypeFlags.Undefined)));
      const ref = toZod(checker, propType, ctx) ?? 'z.any()';

      otherFields.push(`${safeKey(prop.name)}: ${ref}${isOptional ? '.optional()' : ''}`);
    }

    // expand: one z.object per literal value
    for (const litVal of literalValues) {
      const fields = [`${safeKey(discriminant)}: z.literal(${litVal})`, ...otherFields];

      variants.push(`z.object({${fields.join(', ')}})`);
    }
  }

  return `z.discriminatedUnion(${JSON.stringify(discriminant)}, [${variants.join(', ')}])`;
}

// --- discriminant detection ---

function findDiscriminant(checker: ts.TypeChecker, union: ts.UnionType): string | null {
  if (union.types.length < 2) return null;

  const firstMember = union.types[0]!;

  for (const prop of firstMember.getProperties()) {
    if (!isLiteralOrUnionOfLiterals(checker.getTypeOfSymbol(prop))) continue;

    const allHaveLiteral = union.types.every((member) => {
      const memberProp = member.getProperty(prop.name);

      return memberProp ? isLiteralOrUnionOfLiterals(checker.getTypeOfSymbol(memberProp)) : false;
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

function isLiteralOrUnionOfLiterals(type: ts.Type): boolean {
  if (isLiteralType(type)) return true;
  if (type.isUnion()) return type.types.every((t) => isLiteralType(t));

  return false;
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
