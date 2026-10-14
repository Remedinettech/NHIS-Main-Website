/**
 * npm run storage:check -w nhis-api
 *
 * Read-only check that every file the database refers to (MediaAsset) exists in the upload store with the recorded
 * size and SHA-256, and lists files in the store that the database does not know. Run it on the server after copying
 * the uploads, and again after every restore. It never changes the database or the files.
 *
 * Uses DATABASE_URL and FILE_STORAGE_DIR from the environment (.env). Prints no credentials.
 * Exit code: 0 = all files present and intact, 1 = problems found, 2 = could not run.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { isValidStorageKey } from '../modules/storage';
import { loadStorageConfig } from '../config/storage';

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const root = loadStorageConfig().rootDir;
  console.log(`Upload store: ${root}`);
  if (!fs.existsSync(root)) {
    console.error('The upload store folder does not exist.');
    return 1;
  }

  const client = new PrismaClient();
  try {
    const assets = await client.mediaAsset.findMany({ select: { id: true, storageKey: true, originalName: true, bytes: true, sha256: true } });
    const problems: string[] = [];
    let ok = 0;
    for (const asset of assets) {
      if (!isValidStorageKey(asset.storageKey)) {
        problems.push(`INVALID KEY   ${asset.id}  (${asset.originalName})`);
        continue;
      }
      const file = path.join(root, asset.storageKey);
      let stat;
      try {
        stat = await fsp.stat(file);
      } catch {
        problems.push(`MISSING       ${asset.storageKey}  (${asset.originalName})`);
        continue;
      }
      if (stat.size !== asset.bytes) {
        problems.push(`SIZE MISMATCH ${asset.storageKey}  expected ${asset.bytes}, found ${stat.size}`);
        continue;
      }
      if ((await sha256File(file)) !== asset.sha256) {
        problems.push(`HASH MISMATCH ${asset.storageKey}  (${asset.originalName})`);
        continue;
      }
      ok += 1;
    }

    const known = new Set(assets.map((a) => a.storageKey));
    const extra = (await fsp.readdir(root)).filter((name) => !known.has(name));

    console.log(`Files referenced by the database: ${assets.length}`);
    console.log(`Present and intact:               ${ok}`);
    for (const line of problems) console.log(`  ${line}`);
    if (extra.length > 0) console.log(`Files in the store that the database does not reference (not an error): ${extra.length}`);
    console.log(problems.length === 0 ? 'RESULT: OK' : `RESULT: ${problems.length} problem(s)`);
    return problems.length === 0 ? 0 : 1;
  } finally {
    await client.$disconnect();
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error('Check could not run:', error instanceof Error ? error.message.split('\n').slice(-2).join(' ') : String(error));
    process.exitCode = 2;
  },
);
