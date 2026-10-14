import fs from 'node:fs';
import path from 'node:path';

/** Walks up from the working directory until the monorepo root (the folder containing nhis-client) is found. */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'nhis-client')) && fs.existsSync(path.join(dir, 'nhis-api'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Monorepo root not found');
}

export const publicDocumentsDir = () => path.join(repoRoot(), 'nhis-client', 'public', 'documents');

export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
