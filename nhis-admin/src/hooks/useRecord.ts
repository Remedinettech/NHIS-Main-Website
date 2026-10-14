import { getRecord, type ModuleName } from '../services/records.api';
import type { AsyncState } from '../types/async';
import { useAsyncData } from './useAsyncData';

/** Loads one record by id (or slug for pages). `reload()` fetches the latest version, for example after a 409. */
export function useRecord<T>(module: ModuleName, id: string | undefined): AsyncState<T | null> {
  return useAsyncData<T | null>((signal) => (id ? getRecord<T>(module, id, signal) : Promise.resolve(null)), [module, id]);
}
