import type { AdminListResponse, PublicationStatus } from '@nhis/shared-types';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listRecords, type ModuleName } from '../services/records.api';
import type { AsyncState } from '../types/async';
import { useAsyncData } from './useAsyncData';

export type StatusFilter = PublicationStatus | 'ALL';
const STATUSES: readonly StatusFilter[] = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];

export interface RecordListQueryState {
  q: string;
  status: StatusFilter;
  page: number;
  /** Module-specific filters (for example `district`, `category`, `directoryId`). Empty string means "no filter". */
  filters: Record<string, string>;
}

export interface UseRecordList<T> extends AsyncState<AdminListResponse<T>> {
  query: RecordListQueryState;
  /** Changes search/status/filters (resets to page 1 unless `page` is given). Updates the URL with replace. */
  setQuery: (patch: Partial<Omit<RecordListQueryState, 'filters'>> & { filters?: Record<string, string> }) => void;
  setPage: (page: number) => void;
}

export function parseListQuery(params: URLSearchParams, filterKeys: readonly string[]): RecordListQueryState {
  const status = params.get('status') as StatusFilter | null;
  const page = Number(params.get('page'));
  const filters: Record<string, string> = {};
  for (const key of filterKeys) filters[key] = params.get(key) ?? '';
  return {
    q: params.get('q') ?? '',
    status: status && STATUSES.includes(status) ? status : 'ALL',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    filters,
  };
}

/**
 * List screen state kept in the URL (`?q=&status=&page=&<filter>=`), so reload, back and shared links keep the view.
 * `fixed` adds constant filters that are not part of the URL (for example the contacts directoryId taken from the route).
 */
export function useRecordList<T>(
  module: ModuleName,
  options: { filterKeys?: readonly string[]; pageSize?: number; fixed?: Record<string, string | undefined> } = {},
): UseRecordList<T> {
  const { filterKeys = [], pageSize = 25, fixed } = options;
  const [params, setParams] = useSearchParams();
  const keyList = filterKeys.join(',');
  const query = useMemo(() => parseListQuery(params, keyList ? keyList.split(',') : []), [params, keyList]);
  const fixedKey = JSON.stringify(fixed ?? {});

  const setQuery = useCallback<UseRecordList<T>['setQuery']>((patch) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      const write = (key: string, value: string) => { if (value && value !== 'ALL') next.set(key, value); else next.delete(key); };
      if (patch.q !== undefined) write('q', patch.q);
      if (patch.status !== undefined) write('status', patch.status);
      for (const [key, value] of Object.entries(patch.filters ?? {})) write(key, value);
      if (patch.page !== undefined && patch.page > 1) next.set('page', String(patch.page));
      else next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const setPage = useCallback((page: number) => setQuery({ page }), [setQuery]);

  const state = useAsyncData<AdminListResponse<T>>(
    (signal) => listRecords<T>(module, { q: query.q, status: query.status, page: query.page, pageSize, ...query.filters, ...(fixed ?? {}) }, signal),
    [module, query.q, query.status, query.page, pageSize, JSON.stringify(query.filters), fixedKey],
  );

  return { ...state, query, setQuery, setPage };
}
