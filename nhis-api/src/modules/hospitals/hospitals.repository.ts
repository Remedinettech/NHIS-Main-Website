import type { Hospital } from '@nhis/shared-types';
import type { Hospital as HospitalRow, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export interface HospitalSearchQuery {
  /** Already normalised (lower-cased, single spaces); empty means no text filter. */
  needle: string;
  /** Raw stored `districtEn` values to include; `undefined` means no district filter. */
  districtValues?: readonly string[];
  skip: number;
  take: number;
}

/** Data-access contract for hospitals (PostgreSQL). Only PUBLISHED, live values are ever returned. */
export interface HospitalRepository {
  search(query: HospitalSearchQuery): Promise<{ rows: Hospital[]; total: number }>;
  /** Distinct stored `districtEn` values of published hospitals (raw, untrimmed). */
  listDistrictValues(): Promise<string[]>;
  findById(id: string): Promise<Hospital | null>;
  count(): Promise<number>;
}

export function toPublicHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    sourceRow: row.sourceRow ?? 0,
    name: { en: row.nameEn, ta: row.nameTa },
    address: { en: row.addressEn, ta: row.addressTa },
    district: { en: row.districtEn, ta: row.districtTa },
    state: { en: row.stateEn, ta: row.stateTa },
    category: row.category,
    postcode: row.postcode,
    type: row.type,
    specialty: row.specialty,
    contact: row.contact,
    mapUrl: row.mapUrl,
  };
}

const PUBLISHED = { status: 'PUBLISHED' } as const;
const ORDER: Prisma.HospitalOrderByWithRelationInput[] = [{ sourceRow: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }];

export function createPrismaHospitalRepository(client: PrismaClient = prisma): HospitalRepository {
  return {
    async search({ needle, districtValues, skip, take }) {
      const where: Prisma.HospitalWhereInput = { ...PUBLISHED };
      if (needle) where.searchText = { contains: needle };
      if (districtValues) where.districtEn = { in: [...districtValues] };
      const [total, rows] = await Promise.all([
        client.hospital.count({ where }),
        client.hospital.findMany({ where, orderBy: ORDER, skip, take }),
      ]);
      return { rows: rows.map(toPublicHospital), total };
    },
    async listDistrictValues() {
      const groups = await client.hospital.groupBy({ by: ['districtEn'], where: PUBLISHED });
      return groups.map((g) => g.districtEn);
    },
    async findById(id) {
      const row = await client.hospital.findFirst({ where: { id, ...PUBLISHED } });
      return row ? toPublicHospital(row) : null;
    },
    count: () => client.hospital.count({ where: PUBLISHED }),
  };
}

export const hospitalRepository: HospitalRepository = createPrismaHospitalRepository();
