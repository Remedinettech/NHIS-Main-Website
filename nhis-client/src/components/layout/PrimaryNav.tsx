import { useEffect, useId } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useDismissableMenu } from '../../hooks/useDismissableMenu';
import { useVisibleNav } from '../../hooks/useVisibleNav';
import { cx } from '../../utils/classNames';
import { routePathOf, type NavEntryView } from '../../utils/siteLinks';
import { Icon } from '../common/Icon';
import { BilingualText, SiteLink } from '../common/SiteLink';

function NavMenu({ entry }: { entry: Extract<NavEntryView, { kind: 'menu' }> }) {
  const location = useLocation();
  const { open, setOpen, close, containerRef, triggerRef, onBlur } = useDismissableMenu();
  const panelId = useId();
  const active = entry.children.some((child) => child.kind === 'link' && child.link.kind === 'route' && location.pathname === routePathOf(child.link.href));

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
        <span><BilingualText value={entry.item.label} /></span>
        <Icon name="chevronDown" size={16} className="nav__chevron" />
      </button>
      <ul id={panelId} className="nav__submenu" hidden={!open} onClick={() => close()}>
        {entry.children.map((child) => child.kind === 'heading'
          ? <li key={child.id} className="nav__heading" aria-hidden="true"><BilingualText value={child.item.label} /></li>
          : <li key={child.id}><SiteLink item={child.item} nav className="nav__link" /></li>)}
      </ul>
    </div>
  );
}

/**
 * Primary navigation (desktop bar and the mobile panel share this markup). The entries are the managed navigation
 * content: order, labels, dropdown groups and visibility are the editor's; entries that cannot be shown (including the
 * Gallery while it has no published item) are left out by `useVisibleNav`.
 */
export function PrimaryNav({ open, id }: { open: boolean; id: string }) {
  const { t } = useLanguage();
  const entries = useVisibleNav();
  return (
    <nav id={id} className={cx('nav', open && 'is-open')} aria-label={t('site.mainNav')}>
      <ul className="nav__list container">
        {entries.map((entry) => (
          <li key={entry.id} className="nav__item">
            {entry.kind === 'menu' ? <NavMenu entry={entry} /> : <SiteLink item={entry.item} nav className="nav__link" />}
          </li>
        ))}
      </ul>
    </nav>
  );
}
