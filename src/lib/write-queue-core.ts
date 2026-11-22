/**
 * Writes (create, change, delete) that the server has not confirmed yet. A change made without a
 * connection stays here, on the device, and is sent in order once the server answers again, so the
 * screen never has to undo something the user did.
 *
 * `createWriteQueue` holds the logic and gets its storage and network injected; `write-queue.ts`
 * wires it to AsyncStorage and the API.
 */

export type Write = {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** How often the server answered with a failure of its own; a request that always crashes it is dropped. */
  attempts?: number;
};

export type QueueEvent =
  | { type: 'settled'; userId: string; write: Write; outcome: 'done' | 'rejected'; code?: string }
  | { type: 'size'; userId: string; size: number };

type Deps = {
  load: (userId: string) => Promise<Write[]>;
  save: (userId: string, writes: Write[]) => Promise<void>;
  send: (write: Write) => Promise<unknown>;
};

/** Failures of the server itself are retried this many times before the write is given up on. */
export const MAX_SERVER_FAILURES = 5;

type Verdict = 'done' | 'wait' | 'server-failed' | 'rejected';

function codeAndStatus(error: unknown) {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  return { code: typeof code === 'string' ? code : 'UNKNOWN', status: typeof status === 'number' ? status : 0 };
}

/** What a failed attempt means for a write: it already happened, try again later, or it can never work. */
export function judge(write: Write, error: unknown): { verdict: Verdict; code: string } {
  const { code, status } = codeAndStatus(error);
  // No answer, or a session problem that signing in again (or out) settles: keep the write.
  if (code === 'SERVER_UNREACHABLE' || status === 0 || status === 401 || status === 408 || status === 429) {
    return { verdict: 'wait', code };
  }
  if (status >= 500) return { verdict: 'server-failed', code };
  // The first try did get through, only its answer was lost; or someone else already deleted it.
  if (write.method === 'POST' && status === 409) return { verdict: 'done', code };
  if (write.method === 'DELETE' && status === 404) return { verdict: 'done', code };
  return { verdict: 'rejected', code };
}

type Entry = { writes: Write[]; flushing: Promise<void> | null };

export function createWriteQueue({ load, save, send }: Deps) {
  let entries = new Map<string, Promise<Entry>>();
  const resolved = new Map<string, Entry>();
  const listeners = new Set<(event: QueueEvent) => void>();
  // Saves run one after another, so an older snapshot never lands after a newer one.
  let saving: Promise<unknown> = Promise.resolve();

  const emit = (event: QueueEvent) => listeners.forEach((listener) => listener(event));

  function entryOf(userId: string): Promise<Entry> {
    let pending = entries.get(userId);
    if (!pending) {
      pending = load(userId)
        .catch(() => [] as Write[])
        .then((writes) => {
          const entry: Entry = { writes, flushing: null };
          resolved.set(userId, entry);
          emit({ type: 'size', userId, size: writes.length });
          return entry;
        });
      entries.set(userId, pending);
    }
    return pending;
  }

  function persist(userId: string, entry: Entry) {
    const snapshot = [...entry.writes];
    saving = saving.then(() => save(userId, snapshot)).catch(() => {});
    return saving;
  }

  async function run(userId: string, entry: Entry) {
    while (entry.writes.length > 0 && resolved.get(userId) === entry) {
      const write = entry.writes[0];
      let verdict: Verdict = 'done';
      let code: string | undefined;
      try {
        await send(write);
      } catch (error) {
        ({ verdict, code } = judge(write, error));
      }
      if (resolved.get(userId) !== entry) return; // signed out meanwhile
      if (verdict === 'wait') return;
      if (verdict === 'server-failed') {
        write.attempts = (write.attempts ?? 0) + 1;
        if (write.attempts < MAX_SERVER_FAILURES) {
          await persist(userId, entry);
          return;
        }
        verdict = 'rejected';
      }
      entry.writes.shift();
      await persist(userId, entry);
      emit({ type: 'settled', userId, write, outcome: verdict === 'done' ? 'done' : 'rejected', code });
      emit({ type: 'size', userId, size: entry.writes.length });
    }
  }

  return {
    /** Adds a write behind the ones already waiting; resolves once it is saved on the device. */
    async enqueue(userId: string, write: Write) {
      const entry = await entryOf(userId);
      entry.writes.push(write);
      emit({ type: 'size', userId, size: entry.writes.length });
      await persist(userId, entry);
    },

    /**
     * Sends the waiting writes in order until none is left or the server can't be reached. Callers
     * that arrive meanwhile share the same run. Resolves to how many writes are still waiting.
     */
    async flush(userId: string): Promise<number> {
      const entry = await entryOf(userId);
      if (!entry.flushing) {
        entry.flushing = run(userId, entry)
          .catch(() => {})
          .finally(() => {
            entry.flushing = null;
          });
      }
      await entry.flushing;
      return entry.writes.length;
    },

    /** How many writes wait for the user (0 until their queue has been read from the device). */
    size: (userId: string) => resolved.get(userId)?.writes.length ?? 0,

    subscribe(listener: (event: QueueEvent) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Forgets everything held in memory (sign-out); the caller wipes the stored copies. */
    reset() {
      entries = new Map();
      resolved.clear();
    },
  };
}

export type WriteQueue = ReturnType<typeof createWriteQueue>;
