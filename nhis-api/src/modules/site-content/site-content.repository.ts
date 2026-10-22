import type { SiteContentKey, SiteContentMap } from '@nhis/shared-types';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { effectiveDefaults } from './effective-default';
import { createMissingTableWarning, isTableUnavailableError } from './missing-table';
import { resolveSiteContent } from './resolve';

export interface SiteContentRepository {
  /** Every document as the public site shows it: the published value, or the effective default (see effective-default.ts). */
  getPublished(): Promise<SiteContentMap>;
}

/**
 * The public view of the site content. Per document: the value of a PUBLISHED row if it passes the shared validator
 * (the stored JSON is never trusted blindly), otherwise the built-in content plus the legacy settings. Drafts are not
 * even selected from the database. If the SiteContent table does not exist yet, every document is the effective
 * default (one warning is logged); that is a deployment state, not an error for visitors.
 */
export function createPrismaSiteContentRepository(client: PrismaClient = prisma): SiteContentRepository {
  const warnMissingTable = createMissingTableWarning('The built-in content is shown.');
  const reportedInvalid = new Set<SiteContentKey>();

  return {
    async getPublished() {
      let rows: Array<{ id: string; value: unknown }> = [];
      try {
        rows = await client.siteContent.findMany({ where: { status: 'PUBLISHED' }, select: { id: true, value: true } });
      } catch (error) {
        if (!isTableUnavailableError(error)) throw error;
        warnMissingTable();
      }
      return resolveSiteContent(new Map(rows.map((row) => [row.id, row.value])), () => effectiveDefaults(client), (key) => {
        if (reportedInvalid.has(key)) return;
        reportedInvalid.add(key);
        console.warn(`The published site content "${key}" does not pass validation; the built-in content is shown instead.`);
      });
    },
  };
}

export const siteContentRepository: SiteContentRepository = createPrismaSiteContentRepository();
