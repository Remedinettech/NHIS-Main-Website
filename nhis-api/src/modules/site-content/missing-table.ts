/**
 * True when a Prisma error means "the table does not exist": P2021 from the query API, or P2010 (raw query failed)
 * whose database code is 42P01 (undefined_table). This is what an API that runs ahead of the SiteContent migration
 * sees; the public endpoints then behave as if no site content had been saved instead of answering 500.
 * Detected by name and code (like isDatabaseUnavailableError) so that this module does not depend on the client class.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code, meta } = error as { name?: unknown; code?: unknown; meta?: unknown };
  if (name !== 'PrismaClientKnownRequestError') return false;
  if (code === 'P2021') return true;
  if (code === 'P2010') {
    const databaseCode = typeof meta === 'object' && meta !== null ? (meta as { code?: unknown }).code : undefined;
    return databaseCode === '42P01';
  }
  return false;
}

/**
 * True when the database refused a value of the enum "AssetKind" that this release writes but the database does not know
 * yet: PostgreSQL code 22P02 ("invalid input value for enum"), which Prisma reports as an unknown request error whose
 * message carries the database text. It is what an MP4 upload sees when migration 20261015120000_manual_video (ALTER TYPE
 * "AssetKind" ADD VALUE 'VIDEO') has not been applied yet, so it is answered like a missing table.
 */
export function isMissingEnumValueError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message, meta } = error as { name?: unknown; message?: unknown; meta?: unknown };
  if (name !== 'PrismaClientUnknownRequestError' && name !== 'PrismaClientKnownRequestError') return false;
  const databaseCode = typeof meta === 'object' && meta !== null ? (meta as { code?: unknown }).code : undefined;
  const text = typeof message === 'string' ? message : '';
  // The quotes around the enum name are escaped in the text Prisma builds from the connector error.
  return /invalid input value for enum \\?"AssetKind\\?"/.test(text) && (databaseCode === undefined || databaseCode === '22P02');
}

/**
 * True when the database role of the API may not use one of the two tables of this release (SiteContent, ContentImport):
 * PostgreSQL code 42501 ("permission denied for table ..."). It is what the API sees after the migrations were applied but
 * the privileges were not granted to the runtime role (step 3b of the operator pack). Prisma reports it as an unknown
 * request error (query API, the database text is inside the message) or as P2010 (raw query, with the text in the message
 * and in meta). The public endpoints then answer from the built-in content, as they do before the migration, instead of 500.
 * Only these two tables are recognised: a refused access to any other table is a real fault.
 */
export function isTablePermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message, meta } = error as { name?: unknown; message?: unknown; meta?: unknown };
  if (name !== 'PrismaClientUnknownRequestError' && name !== 'PrismaClientKnownRequestError') return false;
  const detail = typeof meta === 'object' && meta !== null ? (meta as { message?: unknown }).message : undefined;
  const text = [message, detail].filter((part): part is string => typeof part === 'string').join(' ');
  return /permission denied for (?:table )?"?(?:SiteContent|ContentImport)\b/.test(text);
}

/** A table of this release that cannot be used yet: it does not exist (migration pending) or the runtime role has no rights on it. */
export const isTableUnavailableError = (error: unknown): boolean => isMissingTableError(error) || isTablePermissionError(error);

/** Logs at most one warning per instance (a process, in production) so a missing migration is visible but not noisy. */
export function createMissingTableWarning(what: string): () => void {
  let warned = false;
  return () => {
    if (warned) return;
    warned = true;
    console.warn(`The SiteContent table does not exist yet (apply the migration 20261015100000_site_content_cms) or the database role of the API may not use it (grant it: step 3b of the operator pack). ${what}`);
  };
}
