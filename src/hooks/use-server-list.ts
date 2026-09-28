import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api';

// The list always belongs to one user. While `owner` isn't the signed-in user
// (just logged in, switched account, logged out) the hook reports nothing
// loaded, and late responses or rollbacks for a previous user are dropped.
type State<T> = { owner: string; items: T[]; isLoaded: boolean; error: string | null };

type Change<T> = (prev: T[]) => T[];

const EMPTY: never[] = [];

function errorCode(e: unknown) {
  return e instanceof ApiError ? e.code : 'UNKNOWN';
}

/**
 * The signed-in user's list at `path` (e.g. `/tasks`), fetched whenever the
 * user changes, when the app returns to the foreground, and on `refresh()`
 * (pull-to-refresh), so changes made from another device on the same
 * account show up. `mutate` is the
 * optimistic-update primitive the data hooks build on (R4.4).
 */
export function useServerList<T>(path: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State<T> | null>(null);
  const current = state && state.owner === userId ? state : null;
  // Only the newest fetch may write, so an older response can't overwrite a newer one.
  const latestFetch = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const fetchId = ++latestFetch.current;
    try {
      const items = await api<T[]>(path);
      if (fetchId === latestFetch.current) setState({ owner: userId, items, isLoaded: true, error: null });
    } catch (e) {
      if (fetchId !== latestFetch.current) return;
      // A failed refresh keeps the list already on screen; only the first load falls back to empty.
      setState((prev) =>
        prev && prev.owner === userId
          ? { ...prev, error: errorCode(e) }
          : { owner: userId, items: [], isLoaded: true, error: errorCode(e) },
      );
    }
  }, [path, userId]);

  useEffect(() => {
    load();
    const fetches = latestFetch;
    return () => {
      // Drop the in-flight response when the user or path changes.
      fetches.current++;
    };
  }, [load]);

  useEffect(() => {
    let wasActive = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (next) => {
      const isActive = next === 'active';
      if (isActive && !wasActive) load();
      wasActive = isActive;
    });
    return () => subscription.remove();
  }, [load]);

  /**
   * Applies `optimistic` to the list now, sends `request`, and on failure
   * applies `rollback` and surfaces the error code. Rollbacks should touch
   * only the affected item, so a concurrent mutation that succeeded is kept.
   */
  const mutate = useCallback(
    (optimistic: Change<T>, request: () => Promise<unknown>, rollback: Change<T>) => {
      if (!userId) return;
      const apply = (change: Change<T>, error?: string) =>
        setState((prev) =>
          prev && prev.owner === userId
            ? { ...prev, items: change(prev.items), error: error ?? prev.error }
            : prev,
        );
      apply(optimistic);
      request().catch((e) => apply(rollback, errorCode(e)));
    },
    [userId],
  );

  const clearError = useCallback(
    () => setState((prev) => (prev && prev.error ? { ...prev, error: null } : prev)),
    [],
  );

  return {
    items: current?.items ?? (EMPTY as T[]),
    isLoaded: current?.isLoaded ?? false,
    error: current?.error ?? null,
    clearError,
    mutate,
    refresh: load,
  };
}
