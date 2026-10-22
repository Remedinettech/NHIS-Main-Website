/**
 * Focus after a route change: keyboard and screen-reader users start at the heading of the new page.
 *
 * Pages that load their text show a heading at once and draw a new one when the text arrives (the element is replaced, not
 * updated), and the focus that sat on the first heading falls back to <body>. A real-browser check of the Pages-module
 * routes (policies, coverage, eligibility, enrollment, forms, grievances, gallery) found exactly that. So the focus is
 * given to the heading, and again to the heading that replaces it, until the visitor does something of their own (key,
 * pointer) or a few seconds have passed. Focus that the visitor moved is never taken back.
 */

/** The parts of the page this needs; the defaults are the real document (replaceable for tests). */
export interface RouteFocusEnvironment {
  /** The heading of the page now on screen (`#page-title`), if there is one. */
  heading(): Focusable | null;
  /** The element that holds the focus now, `null` or the body when nothing does. */
  active(): unknown;
  /** The `<main>` element, which holds the focus while there is no heading. */
  main: Focusable | null;
  /** Calls back whenever the content of the page changes. Returns the function that stops it. */
  onContentChange(callback: () => void): () => void;
  /** Calls back at the first key press or pointer press of the visitor. Returns the function that stops it. */
  onVisitorInput(callback: () => void): () => void;
  /** Calls back after `ms`. Returns the function that cancels it. */
  after(ms: number, callback: () => void): () => void;
  /** The body: focus on it means that no element holds the focus. */
  body: unknown;
}

export interface Focusable { focus(options?: { preventScroll?: boolean }): void }

/** How long the page may take to draw its text and still get the focus on its heading. */
export const ROUTE_FOCUS_WATCH_MS = 5_000;

/**
 * Puts the focus on the page heading (or on `main` without one) and keeps doing so for a heading that replaces it.
 * Returns the function that ends the watch (also ended by the visitor's first input and after ROUTE_FOCUS_WATCH_MS).
 */
export function focusPageHeading(environment: RouteFocusEnvironment | undefined = browserEnvironment()): () => void {
  if (!environment) return () => undefined;
  const { main, body } = environment;
  const give = () => {
    const target = environment.heading() ?? main;
    target?.focus({ preventScroll: true });
    return target;
  };
  let current = give();

  const stops: Array<() => void> = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const stop of stops) stop();
  };

  stops.push(environment.onVisitorInput(finish));
  stops.push(environment.after(ROUTE_FOCUS_WATCH_MS, finish));
  stops.push(environment.onContentChange(() => {
    if (finished) return;
    const heading = environment.heading();
    if (!heading || heading === current) return;
    // A new heading is on the page. Take the focus over only from where this function left it (the heading that is gone,
    // which leaves the body, or main); focus that the visitor placed somewhere else stays there.
    const active = environment.active();
    if (active === null || active === undefined || active === body || active === main || active === current) {
      heading.focus({ preventScroll: true });
    }
    current = heading;
  }));
  return finish;
}

function browserEnvironment(): RouteFocusEnvironment | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
  const main = document.getElementById('main');
  return {
    heading: () => document.getElementById('page-title'),
    active: () => document.activeElement,
    main,
    body: document.body,
    onContentChange(callback) {
      if (!main || typeof MutationObserver === 'undefined') return () => undefined;
      const observer = new MutationObserver(callback);
      observer.observe(main, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    onVisitorInput(callback) {
      const events = ['keydown', 'pointerdown'] as const;
      for (const type of events) document.addEventListener(type, callback, true);
      return () => { for (const type of events) document.removeEventListener(type, callback, true); };
    },
    after(ms, callback) {
      const timer = window.setTimeout(callback, ms);
      return () => window.clearTimeout(timer);
    },
  };
}
