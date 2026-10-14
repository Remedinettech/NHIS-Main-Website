import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Behaviour shared by disclosure menus (login menu, navigation submenus):
 * Escape closes and returns focus to the trigger; clicking or tabbing outside closes.
 */
export function useDismissableMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const onBlur = useCallback((event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !containerRef.current?.contains(next)) setOpen(false);
  }, []);

  return { open, setOpen, close, containerRef, triggerRef, onBlur };
}
