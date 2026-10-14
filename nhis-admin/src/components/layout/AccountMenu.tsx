import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../common/Icon';

/** Account button with a small menu. Disclosure pattern: Esc closes and returns focus, focus leaving closes it. */
export function AccountMenu() {
  const { signOut, user } = useAuth();
  const email = user?.email ?? '';
  const name = user?.name ?? 'Account';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(true); };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  const onSignOut = () => {
    signOut().then(() => navigate('/login', { replace: true })).catch(() => setOpen(false));
  };

  return (
    <div
      className="account"
      ref={rootRef}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button ref={buttonRef} type="button" className="account__button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <span className="account__avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <span className="account__name">{name}</span>
        <Icon name="chevronDown" size={16} className="account__chevron" />
      </button>
      {open && (
        <div id={menuId} className="account__menu">
          <div className="account__who">
            <p className="account__who-name">{name}</p>
            <p className="account__who-email">{email}</p>
          </div>
          <button type="button" className="account__item" onClick={onSignOut}>
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
