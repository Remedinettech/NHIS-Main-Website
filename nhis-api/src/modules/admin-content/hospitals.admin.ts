import type { AdminHospitalValues } from '@nhis/shared-types';
import type { Prisma, Hospital } from '@prisma/client';
import { queryString } from '../../common/admin';
import { buildHospitalSearchText } from '../hospitals/hospital-search';
import type { EntityAdapter } from './engine';
import { listFilters, optionalText, randomId, searchWords, type ModuleDefinition } from './shared';

const KEYS = [
  'nameEn', 'nameTa', 'addressEn', 'addressTa', 'districtEn', 'districtTa', 'stateEn', 'stateTa',
  'postcode', 'category', 'type', 'specialty', 'contact', 'mapUrl',
] as const;

const MAP_HOSTS = ['maps.google.com', 'www.google.com', 'google.com'] as const;

const hospitalColumns = (v: AdminHospitalValues) => ({ ...v, searchText: buildHospitalSearchText(v) });

export const hospitalAdapter: EntityAdapter<AdminHospitalValues, Hospital> = {
  entityType: 'hospital',
  label: (v) => v.nameEn.trim() || v.nameTa.trim(),
  find: (tx, id) => tx.hospital.findUnique({ where: { id } }),
  live: (r) => ({
    nameEn: r.nameEn, nameTa: r.nameTa, addressEn: r.addressEn, addressTa: r.addressTa,
    districtEn: r.districtEn, districtTa: r.districtTa, stateEn: r.stateEn, stateTa: r.stateTa,
    postcode: r.postcode, category: r.category, type: r.type, specialty: r.specialty, contact: r.contact, mapUrl: r.mapUrl,
  }),
  draftValues: (r) => (r.draft as AdminHospitalValues | null) ?? null,
  columnData: (v) => hospitalColumns(v),
  update: async (tx, id, version, data) => (await tx.hospital.updateMany({ where: { id, version }, data: data as Prisma.HospitalUpdateManyMutationInput })).count,
  create: (tx, { id, values, userId }) =>
    tx.hospital.create({
      data: { ...(hospitalColumns(values) as Prisma.HospitalUncheckedCreateInput), id, status: 'DRAFT', version: 1, createdById: userId, updatedById: userId },
    }),
  newId: () => `hosp_${randomId()}`,
  remove: async (tx, row) => { await tx.hospital.delete({ where: { id: row.id } }); },
  extras: async (_db, row) => ({ sourceRow: row.sourceRow }),
};

export const hospitalModule: ModuleDefinition<AdminHospitalValues, Hospital> = {
  async parseValues(v, input) {
    const obj = v.object(input, 'values');
    if (!obj) return emptyValues();
    v.noUnknownKeys(obj, KEYS);
    const nameEn = v.string(obj.nameEn, 'nameEn', { max: 200 }) ?? '';
    const addressEn = v.string(obj.addressEn, 'addressEn', { max: 600, multiline: true }) ?? '';
    const districtEn = v.string(obj.districtEn, 'districtEn', { max: 100 }) ?? '';
    const postcode = optionalText(v, obj.postcode, 'postcode', 12);
    if (postcode && !/^[0-9A-Za-z -]{3,12}$/.test(postcode)) v.fail('postcode', 'Use letters, digits, spaces and hyphens only.');
    const mapUrl = v.url(obj.mapUrl, 'mapUrl', { optional: true, hosts: MAP_HOSTS, max: 1000 }) ?? '';
    const values: AdminHospitalValues = {
      nameEn,
      nameTa: optionalText(v, obj.nameTa, 'nameTa', 200),
      addressEn,
      addressTa: optionalText(v, obj.addressTa, 'addressTa', 600, true),
      districtEn,
      districtTa: optionalText(v, obj.districtTa, 'districtTa', 100),
      stateEn: optionalText(v, obj.stateEn, 'stateEn', 100),
      stateTa: optionalText(v, obj.stateTa, 'stateTa', 100),
      postcode,
      category: optionalText(v, obj.category, 'category', 20),
      type: optionalText(v, obj.type, 'type', 60),
      specialty: optionalText(v, obj.specialty, 'specialty', 2000, true),
      contact: optionalText(v, obj.contact, 'contact', 500, true),
      mapUrl,
    };
    v.throwIfInvalid();
    return values;
  },

  async list(db, params, paging) {
    const { q, status } = listFilters(params);
    const district = queryString(params, 'district', 100);
    const words = searchWords(q);
    const where: Prisma.HospitalWhereInput = {
      ...(status ? { status } : {}),
      ...(district ? { districtEn: { contains: district, mode: 'insensitive' } } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ searchText: { contains: w } }, { id: { contains: w, mode: 'insensitive' as const } }] })) } : {}),
    };
    const [total, rows] = await Promise.all([
      db.hospital.count({ where }),
      db.hospital.findMany({ where, orderBy: [{ nameEn: 'asc' }, { id: 'asc' }], skip: paging.skip, take: paging.pageSize }),
    ]);
    return { rows, total };
  },
};

function emptyValues(): AdminHospitalValues {
  return { nameEn: '', nameTa: '', addressEn: '', addressTa: '', districtEn: '', districtTa: '', stateEn: '', stateTa: '', postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '' };
}
