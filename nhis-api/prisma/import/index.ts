/**
 * `npm run db:import -w nhis-api`: imports the snapshot content into PostgreSQL (see import.ts).
 * Uses DATABASE_URL (the runtime role) and FILE_STORAGE_DIR; never prints connection strings.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createStorageAdapter } from '../../src/modules/storage';
import { defaultSources, runImport } from './import';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see nhis-api/.env.example)');
  const client = new PrismaClient();
  try {
    const report = await runImport(client, { ...defaultSources(), storage: createStorageAdapter(), log: (m) => console.log(m) });
    console.log('Created :', JSON.stringify(report.created));
    console.log('Skipped :', JSON.stringify(report.skipped));
    if (report.sourceChanged.length > 0) {
      console.log(`Source changed since import (not applied, existing data kept): ${report.sourceChanged.length} row(s)`);
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print the message only (Prisma errors can echo query parameters; never the connection string).
  console.error('Import failed:', error instanceof Error ? error.message.split('\n').slice(-3).join(' ') : String(error));
  process.exitCode = 1;
});
