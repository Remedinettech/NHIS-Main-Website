/** Search normalisation shared by the public search, the import and (later) the admin save path. */
export const normalizeSearch = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export interface HospitalSearchFields {
  nameEn: string;
  nameTa: string;
  addressEn: string;
  addressTa: string;
  districtEn: string;
  districtTa: string;
  specialty: string;
  postcode: string;
}

/** Lower-cased, whitespace-normalised concatenation of the searchable live fields (both languages). */
export function buildHospitalSearchText(f: HospitalSearchFields): string {
  return normalizeSearch([f.nameEn, f.nameTa, f.addressEn, f.addressTa, f.districtEn, f.districtTa, f.specialty, f.postcode].join(' '));
}
