import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { AsyncState } from '../types/async';
import { onRefocus } from '../utils/refocus';

export interface AsyncDataOptions {
  /**
   * Ask again, quietly, when the visitor comes back to this tab (window focus or tab visible, see utils/refocus.ts), so
   * that what was published meanwhile appears without a reload. The request layer answers from memory while its entry
   * is fresh (services/http.ts), so this costs no request for a visitor who keeps switching tabs. What is shown stays
   * as it is while the request runs and when it fails; a page that has no data yet (its first request failed) is
   * retried the same way.
   */
  revalidateOnFocus?: boolean;
}

/**
 * Runs `load` whenever `deps` change, cancelling the previous request.
 * While a refresh is running the previous data stays available (`refreshing`), which avoids layout jumps.
 */
export function useAsyncData<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList, options: AsyncDataOptions = {}): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const hasData = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const { revalidateOnFocus = false } = options;

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    loadRef.current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        hasData.current = true;
        setData(result);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause : new Error('Request failed'));
        setLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [...deps, attempt]);

  // Quiet refresh when the visitor returns to the tab. It lives and dies with the inputs of the main effect above.
  useEffect(() => {
    if (!revalidateOnFocus) return;
    let controller: AbortController | undefined;
    const stop = onRefocus(() => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      loadRef.current(current.signal).then(
        (result) => {
          if (current.signal.aborted) return;
          hasData.current = true;
          // The same object (the request layer answered from memory) changes nothing and renders nothing.
          setData(result);
          setError(undefined);
          setLoading(false);
        },
        () => { /* a failed refresh keeps what is on screen; the next return to the tab asks again */ },
      );
    });
    return () => {
      stop();
      controller?.abort();
    };
  }, [revalidateOnFocus, ...deps]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, loading, refreshing, reload };
}
