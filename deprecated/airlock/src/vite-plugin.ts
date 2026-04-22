import fs from 'node:fs/promises';
import path from 'node:path';
import type { AstroIntegrationLogger } from 'astro';
import type { Plugin, ViteDevServer } from 'vite';

import { ReactAdapter } from './adapters/react.js';
import { analyzeAstroSource } from './astro-analyze.js';
import { DepTracker } from './dep-tracker.js';
import { RESOLVED_VIRTUAL_MODULE_ID, SchemaRegistry, VIRTUAL_MODULE_ID } from './schema-registry.js';
import { type SchemaMapping, transformCompiledOutput } from './transform.js';

export interface AirlockPluginOptions {
  logger: AstroIntegrationLogger;
}

/**
 * vite plugin that strips excess props from hydrated island components
 * using Zod schema parsing.
 *
 * detection: reads raw .astro source from disk, parses with @astrojs/compiler
 * (stable public API) to find hydrated components.
 *
 * transform: modifies the compiled JS output to wrap props with .parse().
 * if a detected component can't be matched in the compiled output, throws
 * to prevent data leaks.
 */
export function airlockVitePlugin(options: AirlockPluginOptions): Plugin {
  const { logger } = options;
  const deps = new DepTracker();
  let totalSeen = 0;
  let totalTransformed = 0;

  let registry: SchemaRegistry;
  let server: ViteDevServer | undefined;
  let root: string;
  let isBuild = false;

  return {
    name: '@astroscope/airlock',

    // note: no applyToEnvironment — handleHotUpdate must fire for all environments
    // the transform hook checks for .astro files, so client env is skipped naturally

    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      registry = new SchemaRegistry([new ReactAdapter(root, logger)]);
    },

    configureServer(devServer) {
      server = devServer;
    },

    async buildStart() {
      // in build mode, pre-scan all .astro files to populate the schema registry
      // before rollup loads the virtual module. without this, the virtual module
      // is loaded on first import and misses schemas from later-processed files.
      if (!isBuild) return;

      const srcDir = path.join(root, 'src');
      const entries = await fs.readdir(srcDir, { recursive: true, withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.astro')) continue;

        const filePath = path.join(entry.parentPath, entry.name);

        const raw = await fs.readFile(filePath, 'utf-8');
        const analyzed = await analyzeAstroSource(raw);

        for (const comp of analyzed.hydratedComponents) {
          if (!comp.importInfo) continue;

          registry.resolve(comp.importInfo.specifier, comp.importInfo.exportName, filePath);
        }
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return registry.generateVirtualModule();
      }
    },

    async transform(code, id) {
      if (!id.endsWith('.astro')) return;

      // read raw source from disk for stable component detection
      const raw = await fs.readFile(id, 'utf-8');

      if (!raw.includes('client:')) return;

      const analyzed = await analyzeAstroSource(raw);

      if (!analyzed.hydratedComponents.length) return;

      deps.clear(id);

      // resolve schemas for each hydrated component
      const componentsToWrap: SchemaMapping[] = [];

      for (const comp of analyzed.hydratedComponents) {
        totalSeen++;

        if (!comp.importInfo) {
          logger.warn(`<${comp.name}> — no matching import`);
          continue;
        }

        const resolved = registry.resolve(comp.importInfo.specifier, comp.importInfo.exportName, id);

        if (!resolved) {
          logger.warn(`<${comp.name}> (${comp.importInfo.specifier}) — not resolved`);
          continue;
        }

        if (comp.importInfo.specifier) {
          deps.track(id, resolved.resolvedPath);
        }

        if (resolved.schema === null) {
          logger.debug(`<${comp.name}> (${comp.importInfo.specifier}) — ALLOW_ALL`);
          continue;
        }

        componentsToWrap.push({
          specifier: comp.importInfo.specifier,
          resolvedPath: resolved.resolvedPath,
          schemaId: resolved.schemaId,
        });
      }

      if (componentsToWrap.length === 0) return;

      // invalidate the virtual module so it picks up new/changed schemas
      if (server) {
        const virtualMod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);

        if (virtualMod) {
          server.moduleGraph.invalidateModule(virtualMod);
        }
      }

      // transform the compiled output — throws if components can't be matched
      const result = await transformCompiledOutput(code, componentsToWrap);

      totalTransformed += componentsToWrap.length;

      return result;
    },

    closeBundle() {
      if (!totalSeen && !totalTransformed) return;

      logger.info(`transformed ${totalTransformed} of ${totalSeen} hydrated component usage(s)`);
    },

    handleHotUpdate({ file }) {
      if (!server || !registry.canHandle(file)) return;

      registry.invalidate(file);

      const dependents = deps.getDependents(file);

      if (!dependents) return;

      for (const astroFile of dependents) {
        const mod = server.moduleGraph.getModuleById(astroFile);

        if (mod) {
          server.reloadModule(mod);
        }
      }
    },
  };
}
