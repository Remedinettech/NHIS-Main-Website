import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Icon } from './Icon';
import './forms.css';

type Tone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem { id: number; tone: Tone; message: string }

export interface ToastApi {
  /** Call only after a 2xx response. */
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const LIFETIME_MS: Record<Tone, number> = { success: 6000, info: 6000, warning: 9000, error: 10000 };

/** Mounts the live region and provides `useToast()`. Messages disappear on their own and can be dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((tone: Tone, message: string) => {
    counter.current += 1;
    const id = counter.current;
    setItems((current) => [...current.slice(-3), { id, tone, message }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME_MS[tone]));
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((timer) => window.clearTimeout(timer)); };
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        <div aria-live="polite" aria-atomic="false">
          {items.map((item) => (
            <div key={item.id} className={cx('toast', `toast--${item.tone}`)} role={item.tone === 'error' ? 'alert' : 'status'}>
              <Icon name={item.tone === 'success' ? 'check' : item.tone === 'info' ? 'info' : 'alert'} size={20} />
              <p>{item.message}</p>
              <button type="button" className="toast__close" aria-label="Dismiss message" onClick={() => dismiss(item.id)}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

interface BannerProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** Inline banner for messages that belong to a screen section (success after save, errors, notices). */
export function Banner({ tone = 'info', title, children, action, onDismiss, className }: BannerProps) {
  return (
    <div className={cx('banner', `banner--${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={20} />
      <div className="banner__body">
        {title && <p className="banner__title">{title}</p>}
        {children && <div className="banner__text">{children}</div>}
        {action && <div className="banner__action">{action}</div>}
      </div>
      {onDismiss && <button type="button" className="toast__close" aria-label="Dismiss message" onClick={onDismiss}><Icon name="close" size={18} /></button>}
    </div>
  );
}
