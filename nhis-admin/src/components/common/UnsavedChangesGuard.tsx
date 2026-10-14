import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from './Dialog';

/**
 * Warns before leaving a form with unsaved edits: in-app navigation (a confirmation dialog) and closing or reloading
 * the tab (the browser's own prompt). Changing only the query string (filters, paging) on the same page is allowed.
 * Set `when` from `useDirtyForm().dirty`, and clear it (markClean) before navigating away after a successful save.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      confirmLabel="Leave without saving"
      cancelLabel="Stay on this page"
      destructive
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      You have changes that have not been saved. If you leave now they will be lost.
    </ConfirmDialog>
  );
}
