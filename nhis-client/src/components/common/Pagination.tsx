import { useLanguage } from '../../context/LanguageContext';
import { cx } from '../../utils/classNames';
import { pageItems } from '../../utils/pagination';
import { Icon } from './Icon';
import './common.css';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label={t('common.pagination')}>
      <button type="button" className="pagination__step" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevronRight" size={18} className="pagination__flip" />
        <span>{t('common.previous')}</span>
      </button>
      <ul className="pagination__pages">
        {pageItems(page, totalPages).map((item) => (
          <li key={item}>
            {typeof item === 'number' ? (
              <button
                type="button"
                className={cx('pagination__page', item === page && 'is-current')}
                aria-current={item === page ? 'page' : undefined}
                aria-label={t('common.pageOf', { page: item, total: totalPages })}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            ) : (
              <span className="pagination__gap" aria-hidden="true">…</span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="pagination__step" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <span>{t('common.next')}</span>
        <Icon name="chevronRight" size={18} />
      </button>
    </nav>
  );
}
