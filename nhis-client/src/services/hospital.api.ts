import type { DirectoryStats, HospitalListResponse } from '@nhis/shared-types';
import { get, getCached } from './http';

export interface HospitalQuery { q: string; district: string; page: number; pageSize: number }

export const getHospitals = ({ q, district, page, pageSize }: HospitalQuery, signal?: AbortSignal) =>
  get<HospitalListResponse>(`/hospitals?${new URLSearchParams({ q, district, page: String(page), pageSize: String(pageSize) })}`, signal);

export const getStats = (signal?: AbortSignal) => getCached<DirectoryStats>('/stats', signal);
