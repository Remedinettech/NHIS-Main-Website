import type { DocumentAudience, DocumentCategory } from '@nhis/shared-types';

/** Display order of the categories (also the order of the public list). */
export const DOCUMENT_CATEGORIES = [
  'govt-order-employee',
  'govt-order-pensioner',
  'policy-non-payable',
  'enrolment-guide',
  'enrolment-form',
  'hospital-suspension',
] as const satisfies readonly DocumentCategory[];
export const DOCUMENT_AUDIENCES = ['employee', 'pensioner', 'all'] as const satisfies readonly DocumentAudience[];

// Compile-time guarantee that the arrays above cover every member of the shared-types unions.
type Missing<T extends string, L extends readonly string[]> = Exclude<T, L[number]>;
const categoriesComplete: Missing<DocumentCategory, typeof DOCUMENT_CATEGORIES> extends never ? true : never = true;
const audiencesComplete: Missing<DocumentAudience, typeof DOCUMENT_AUDIENCES> extends never ? true : never = true;
void categoriesComplete;
void audiencesComplete;

/** URL under which a published asset is served publicly. */
export const publicFileUrl = (assetId: string): string => `/api/v1/files/${assetId}`;
