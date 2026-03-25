import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip as _gzip, brotliCompress, constants } from 'node:zlib';

import type { AstroIntegrationLogger } from 'astro';

import { COMPRESSIBLE } from './mime.js';
import type { ServeMode } from './types.js';

const brotli = promisify(brotliCompress);
const gzip = promisify(_gzip);

export async function compressClientDir(
  clientDir: string,
  staticDir: string,
  serve: ServeMode,
  budget: number,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const files = await walkDir(clientDir);

  let compressed = 0;
  let moved = 0;
  let savedBytes = 0;
  let totalMemory = 0;

  await Promise.all(
    files.map(async (filePath) => {
      const ext = path.extname(filePath);
      const isCompressible = COMPRESSIBLE.has(ext);

      if (!isCompressible) {
        if (serve === 'all') {
          const { size } = await stat(filePath);

          await moveFile(clientDir, staticDir, filePath);
          moved++;
          totalMemory += size;
        }

        return;
      }

      const raw = await readFile(filePath);

      if (!raw.byteLength) {
        return;
      }

      const relativePath = path.relative(clientDir, filePath);
      const destPath = path.join(staticDir, relativePath);

      await mkdir(path.dirname(destPath), { recursive: true });

      const [brBuf, gzBuf] = await Promise.all([
        brotli(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY } }),
        gzip(raw, { level: 9 }),
      ]);

      // move original to static dir
      await rename(filePath, destPath);

      if (brBuf.byteLength < raw.byteLength) {
        await writeFile(`${destPath}.br`, brBuf);
      }

      if (gzBuf.byteLength < raw.byteLength) {
        await writeFile(`${destPath}.gz`, gzBuf);
      }

      compressed++;
      moved++;
      totalMemory += raw.byteLength;

      if (brBuf.byteLength < raw.byteLength) {
        totalMemory += brBuf.byteLength;
      }

      if (gzBuf.byteLength < raw.byteLength) {
        totalMemory += gzBuf.byteLength;
      }

      const best = Math.min(
        brBuf.byteLength < raw.byteLength ? brBuf.byteLength : raw.byteLength,
        gzBuf.byteLength < raw.byteLength ? gzBuf.byteLength : raw.byteLength,
      );

      savedBytes += raw.byteLength - best;
    }),
  );

  await cleanEmptyDirs(clientDir);

  logger.info(
    `${moved} files in memory (${compressed} compressed), saved ${formatBytes(savedBytes)}, footprint ~${formatBytes(totalMemory)}`,
  );

  if (totalMemory > budget) {
    logger.warn(
      `memory footprint (${formatBytes(totalMemory)}) exceeds budget (${formatBytes(budget)}). ` +
        `increase the budget with hyperspace({ budget: ${Math.ceil(totalMemory / 1024 / 1024)} * 1024 * 1024 }) to suppress this warning`,
    );
  }
}

async function moveFile(clientDir: string, staticDir: string, filePath: string): Promise<void> {
  const relativePath = path.relative(clientDir, filePath);
  const destPath = path.join(staticDir, relativePath);

  await mkdir(path.dirname(destPath), { recursive: true });
  await rename(filePath, destPath);
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });

  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

async function cleanEmptyDirs(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subdir = path.join(dir, entry.name);

      await cleanEmptyDirs(subdir);

      const remaining = await readdir(subdir);

      if (remaining.length === 0) {
        await rm(subdir, { recursive: true });
      }
    }
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

function formatBytes(bytes: number): string {
  let value = bytes;

  for (const unit of UNITS) {
    if (value < 1024 || unit === UNITS[UNITS.length - 1]) {
      return unit === 'B' ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
    }

    value /= 1024;
  }

  return `${value.toFixed(1)} GB`;
}
