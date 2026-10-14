import type { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { MessageKey } from '../../locales';
import { Button } from './Button';
import { errorMessageKey } from './errorMessage';
import { Icon } from './Icon';
import './common.css';

export function LoadingState({ label, rows = 0 }: { label?: string; rows?: number }) {
  const { t } = useLanguage();
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
      {rows > 0 && (
        <div className="skeleton-list" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}
        </div>
      )}
    </div>
  );
}

interface ErrorStateProps { error: Error; titleKey?: MessageKey; onRetry?: () => void }

/** Failure view with a plain-language reason and a retry action. */
export function ErrorState({ error, titleKey = 'common.errorTitle', onRetry }: ErrorStateProps) {
  const { t } = useLanguage();
  const { key, params } = errorMessageKey(error);
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" size={28} />
      <h2 className="state__title">{t(titleKey)}</h2>
      <p>{t(key, params)}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

interface EmptyStateProps { title: string; children?: ReactNode; action?: ReactNode }

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="state state--empty">
      <Icon name="search" size={28} />
      <h2 className="state__title">{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
