import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegrationLogger } from 'astro';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { chunkIdToName } from '../shared/url.js';
import { getGlobalState, getManifest } from './manifest.js';
import type { ExtractedKey } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:@astroscope/i18n/manifest';
const isVirtualModuleId = (id: string) => id === VIRTUAL_MODULE_ID || id.startsWith(`${VIRTUAL_MODULE_ID}?`);

const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const isResolvedVirtualModuleId = (id: string) =>
  id === RESOLVED_VIRTUAL_MODULE_ID || id.startsWith(`\0${VIRTUAL_MODULE_ID}?`);

// manifest JSON file name (emitted during build)
const MANIFEST_FILE_NAME = 'i18n-manifest.json';

// file extensions to process for t() extraction
const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.astro'];

export type I18nVitePluginOptions = {
  logger: AstroIntegrationLogger;
};

/**
 * Vite plugin for i18n extraction, chunk mapping, and loader injection
 *
 * This plugin:
 * 1. Extracts all t() calls using Babel AST parsing
 * 2. Strips fallback arguments in production builds
 * 3. Maps translation keys to output chunks
 * 4. Generates a manifest for syncing with translation providers
 * 5. Injects translation loader into chunks that use t()
 */
export function i18nVitePlugin(options: I18nVitePluginOptions): Plugin {
  const { logger } = options;

  const extractedKeys: ExtractedKey[] = [];
  const fileToKeys = new Map<string, string[]>();
  const filesWithI18n = new Set<string>();

  let isBuild = false;
  let isSSR = false;

  return {
    name: '@astroscope/i18n/extract',
    enforce: 'pre',

    configResolved(config) {
      const state = getGlobalState();
      state.projectRoot = config.root;
      state.extractedKeys = extractedKeys;

      isBuild = config.command === 'build';
      isSSR = !!config.build.ssr;
    },

    resolveId(id) {
      if (isVirtualModuleId(id)) {
        return `\0${id}`;
      }
    },

    load(id) {
      if (isResolvedVirtualModuleId(id)) {
        if (isBuild) {
          // in build mode, load manifest from JSON file at runtime
          return `
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestJson = JSON.parse(readFileSync(join(__dirname, '${MANIFEST_FILE_NAME}'), 'utf-8'));

export const manifest = manifestJson;
export function getManifest() { return manifestJson; }
`;
        }

        // in dev mode, import the getManifest function from the plugin
        // this provides live access to the extraction state as files are transformed
        return `
import { getManifest as _getManifest } from '@astroscope/i18n/extraction';
export const manifest = { keys: [], chunks: {} };
export function getManifest() { return _getManifest(); }
`;
      }
    },

    async transform(code, filename) {
      // only process included file types
      if (!INCLUDE_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
        return null;
      }

      // skip node_modules
      if (filename.includes('node_modules')) {
        return null;
      }

      // quick check: skip files without i18n import
      if (!code.includes('@astroscope/i18n/t')) {
        return null;
      }

      filesWithI18n.add(filename); // that file imports i18n

      const fileKeys: ExtractedKey[] = [];

      // dynamic imports prevent Babel from being bundled into server runtime
      // this allows the production build to work without Babel installed
      const [{ transformAsync }, { i18nExtractPlugin }] = await Promise.all([
        import('@babel/core'),
        import('./babel-plugin.js'),
      ]);

      const result = await transformAsync(code, {
        filename,
        sourceMaps: true,
        babelrc: false,
        configFile: false,
        parserOpts: {
          plugins: [
            ...(filename.endsWith('.ts') || filename.endsWith('.tsx') ? ['typescript' as const] : []),
            ...(filename.endsWith('.jsx') || filename.endsWith('.tsx') ? ['jsx' as const] : []),
          ],
        },
        plugins: [
          [
            i18nExtractPlugin,
            {
              stripFallbacks: isBuild, // only strip in production
              onKeyExtracted: (key: ExtractedKey) => fileKeys.push(key),
              logger,
            },
          ],
        ],
      });

      // store extracted keys
      if (fileKeys.length > 0) {
        extractedKeys.push(...fileKeys);

        fileToKeys.set(
          filename,
          fileKeys.map((k) => k.key),
        );
      }

      // build mode: return transformed code with source map
      if (isBuild && result?.code) {
        return { code: result.code, map: result.map };
      }

      return null; // dev mode: keep fallbacks
    },

    generateBundle(_, bundle) {
      const state = getGlobalState();

      state.chunkManifest = {}; // reset for each build (server + client run separately)

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.moduleIds) {
          const keys = new Set<string>();
          let hasI18nModule = false;

          // collect keys from all (sub)modules in the chunk
          for (const moduleId of chunk.moduleIds) {
            const moduleKeys = fileToKeys.get(moduleId);

            moduleKeys?.forEach((k) => keys.add(k));

            if (filesWithI18n.has(moduleId)) {
              hasI18nModule = true;
            }
          }

          const chunkName = chunkIdToName(fileName.replace(/\.js$/, '')); // cut .js extension

          if (keys.size) {
            state.chunkManifest[chunkName] = Array.from(keys);
          }

          if (hasI18nModule) {
            // prepare translation loader for chunks that use i18n
            const loaderCode = `
/* @astroscope/i18n loader */
if (typeof window !== 'undefined' && window.__i18n__) {
  const __i18n__ = window.__i18n__;
  const __i18n_hash__ = __i18n__.hashes[${JSON.stringify(chunkName)}];
  if (__i18n_hash__) {
    await import(\`/_i18n/\${__i18n__.locale}/${chunkName}.\${__i18n_hash__}.js\`);
  }
}
/* end @astroscope/i18n loader */
`;

            // inject loader at start of chunk preserving source maps
            const s = new MagicString(chunk.code);

            s.prepend(loaderCode);
            chunk.code = s.toString();

            if (chunk.map) {
              chunk.map = s.generateMap({ hires: true }) as typeof chunk.map;
            }
          }
        }
      }

      logger.info(`manifest: ${Object.keys(state.chunkManifest).length} chunks, ${extractedKeys.length} keys`);
    },

    writeBundle(outputOptions) {
      // write the manifest JSON file after bundle is written
      // only emit from client build (has full chunk mapping, runs after server build)
      // write to server directory so it's not publicly accessible (same location as the virtual module)
      if (!isSSR && outputOptions.dir) {
        const chunksDir = path.resolve(outputOptions.dir, '..', 'server', 'chunks');
        const manifestPath = path.join(chunksDir, MANIFEST_FILE_NAME);

        if (fs.existsSync(chunksDir)) {
          fs.writeFileSync(manifestPath, JSON.stringify(getManifest()));
        } else {
          logger.error(`server chunks directory not found, cannot write manifest to ${manifestPath}`);
        }
      }
    },
  };
}
