import { Link } from 'react-router-dom';
import { cx } from '../../utils/classNames';
import './common.css';

export interface TabItem { id: string; label: string; to: string; meta?: string }

interface TabsProps { label: string; items: readonly TabItem[]; activeId: string | undefined }

/** Tabs that are real links (the selection lives in the address), so back/forward and sharing keep working. */
export function Tabs({ label, items, activeId }: TabsProps) {
  return (
    <nav aria-label={label}>
      <ul className="tabs">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.to} replace className={cx('tab', item.id === activeId && 'is-active')} aria-current={item.id === activeId ? 'page' : undefined}>
              <span className="tab__label">{item.label}</span>
              {item.meta && <span className="tab__meta">{item.meta}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
