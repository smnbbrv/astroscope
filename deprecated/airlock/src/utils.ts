import path from 'node:path';

/** strip the file extension from an absolute path */
export function stripExt(filePath: string): string {
  const { dir, name } = path.parse(filePath);

  return path.join(dir, name);
}
