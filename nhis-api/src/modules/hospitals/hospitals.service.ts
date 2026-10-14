import type { Hospital, HospitalListResponse } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { ValidationError } from '../../common/utils/errors';
import { parsePositiveInt } from '../../common/utils/validation';
import { normalizeSearch } from './hospital-search';
import { hospitalRepository, type HospitalRepository } from './hospitals.repository';

export function createHospitalsService(repository: HospitalRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  /** Sorted, de-duplicated, trimmed English district names of the published hospitals. */
  async function districtNames(values?: readonly string[]): Promise<string[]> {
    const all = values ?? (await repository.listDistrictValues());
    return [...new Set(all.map((d) => d.trim()).filter(Boolean))].sort();
  }

  async function search(params: URLSearchParams): Promise<HospitalListResponse> {
    const q = params.get('q') || '';
    const district = params.get('district') || '';
    if (q.length > 200 || district.length > 100) throw new ValidationError('Search query is too long');
    const requested = parsePositiveInt(params.get('page'), 'page', 1, 100000);
    const pageSize = parsePositiveInt(params.get('pageSize'), 'pageSize', 12, 100);
    const needle = normalizeSearch(q);

    const rawDistricts = await repository.listDistrictValues();
    // The district filter compares normalised values, so it is resolved to the matching stored spellings first.
    const districtValues = district ? rawDistricts.filter((d) => normalizeSearch(d) === normalizeSearch(district)) : undefined;
    const districts = await districtNames(rawDistricts);

    let page = requested;
    let result = districtValues && districtValues.length === 0 ? { rows: [] as Hospital[], total: 0 } : await repository.search({ needle, districtValues, skip: (page - 1) * pageSize, take: pageSize });
    const totalPages = Math.ceil(result.total / pageSize);
    const clamped = Math.min(requested, Math.max(1, totalPages));
    if (clamped !== page) {
      page = clamped;
      result = await repository.search({ needle, districtValues, skip: (page - 1) * pageSize, take: pageSize });
    }
    return {
      data: result.rows,
      total: result.total,
      page,
      pageSize,
      totalPages,
      districts,
      source: 'snapshot',
      capturedAt: capturedAt(),
    };
  }

  const findById = (id: string): Promise<Hospital | null> => repository.findById(id);
  const count = (): Promise<number> => repository.count();

  return { search, findById, count };
}

export type HospitalsService = ReturnType<typeof createHospitalsService>;
export const hospitalsService = createHospitalsService(hospitalRepository);

/** Convenience wrappers kept for existing callers and tests. */
export const searchHospitals = (params: URLSearchParams): Promise<HospitalListResponse> => hospitalsService.search(params);
export const findHospital = (id: string): Promise<Hospital | null> => hospitalsService.findById(id);
