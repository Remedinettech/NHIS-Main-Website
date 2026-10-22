import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../../config/navigation';
import { useCan } from '../../hooks/useAuth';
import { cx } from '../../utils/classNames';
import { BrandLogo } from '../common/BrandLogo';
import { Icon } from '../common/Icon';
import { AccountMenu } from './AccountMenu';
import './layout.css';

const SIDEBAR_ID = 'admin-sidebar';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const firstRender = useRef(true);
  const canManageUsers = useCan('users.manage');

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // Route change: close the drawer and move focus to the new page heading (not on first load).
  useEffect(() => {
    setOpen(false);
    if (firstRender.current) { firstRender.current = false; return; }
    document.getElementById('page-title')?.focus({ preventScroll: false });
  }, [location.pathname]);

  // Drawer: focus moves in, Esc closes and returns focus, Tab stays inside.
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(true); return; }
      if (event.key !== 'Tab' || !sidebarRef.current) return;
      const items = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const items = NAV_ITEMS.filter((item) => item.requires !== 'users.manage' || canManageUsers);
  const current = NAV_ITEMS.find((item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside ref={sidebarRef} id={SIDEBAR_ID} className={cx('sidebar', open && 'is-open')} aria-label="Administration sections">
        <div className="sidebar__brand">
          <BrandLogo variant="sidebar" to="/dashboard" />
          <button ref={closeRef} type="button" className="sidebar__close" aria-label="Close navigation" onClick={() => close(true)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar__nav" aria-label="Primary">
          <ul className="sidebar__list">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => cx('nav-link', isActive && 'is-active')}>
                  <Icon name={item.icon} />
                  <span><span className="nav-link__label">{item.label}</span>{item.description && <small className="nav-link__description">{item.description}</small>}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <button
        type="button"
        className={cx('sidebar-backdrop', open && 'is-open')}
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => close(false)}
      />
      <div className="shell__main">
        <header className="topbar">
          <button
            ref={toggleRef}
            type="button"
            className="topbar__menu"
            aria-expanded={open}
            aria-controls={SIDEBAR_ID}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="menu" />
            <span>Menu</span>
          </button>
          <p className="topbar__title">{current?.label ?? 'Administration'}</p>
          <AccountMenu />
        </header>
        <main id="main" className="shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
