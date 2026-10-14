import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/http';

export type MutationResult<R> = { ok: true; data: R } | { ok: false; error: Error };

export interface MutationState<A extends unknown[], R> {
  /** Runs the mutation. Ignored (returns null) while a previous run is still pending, which prevents double submit. */
  run: (...args: A) => Promise<MutationResult<R> | null>;
  pending: boolean;
  error: Error | undefined;
  /** Server field errors from a 400/422 response, keyed by normalised field path (for example `helplines.0.number`). */
  fieldErrors: Record<string, string>;
  /** The 409 CONFLICT error, when the record changed under the user (see ConflictBanner). */
  conflict: ApiError | undefined;
  reset: () => void;
}

/**
 * Generic mutation runner: pending flag, double-submit guard, typed error and field-error mapping.
 * It never retries and never swallows the outcome: `run` resolves with `{ ok, data | error }`.
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>): MutationState<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const busy = useRef(false);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (...args: A): Promise<MutationResult<R> | null> => {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const data = await fnRef.current(...args);
      return { ok: true, data };
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('Request failed');
      if (mounted.current) setError(failure);
      return { ok: false, error: failure };
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(undefined), []);
  const apiError = error instanceof ApiError ? error : undefined;
  return {
    run, pending, error, reset,
    fieldErrors: apiError ? apiError.fieldErrors : {},
    conflict: apiError?.isConflict ? apiError : undefined,
  };
}
