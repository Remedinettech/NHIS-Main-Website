import { useEffect, useId } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { NavLinkItem, NavMenuItem } from '../../config/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { useDismissableMenu } from '../../hooks/useDismissableMenu';
import { usePortalHrefs } from '../../hooks/usePortals';
import { useVisibleNav } from '../../hooks/useVisibleNav';
import { cx } from '../../utils/classNames';
import { ExternalLink } from '../common/ExternalLink';
import { Icon } from '../common/Icon';

function NavEntry({ item }: { item: NavLinkItem }) {
  const { t } = useLanguage();
  const hrefs = usePortalHrefs();
  if (item.href) {
    return <ExternalLink href={item.id === 'track-claim' ? hrefs.trackClaim : item.href} className="nav__link">{t(item.labelKey)}</ExternalLink>;
  }
  return (
    <NavLink to={item.to ?? '/'} end={item.to === '/'} className={({ isActive }) => cx('nav__link', isActive && 'is-active')}>
      {t(item.labelKey)}
    </NavLink>
  );
}

function NavMenu({ item }: { item: NavMenuItem }) {
  const { t } = useLanguage();
  const location = useLocation();
  const { open, setOpen, close, containerRef, triggerRef, onBlur } = useDismissableMenu();
  const panelId = useId();
  const active = item.children.some((child) => child.kind === 'link' && child.to !== undefined && location.pathname === child.to);

  useEffect(() => { setOpen(false); }, [location.pathname, setOpen]);

  return (
    <div className="nav__menu" ref={containerRef} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={cx('nav__link', 'nav__trigger', active && 'is-active')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t(item.labelKey)}</span>
        <Icon name="chevronDown" size={16} className="nav__chevron" />
      </button>
      <ul id={panelId} className="nav__submenu" hidden={!open} onClick={() => close()}>
        {item.children.map((child) => child.kind === 'heading'
          ? <li key={child.id} className="nav__heading" aria-hidden="true">{t(child.labelKey)}</li>
          : <li key={child.id}><NavEntry item={child} /></li>)}
      </ul>
    </div>
  );
}

/** Primary navigation (desktop bar and the mobile panel share this markup). */
export function PrimaryNav({ open, id }: { open: boolean; id: string }) {
  const { t } = useLanguage();
  const items = useVisibleNav();
  return (
    <nav id={id} className={cx('nav', open && 'is-open')} aria-label={t('site.mainNav')}>
      <ul className="nav__list container">
        {items.map((item) => (
          <li key={item.id} className="nav__item">
            {item.kind === 'menu' ? <NavMenu item={item} /> : <NavEntry item={item} />}
          </li>
        ))}
      </ul>
    </nav>
  );
}
