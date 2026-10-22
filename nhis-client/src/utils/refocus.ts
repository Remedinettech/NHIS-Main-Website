/**
 * "The visitor came back to this tab": the trigger that makes an open page pick up what was published meanwhile.
 *
 * Switching to a tab fires `visibilitychange` and `focus` within a few milliseconds of each other; both are listened
 * to (either one alone is missed by some browsers) and a pair of them calls back once. How much of this reaches the
 * network is decided by the request layer: `getCached` answers from memory for `REVALIDATE_TTL_MS` (services/http.ts),
 * so coming back within that time costs no request and a visitor who keeps switching tabs makes at most one request
 * per endpoint every 15 seconds.
 */

interface Listenable {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** What `onRefocus` listens on; the defaults are the real window and document (replaceable for tests). */
export interface RefocusEnvironment {
  window: Listenable;
  document: Listenable & { readonly visibilityState: string };
  now: () => number;
}

/** Events closer together than this belong to one switch to the tab. */
export const REFOCUS_COALESCE_MS = 1_000;

function browserEnvironment(): RefocusEnvironment | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  return { window, document, now: () => Date.now() };
}

/**
 * Calls `callback` when the window gets focus or the tab becomes visible again (never while the tab is hidden).
 * Returns the function that removes the listeners. Does nothing outside a browser.
 */
export function onRefocus(callback: () => void, environment: RefocusEnvironment | undefined = browserEnvironment()): () => void {
  if (!environment) return () => undefined;
  const { window: target, document: page, now } = environment;
  let last: number | undefined;
  const trigger = () => {
    if (page.visibilityState !== 'visible') return;
    const at = now();
    if (last !== undefined && at - last < REFOCUS_COALESCE_MS) return;
    last = at;
    callback();
  };
  target.addEventListener('focus', trigger);
  page.addEventListener('visibilitychange', trigger);
  return () => {
    target.removeEventListener('focus', trigger);
    page.removeEventListener('visibilitychange', trigger);
  };
}
