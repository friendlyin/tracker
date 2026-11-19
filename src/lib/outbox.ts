// The outbox: every write the app makes is queued here first, persisted, and sent to the server one
// at a time in the order it was made. Logging therefore never fails for lack of signal: the screen
// updates optimistically, the write waits on the phone (also across app restarts) and syncs when the
// network is back. Replaying late is safe because ids and timestamps are set when the write is made.

export interface Op {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  /** Device timezone when the write was made: sent as `x-timezone`, so `local_date` is that day. */
  tz: string;
  /** When the write was made (Unix ms). */
  at: number;
}

export interface OutboxState {
  /** Writes not yet accepted by the server. */
  pending: number;
  sending: boolean;
  /** The last attempt failed (no network, server error); a retry is scheduled. */
  failing: boolean;
  /** Writes the server refused (4xx) and that were dropped, until `clearRejected()`. */
  rejected: number;
}

export interface OutboxDeps {
  load: () => Promise<Op[] | undefined>;
  save: (ops: Op[]) => Promise<void>;
  /** Sends one op and returns the HTTP status; 0 means login needed. Throws on network failure. */
  send: (op: Op) => Promise<number>;
  /** The queue emptied after sending: refetch so screens show the server's state. */
  onDrained: () => void;
  /** The session expired (401): go through the login again. */
  onAuth: () => void;
  newId: () => string;
  timeZone: () => string;
  now?: () => number;
}

/** Retry delays after failures in a row, in ms. */
export const BACKOFF = [2_000, 5_000, 15_000, 60_000];

export function createOutbox(deps: OutboxDeps) {
  const now = deps.now ?? Date.now;
  let ops: Op[] = [];
  let loaded: Promise<void> | null = null;
  let saving: Promise<void> = Promise.resolve();
  let flushing: Promise<void> | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: OutboxState = { pending: 0, sending: false, failing: false, rejected: 0 };
  const listeners = new Set<() => void>();

  const emit = (next: Partial<OutboxState>) => {
    state = { ...state, pending: ops.length, ...next };
    for (const l of listeners) l();
  };

  const load = () => {
    loaded ??= deps
      .load()
      .then((stored) => {
        ops = [...(stored ?? []), ...ops];
      })
      .catch((e) => console.warn("outbox: could not read the queue", e))
      .finally(() => emit({}));
    return loaded;
  };

  // Writes to storage run one after another, each with the queue as it was at that moment. A failed
  // save keeps the op in memory, so it still syncs while the app stays open.
  const persist = () => {
    const snapshot = [...ops];
    saving = saving
      .then(() => deps.save(snapshot))
      .catch((e) => console.warn("outbox: could not save the queue", e));
    return saving;
  };

  const retryLater = () => {
    failures++;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), BACKOFF[Math.min(failures, BACKOFF.length) - 1]);
    emit({ failing: true });
  };

  /** Sends until the queue is empty ("done") or an attempt fails ("stopped"). */
  async function run(): Promise<"done" | "stopped"> {
    clearTimeout(timer);
    await load();
    let sent = false;
    while (ops.length > 0) {
      const op = ops[0] as Op;
      emit({ sending: true });
      let status: number;
      try {
        status = await deps.send(op);
      } catch {
        retryLater();
        return "stopped";
      }
      if (status === 0 || status === 401) {
        emit({ failing: true });
        deps.onAuth();
        return "stopped";
      }
      if (status >= 500 || status === 408 || status === 429) {
        retryLater();
        return "stopped";
      }
      // 2xx: done. 404: the target is gone (deleted elsewhere), nothing left to do. Other 4xx: the
      // server will never accept it; drop it so the queue moves on, and say so.
      const refused = status >= 400 && status !== 404;
      if (refused) console.warn("outbox: write refused", status, op.method, op.path, op.body);
      ops.shift();
      failures = 0;
      sent = true;
      emit({ failing: false, rejected: state.rejected + (refused ? 1 : 0) });
      await persist();
    }
    if (sent) deps.onDrained();
    return "done";
  }

  /** Sends what is queued. Concurrent calls share one run; ops added meanwhile go in the same run. */
  function flush(): Promise<void> {
    flushing ??= run()
      .catch((e): "stopped" => {
        console.warn("outbox:", e);
        return "stopped";
      })
      .then((r) => {
        flushing = null;
        emit({ sending: false });
        // An op queued after the loop ended but before this point still goes out now.
        if (r === "done" && ops.length > 0) return flush();
      });
    return flushing;
  }

  /** Queues a write (persisted before it resolves) and starts sending. */
  async function enqueue(input: { method: string; path: string; body?: unknown }) {
    const op: Op = { ...input, id: deps.newId(), tz: deps.timeZone(), at: now() };
    await load();
    ops.push(op);
    emit({});
    await persist();
    void flush();
  }

  return {
    enqueue,
    flush,
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    clearRejected: () => emit({ rejected: 0 }),
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
