import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { QuadrantId, Task } from '@/types/task';

const storageKey = (userId: string) => `escalation:seen:${userId}`;

/**
 * Identifies one escalation of a task. Moving the due date (or the task's own quadrant) makes a
 * new one, so a task that arrives in an urgent quadrant again is announced again.
 */
const signatureOf = (task: Task) => `${task.id}|${task.quadrantId}|${task.dueDate ?? ''}`;

type Arrivals = { quadrantId: QuadrantId; ids: string[] };
type State = { owner: string; seen: Set<string>; arrivals: Arrivals | null };

/**
 * Which deadline-escalated tasks the user has already seen in their new quadrant, persisted per
 * account so each move is announced once, not on every launch.
 *
 * `escalated` is every currently escalated task, or `null` while tasks are still loading.
 * `unseen` stays empty until the stored list has loaded, so nothing flashes as new.
 * `arrivals` are the tasks marked seen while looking at a quadrant, for highlighting them
 * until the user moves on (`clearArrivals`).
 */
export function useEscalationSeen(escalated: Task[] | null) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State | null>(null);
  const current = state && state.owner === userId ? state : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId))
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        let seen: string[] = [];
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) seen = parsed.filter((item): item is string => typeof item === 'string');
        } catch {
          // Corrupt entry: start over.
        }
        setState({ owner: userId, seen: new Set(seen), arrivals: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const unseen = new Set(
    current && escalated
      ? escalated.filter((task) => !current.seen.has(signatureOf(task))).map((task) => task.id)
      : [],
  );

  const markSeen = useCallback(
    (ids: string[], quadrantId: QuadrantId) => {
      if (!current || !escalated || !userId || ids.length === 0) return;
      // Keep only escalations that are still live, so the stored list doesn't grow forever.
      const live = new Set(escalated.map(signatureOf));
      const seen = new Set([...current.seen].filter((signature) => live.has(signature)));
      for (const task of escalated) if (ids.includes(task.id)) seen.add(signatureOf(task));
      AsyncStorage.setItem(storageKey(userId), JSON.stringify([...seen])).catch(() => {});

      const previous = current.arrivals?.quadrantId === quadrantId ? current.arrivals.ids : [];
      setState({ owner: userId, seen, arrivals: { quadrantId, ids: [...new Set([...previous, ...ids])] } });
    },
    [current, escalated, userId],
  );

  const clearArrivals = useCallback(() => {
    setState((prev) => (prev && prev.arrivals ? { ...prev, arrivals: null } : prev));
  }, []);

  return { unseen, markSeen, arrivals: current?.arrivals ?? null, clearArrivals };
}
