import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { AsyncState } from '../types/async';

/**
 * Runs `load` whenever `deps` change, cancelling the previous request.
 * While a refresh is running the previous data stays available (`refreshing`), which avoids layout jumps.
 */
export function useAsyncData<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const hasData = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

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

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, loading, refreshing, reload };
}
