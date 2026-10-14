import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber } from '../../utils/format';
import { Icon, type IconName } from '../common/Icon';
import './dashboard.css';

interface StatCardProps { label: string; value: number; icon: IconName; to: string; hint?: ReactNode }

/** Count tile that links to its section (the whole tile is clickable through the label link). */
export function StatCard({ label, value, icon, to, hint }: StatCardProps) {
  return (
    <li className="stat-card">
      <span className="stat-card__icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <Link to={to} className="stat-card__link">{label}</Link>
      <p className="stat-card__value">{formatNumber(value)}</p>
      {hint && <p className="stat-card__hint">{hint}</p>}
    </li>
  );
}
