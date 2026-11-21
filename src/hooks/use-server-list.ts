import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api';
import { LOCAL_MODE } from '@/lib/config';
import { readListCache, writeListCache } from '@/lib/list-cache';

// The list always belongs to one user. While `owner` isn't the signed-in user
// (just logged in, switched account, logged out) the hook reports nothing
// loaded, and late responses or rollbacks for a previous user are dropped.
// `cached`: the items come from the on-device copy and haven't been confirmed by the server yet.
type State<T> = { owner: string; items: T[]; isLoaded: boolean; error: string | null; cached?: boolean };

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

  // Stale-while-revalidate (server mode): show the last copy saved on this device straight away
  // and let the fetch above replace it. It never overrides a fetched list, only an empty failed one.
  useEffect(() => {
    if (LOCAL_MODE || !userId) return;
    let cancelled = false;
    readListCache<T>(userId, path).then((items) => {
      if (cancelled || !items) return;
      setState((prev) => {
        if (prev && prev.owner === userId && !(prev.error && prev.items.length === 0)) return prev;
        return { owner: userId, items, isLoaded: true, error: prev?.owner === userId ? prev.error : null, cached: true };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [path, userId]);

  // Keep the on-device copy current: after each confirmed fetch and each local change. Not while
  // showing the copy itself, nor after an error (the list may then hold a rolled-back guess).
  useEffect(() => {
    if (LOCAL_MODE || !userId || !state || state.owner !== userId) return;
    if (state.cached || state.error || !state.isLoaded) return;
    writeListCache(userId, path, state.items);
  }, [state, path, userId]);

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
            ? { ...prev, items: change(prev.items), error: error ?? prev.error, cached: false }
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
