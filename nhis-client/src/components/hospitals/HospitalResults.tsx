import type { HospitalListResponse } from '@nhis/shared-types';
import { useLanguage } from '../../context/LanguageContext';
import type { AsyncState } from '../../types/async';
import { formatNumber } from '../../utils/format';
import { Button } from '../common/Button';
import { EmptyState, ErrorState, LoadingState } from '../common/StateViews';
import { Pagination } from '../common/Pagination';
import { HospitalCard } from './HospitalCard';
import './hospitals.css';

interface HospitalResultsProps {
  state: AsyncState<HospitalListResponse>;
  onPageChange: (page: number) => void;
  onClear: () => void;
  hasFilters: boolean;
}

/** Result region with count, loading, error and empty states. Keeps the previous page visible while refreshing. */
export function HospitalResults({ state, onPageChange, onClear, hasFilters }: HospitalResultsProps) {
  const { t, locale } = useLanguage();
  const { data, error, loading, refreshing, reload } = state;

  if (error && !data) return <ErrorState error={error} titleKey="hospitals.errorTitle" onRetry={reload} />;
  if (loading && !data) return <LoadingState label={t('hospitals.loadingResults')} rows={4} />;
  if (!data) return null;

  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);
  const count = data.total === 1
    ? t('hospitals.resultCountOne')
    : t('hospitals.resultCount', { count: formatNumber(data.total, locale) });

  return (
    <section aria-label={t('hospitals.resultsRegion')} aria-busy={refreshing}>
      <h2 className="visually-hidden">{t('hospitals.resultsRegion')}</h2>
      {error && <ErrorState error={error} titleKey="hospitals.errorTitle" onRetry={reload} />}
      <div className="hospital-summary">
        <p className="hospital-summary__count" role="status" aria-live="polite">
          <strong>{count}</strong>
          {data.total > 0 && <span className="text-muted"> · {t('common.showingRange', { from, to, total: formatNumber(data.total, locale) })}</span>}
        </p>
        {refreshing && <span className="text-muted hospital-summary__busy">{t('hospitals.refreshing')}</span>}
      </div>
      {data.total === 0 ? (
        <EmptyState
          title={t('hospitals.emptyTitle')}
          action={hasFilters ? <Button variant="secondary" onClick={onClear}>{t('common.clearFilters')}</Button> : undefined}
        >
          {t('hospitals.emptyBody')}
        </EmptyState>
      ) : (
        <ul className="hospital-list">
          {data.data.map((hospital) => <HospitalCard key={hospital.id} hospital={hospital} />)}
        </ul>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} onChange={onPageChange} />
    </section>
  );
}
