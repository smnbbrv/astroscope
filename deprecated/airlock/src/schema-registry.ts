import type { FrameworkAdapter } from './adapters/adapter.js';
import type { SchemaGenResult } from './extractor.js';

export interface ResolveResult {
  schema: SchemaGenResult | null;
  /** absolute resolved file path (for dependency tracking) */
  resolvedPath: string;
  /** stable schema ID for referencing from the virtual module */
  schemaId: string;
}

const VIRTUAL_MODULE_ID = 'virtual:@astroscope/airlock/schemas';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

export { VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_MODULE_ID };

/**
 * central registry of component prop schemas.
 * generates a shared virtual module so schemas are created once at runtime.
 */
export class SchemaRegistry {
  private readonly schemas = new Map<string, ResolveResult>();
  private readonly adapters: FrameworkAdapter[];
  private idCounter = 0;

  constructor(adapters: FrameworkAdapter[]) {
    this.adapters = adapters;
  }

  /**
   * resolve an import specifier to a schema.
   * registers the schema in the registry for virtual module emission.
   */
  resolve(importSpecifier: string, exportName: string, fromFile: string): ResolveResult | undefined {
    for (const adapter of this.adapters) {
      const filePath = adapter.resolveModulePath(importSpecifier, fromFile);

      if (!filePath) continue;

      if (!adapter.canHandle(filePath)) continue;

      const cacheKey = `${filePath}#${exportName}`;

      if (this.schemas.has(cacheKey)) return this.schemas.get(cacheKey)!;

      const schema = adapter.extractSchema(filePath, exportName);

      if (schema === undefined) continue;

      const schemaId = `__s${this.idCounter++}`;
      const result: ResolveResult = { schema, resolvedPath: filePath, schemaId };

      this.schemas.set(cacheKey, result);

      return result;
    }

    return undefined;
  }

  /**
   * generate the virtual module source code.
   *
   * exports all required schemas named after their content checksums.
   * identical schemas across components are automatically deduplicated.
   */
  generateVirtualModule(): string {
    const lines: string[] = ["import { z } from 'astro/zod';"];

    // merge all sub-schemas across components — hash names deduplicate automatically
    const allSchemas = new Map<string, string>();
    const componentExports: { schemaId: string; rootRef: string }[] = [];

    for (const entry of this.schemas.values()) {
      if (entry.schema === null) continue;

      for (const [name, code] of entry.schema.schemas) {
        allSchemas.set(name, code);
      }

      componentExports.push({ schemaId: entry.schemaId, rootRef: entry.schema.rootRef });
    }

    // emit flat declarations — z.lazy wrapping happens here
    for (const [name, code] of allSchemas) {
      lines.push(`const ${name} = z.lazy(() => ${code});`);
    }

    // emit component schema exports
    for (const { schemaId, rootRef } of componentExports) {
      lines.push(`export const ${schemaId} = ${rootRef};`);
    }

    // strip helper — shared across all pages
    lines.push(
      'export function __airlock_strip(schema, props) {',
      '  const clean = schema.parse(props);',
      '  for (const k of Object.keys(props)) if (k.startsWith("client:")) clean[k] = props[k];',
      '  return clean;',
      '}',
    );

    return lines.join('\n');
  }

  /**
   * invalidate cached schemas for a changed file.
   */
  invalidate(filePath: string): void {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(filePath)) {
        adapter.invalidate(filePath);
      }
    }

    for (const [key, value] of this.schemas) {
      if (value.resolvedPath === filePath) {
        this.schemas.delete(key);
      }
    }
  }

  /**
   * check whether any adapter handles this file extension.
   */
  canHandle(filePath: string): boolean {
    return this.adapters.some((a) => a.canHandle(filePath));
  }
}
