import type { ReactNode } from 'react';
import { Button } from './Button';
import { describeError } from './errorMessage';
import { ApiError } from '../../services/http';
import { Icon } from './Icon';
import './common.css';

export function LoadingState({ label = 'Loading…', rows = 0 }: { label?: string; rows?: number }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
      {rows > 0 && (
        <div className="skeleton-list" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}
        </div>
      )}
    </div>
  );
}

interface ErrorStateProps { error: Error; title?: string; onRetry?: () => void }

/** Failure view with a plain-language reason and a retry action. */
export function ErrorState({ error, title = 'This data could not be loaded', onRetry }: ErrorStateProps) {
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" size={28} />
      <h2 className="state__title">{title}</h2>
      <p>{describeError(error)}</p>
      {onRetry && !(error instanceof ApiError && error.code === 'MIGRATION_REQUIRED') && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
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
