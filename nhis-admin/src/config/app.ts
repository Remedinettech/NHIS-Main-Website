import type { DocumentAudience, DocumentCategory, PageSlug } from '@nhis/shared-types';

export const APP_NAME = 'TN-NHIS Administration';

/** Page slugs in display order (the API has no page index endpoint). */
export const PAGE_SLUGS: readonly PageSlug[] = [
  'employee-policy', 'pensioner-policy', 'coverage', 'eligibility', 'how-to-enroll', 'forms', 'grievances', 'gallery',
];

export function isPageSlug(value: string | undefined): value is PageSlug {
  return PAGE_SLUGS.some((slug) => slug === value);
}

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  'govt-order-employee': 'Government orders: employees',
  'govt-order-pensioner': 'Government orders: pensioners',
  'policy-non-payable': 'Policy: non-payable items',
  'enrolment-guide': 'Enrolment guide',
  'enrolment-form': 'Enrolment form',
  'hospital-suspension': 'Hospital suspension notice',
};

export const AUDIENCE_LABELS: Record<DocumentAudience, string> = { employee: 'Employee', pensioner: 'Pensioner', all: 'All' };
