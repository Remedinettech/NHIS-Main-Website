import type { DirectoryStats, HospitalListResponse } from '@nhis/shared-types';
import { get, getCached } from './client';

export interface HospitalQuery { q: string; district: string; page: number; pageSize: number }

export function getHospitals({ q, district, page, pageSize }: HospitalQuery, signal?: AbortSignal): Promise<HospitalListResponse> {
  const params = new URLSearchParams({ q, district, page: String(page), pageSize: String(pageSize) });
  return get<HospitalListResponse>(`/hospitals?${params}`, signal);
}

export const getStats = (signal?: AbortSignal): Promise<DirectoryStats> => getCached<DirectoryStats>('/stats', signal);

/** District names for the admin filter (from the public directory response). */
export const getDistricts = async (signal?: AbortSignal): Promise<string[]> =>
  (await getCached<HospitalListResponse>('/hospitals?pageSize=1', signal)).districts;
