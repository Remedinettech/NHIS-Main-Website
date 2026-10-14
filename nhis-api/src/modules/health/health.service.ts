import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export interface HealthBody {
  status: 'ok' | 'degraded';
  service: 'nhis-api';
  mode: 'database';
  databaseConnected: boolean;
}

/** Reports liveness plus a real `SELECT 1` against the database (never leaks the failure reason). */
export function createHealthService(client: PrismaClient = prisma) {
  async function check(): Promise<{ body: HealthBody; status: 200 | 503 }> {
    let databaseConnected = false;
    try {
      await client.$queryRaw`SELECT 1`;
      databaseConnected = true;
    } catch {
      databaseConnected = false;
    }
    return {
      body: { status: databaseConnected ? 'ok' : 'degraded', service: 'nhis-api', mode: 'database', databaseConnected },
      status: databaseConnected ? 200 : 503,
    };
  }
  return { check };
}

export const healthService = createHealthService();
