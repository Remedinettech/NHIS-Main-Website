import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export type Db = PrismaClient;
/** Prisma client inside `db.$transaction(async (tx) => ...)`. */
export type Tx = Prisma.TransactionClient;
/** Either the client or a transaction client. */
export type DbLike = Db | Tx;

let override: Db | null = null;

/** The Prisma client used by the admin layer. Tests may swap it with `setAdminDbForTests`. */
export function getDb(): Db {
  return override ?? prisma;
}

export function setAdminDbForTests(client: Db | null): void {
  override = client;
}
