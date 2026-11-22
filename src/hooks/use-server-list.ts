import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api';
import { LOCAL_MODE } from '@/lib/config';
import { readListCache, writeListCache } from '@/lib/list-cache';
import { writeQueue } from '@/lib/write-queue';
import type { Write } from '@/lib/write-queue-core';

// The list always belongs to one user. While `owner` isn't the signed-in user
// (just logged in, switched account, logged out) the hook reports nothing
// loaded, and late responses or rollbacks for a previous user are dropped.
// `cached`: the items come from the on-device copy and haven't been confirmed by the server yet.
type State<T> = { owner: string; items: T[]; isLoaded: boolean; error: string | null; cached?: boolean };

type Change<T> = (prev: T[]) => T[];

const EMPTY: never[] = [];

/** How often waiting changes are retried while the app is open. */
const RETRY_MS = 15_000;

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
  // A fetch that was in flight while the user changed something holds a pre-change snapshot, so its
  // answer must not replace the list. It is dropped and the list is fetched again once the changes
  // have reached the server.
  const mutationCount = useRef(0);
  const pendingMutations = useRef(0);
  const reloadWanted = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  // Server mode: changes that haven't reached the server yet (offline). Each can still be undone on the screen
  // if the server turns it down; changes left over from an earlier run have no undo and trigger a refetch instead.
  const [pendingWrites, setPendingWrites] = useState(0);
  const rollbacks = useRef(new Map<string, { rollback: Change<T> }>());

  const load = useCallback(async () => {
    if (!userId) return;
    const fetchId = ++latestFetch.current;
    const mutationsAtStart = mutationCount.current;
    const outdated = () => fetchId !== latestFetch.current;
    const changedMeanwhile = () => mutationCount.current !== mutationsAtStart || pendingMutations.current > 0;
    if (!LOCAL_MODE) {
      // Changes made offline go first; until they are through, the server's list would undo them.
      await writeQueue.flush(userId);
      if (outdated()) return;
      if (writeQueue.size(userId) > 0) {
        setState((prev) =>
          prev && prev.owner === userId ? prev : { owner: userId, items: [], isLoaded: true, error: 'SERVER_UNREACHABLE' },
        );
        return;
      }
    }
    try {
      const items = await api<T[]>(path);
      if (outdated()) return;
      if (changedMeanwhile()) {
        reloadWanted.current = true;
        return;
      }
      setState({ owner: userId, items, isLoaded: true, error: null });
    } catch (e) {
      if (outdated()) return;
      if (changedMeanwhile()) {
        reloadWanted.current = true;
        return;
      }
      // A failed refresh keeps the list already on screen; only the first load falls back to empty.
      setState((prev) =>
        prev && prev.owner === userId
          ? { ...prev, error: errorCode(e) }
          : { owner: userId, items: [], isLoaded: true, error: errorCode(e) },
      );
    }
  }, [path, userId]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

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

  const applyChange = useCallback(
    (change: Change<T>, error?: string) =>
      setState((prev) =>
        prev && prev.owner === userId
          ? { ...prev, items: change(prev.items), error: error ?? prev.error, cached: false }
          : prev,
      ),
    [userId],
  );

  // What the queue reports: the size of the backlog, and writes the server finally refused.
  useEffect(() => {
    if (LOCAL_MODE || !userId) return;
    setPendingWrites(writeQueue.size(userId));
    return writeQueue.subscribe((event) => {
      if (event.userId !== userId) return;
      if (event.type === 'size') {
        setPendingWrites(event.size);
        return;
      }
      const mine = rollbacks.current.get(event.write.id);
      rollbacks.current.delete(event.write.id);
      if (event.outcome !== 'rejected') return;
      if (mine) applyChange(mine.rollback, event.code);
      else {
        // A write from an earlier run, refused now: the screen can't undo it, the server's list is the truth.
        reloadWanted.current = true;
        if (pendingMutations.current === 0) {
          reloadWanted.current = false;
          loadRef.current();
        }
      }
    });
  }, [userId, applyChange]);

  // While changes are waiting, keep trying: the connection may come back with the app in the foreground.
  useEffect(() => {
    if (pendingWrites === 0) return;
    const timer = setInterval(() => loadRef.current(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pendingWrites]);

  /**
   * Applies `optimistic` to the list now and sends `request`. In server mode the request goes through
   * the on-device queue: without a connection it waits there and the change stays on screen; if the
   * server finally turns it down, `rollback` is applied and the error code surfaced. Rollbacks should
   * touch only the affected item, so a concurrent mutation that succeeded is kept.
   */
  const mutate = useCallback(
    (optimistic: Change<T>, request: Omit<Write, 'id'>, rollback: Change<T>) => {
      if (!userId) return;
      mutationCount.current++;
      pendingMutations.current++;
      applyChange(optimistic);
      const settled = () => {
        pendingMutations.current--;
        if (pendingMutations.current === 0 && reloadWanted.current) {
          reloadWanted.current = false;
          loadRef.current();
        }
      };
      if (LOCAL_MODE) {
        api(request.path, { method: request.method, body: request.body })
          .catch((e) => applyChange(rollback, errorCode(e)))
          .finally(settled);
        return;
      }
      const write: Write = { ...request, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      rollbacks.current.set(write.id, { rollback });
      writeQueue
        .enqueue(userId, write)
        .then(() => writeQueue.flush(userId))
        .catch(() => {})
        .finally(settled);
    },
    [userId, applyChange],
  );

  const clearError = useCallback(
    () => setState((prev) => (prev && prev.error ? { ...prev, error: null } : prev)),
    [],
  );

  return {
    items: current?.items ?? (EMPTY as T[]),
    isLoaded: current?.isLoaded ?? false,
    error: current?.error ?? null,
    /** Changes saved on this device that the server hasn't confirmed yet (offline). */
    pendingWrites,
    clearError,
    mutate,
    refresh: load,
  };
}
