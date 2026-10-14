import type { HospitalListResponse } from '@nhis/shared-types';
import { getHospitals, type HospitalQuery } from '../services/hospital.api';
import type { AsyncState } from '../types/async';
import { useAsyncData } from './useAsyncData';

export function useHospitals({ q, district, page, pageSize }: HospitalQuery): AsyncState<HospitalListResponse> {
  return useAsyncData((signal) => getHospitals({ q, district, page, pageSize }, signal), [q, district, page, pageSize]);
}
