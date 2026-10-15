import type { ContactDirectoryId } from '@nhis/shared-types';
import type { MessageKey } from '../locales';

/**
 * Display headings for each directory column, keyed by the workbook column letter.
 * Headings describe what each column actually contains. The hospital nodal officer workbook has its first
 * two header cells in the wrong order (column A holds the district, column B the officer), so the heading
 * follows the values, as the scheme website itself displays that directory.
 */
export const CONTACT_COLUMN_LABELS: Record<ContactDirectoryId, Record<string, MessageKey>> = {
  coordinators: { A: 'contacts.cols.district', B: 'contacts.cols.coordinator', C: 'contacts.cols.designation', D: 'contacts.cols.phone' },
  'uiic-nodal-officers': { A: 'contacts.cols.district', B: 'contacts.cols.nodalOfficer', C: 'contacts.cols.designation', D: 'contacts.cols.phone' },
  'hospital-nodal-officers': { A: 'contacts.cols.district', B: 'contacts.cols.nodalOfficer', C: 'contacts.cols.hospital', D: 'contacts.cols.phone' },
  'project-office-officials': { A: 'contacts.cols.serial', B: 'contacts.cols.empNo', C: 'contacts.cols.name', D: 'contacts.cols.designation', E: 'contacts.cols.email' },
  'treasury-offices': { A: 'contacts.cols.serial', B: 'contacts.cols.district', C: 'contacts.cols.office', D: 'contacts.cols.email', E: 'contacts.cols.phone' },
};
