import type { ContactColumn, ContactDirectory, ContactDirectoryId, ContactDirectorySummary, DirectoryFlag } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export interface ContactRepository {
  /** All directories (summaries) with the number of PUBLISHED rows, in display order. */
  listDirectories(): Promise<ContactDirectorySummary[]>;
  /** One directory with its PUBLISHED rows in order; null when the directory does not exist. */
  findDirectory(id: ContactDirectoryId): Promise<ContactDirectory | null>;
}

const label = (d: { labelEn: string; labelTa: string }) => ({ en: d.labelEn, ta: d.labelTa });

export function createPrismaContactRepository(client: PrismaClient = prisma): ContactRepository {
  return {
    async listDirectories() {
      const dirs = await client.contactDirectory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { contacts: { where: { status: 'PUBLISHED' } } } } },
      });
      return dirs.map((d) => ({ id: d.id as ContactDirectoryId, label: label(d), total: d._count.contacts, flags: d.flags as unknown as DirectoryFlag[] }));
    },
    async findDirectory(id) {
      const d = await client.contactDirectory.findUnique({
        where: { id },
        include: {
          contacts: {
            where: { status: 'PUBLISHED' },
            orderBy: [{ sortOrder: 'asc' }, { sourceRow: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          },
        },
      });
      if (!d) return null;
      return {
        id: d.id as ContactDirectoryId,
        label: label(d),
        sourceFile: d.sourceFile ?? '',
        columns: d.columns as unknown as ContactColumn[],
        rows: d.contacts.map((c) => ({ id: c.id, sourceRow: c.sourceRow ?? 0, cells: c.cells as Record<string, string> })),
        total: d.contacts.length,
        flags: d.flags as unknown as DirectoryFlag[],
      };
    },
  };
}

export const contactRepository: ContactRepository = createPrismaContactRepository();
