import { useCallback, useMemo, useRef, useState } from 'react';

export interface DirtyForm<T> {
  values: T;
  setValues: (next: T | ((current: T) => T)) => void;
  /** Sets one top-level field. */
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  dirty: boolean;
  /** Treats the current values as saved (call after a successful save with the server's response). */
  markClean: (saved?: T) => void;
  /** Throws away edits and returns to the last saved values. */
  reset: () => void;
}

/**
 * Tracks edits against the last saved values (compared structurally). Pair with <UnsavedChangesGuard when={dirty} />.
 * Pass new `initial` data via `markClean(serverValues)` after loading or saving.
 */
export function useDirtyForm<T>(initial: T): DirtyForm<T> {
  const [saved, setSaved] = useState<T>(initial);
  const [values, setValues] = useState<T>(initial);
  const latest = useRef(values);
  latest.current = values;
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => setValues((current) => ({ ...current, [key]: value })), []);
  const markClean = useCallback((next?: T) => {
    const base = next ?? latest.current;
    setSaved(base);
    setValues(base);
  }, []);
  const reset = useCallback(() => setValues(saved), [saved]);

  return { values, setValues, setField, dirty, markClean, reset };
}
