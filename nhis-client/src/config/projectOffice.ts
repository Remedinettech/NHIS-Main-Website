/**
 * Static contact details supplied by United India Insurance (DC and PO details, NHIS 2026).
 * Names and designations are shown exactly as supplied and are not translated.
 */
export interface OfficerRow {
  name: string;
  designation: string;
  phone?: string;
  email?: string;
  empNo?: string;
}

export const NODAL_OFFICERS_2026: ReadonlyArray<OfficerRow> = [
  { name: 'Mr. V S Rajasubramaniam', designation: 'Chief Business Manager', phone: '9789055837', email: 'rajasubramanianvs@uiic.co.in' },
  { name: 'Mr. G Ravikiran', designation: 'Manager', phone: '9600191013', email: 'ravikirang@uiic.co.in' },
];

export const ESCALATION_MATRIX_1: ReadonlyArray<OfficerRow> = [
  { name: 'Mr. P. Suganesh', designation: 'Regional Manager', phone: '9789909967', email: 'psuganesh@uiic.co.in' },
];

export const ESCALATION_MATRIX_2: ReadonlyArray<OfficerRow> = [
  { name: 'Mr. V N Sandeep', designation: 'Deputy General Manager', phone: '9489456079', email: 'vnsandeep@uiic.co.in' },
];

