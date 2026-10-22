import { useCallback, useLayoutEffect, useRef } from 'react';

/** Selector of the control named `name` (a `data-focus` attribute) that can take focus. Quotes and backslashes are escaped. */
export const focusSelector = (name: string): string => `[data-focus="${name.replace(/["\\]/g, '\\$&')}"]:not(:disabled)`;

/**
 * Names of the controls that may take focus after a row moved from index `from` to index `to`, most wanted first: the button
 * that was pressed (a row that moved up has "Move up" at its new place), else the other direction, for a row that reached
 * an end of the list, where the pressed button is now disabled. `prefix` names the row and must not change when it moves.
 * Buttons carry `data-focus="<prefix>-up"` and `data-focus="<prefix>-down"`.
 */
export function moveFocusTargets(prefix: string, from: number, to: number): [string, string] {
  const [pressed, other] = to < from ? (['up', 'down'] as const) : (['down', 'up'] as const);
  return [`${prefix}-${pressed}`, `${prefix}-${other}`];
}

/**
 * Moving or removing a row of a list draws the list again, and the button that was just pressed may be moved in the page,
 * be drawn anew or become disabled (the first row cannot move up), which drops keyboard focus on the page. A component
 * calls the returned function right before it changes the list, naming the controls (a `data-focus` attribute) that may take
 * focus, most wanted first. After the next render the first one that exists and is enabled gets it. Names must be unique in
 * the page (build them with `useId()`).
 */
export function useFocusRequest(): (...names: string[]) => void {
  const wanted = useRef<string[] | null>(null);
  // Runs after every render of the caller; acts only when a change asked for focus.
  useLayoutEffect(() => {
    const names = wanted.current;
    if (!names) return;
    wanted.current = null;
    for (const name of names) {
      const control = document.querySelector<HTMLElement>(focusSelector(name));
      if (control) {
        control.focus();
        return;
      }
    }
  });
  return useCallback((...names: string[]) => { wanted.current = names; }, []);
}
