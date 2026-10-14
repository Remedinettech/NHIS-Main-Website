import { useId, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import './common.css';

interface CardProps {
  title?: string;
  description?: ReactNode;
  /** Right-aligned content in the card header (for example a link). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Consistent white surface. When a title is given the card is a labelled section. */
export function Card({ title, description, actions, className, children }: CardProps) {
  const id = useId();
  return (
    <section className={cx('card', className)} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <div className="card__head">
          <div>
            {title && <h2 id={id} className="card__title">{title}</h2>}
            {description && <p className="card__desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
