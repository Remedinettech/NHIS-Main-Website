import type { ContactColumn, ContactDirectoryId } from '@nhis/shared-types';

export interface DisplayColumn { key: string; header: string; kind: ContactColumn['kind'] }

/**
 * Friendly column headings per directory, mapped onto the workbook column keys (A, B, C...).
 * Cell values are never changed. The hospital nodal officers workbook stores the district in column A
 * and the officer name in column B, so the headings follow the values, not the workbook headers.
 */
const LAYOUTS: Partial<Record<ContactDirectoryId, readonly DisplayColumn[]>> = {
  coordinators: [
    { key: 'A', header: 'District', kind: 'text' },
    { key: 'B', header: 'Coordinator', kind: 'text' },
    { key: 'C', header: 'Designation', kind: 'text' },
    { key: 'D', header: 'Contact number', kind: 'phone' },
  ],
  'uiic-nodal-officers': [
    { key: 'A', header: 'District', kind: 'text' },
    { key: 'B', header: 'Nodal officer', kind: 'text' },
    { key: 'C', header: 'Designation', kind: 'text' },
    { key: 'D', header: 'Contact number', kind: 'phone' },
  ],
  'hospital-nodal-officers': [
    { key: 'A', header: 'District', kind: 'text' },
    { key: 'B', header: 'Nodal officer', kind: 'text' },
    { key: 'C', header: 'Hospital', kind: 'text' },
    { key: 'D', header: 'Contact number', kind: 'phone' },
  ],
  'treasury-offices': [
    { key: 'A', header: 'No.', kind: 'text' },
    { key: 'B', header: 'District', kind: 'text' },
    { key: 'C', header: 'Office', kind: 'text' },
    { key: 'D', header: 'E-mail', kind: 'email' },
    { key: 'E', header: 'Contact number', kind: 'phone' },
  ],
};

/** Display columns for a directory; unknown directories fall back to the columns the API describes. */
export function displayColumns(id: string, fallback: readonly ContactColumn[]): readonly DisplayColumn[] {
  const layout = LAYOUTS[id as ContactDirectoryId];
  return layout ?? fallback.map((c) => ({ key: c.key, header: c.header, kind: c.kind }));
}
