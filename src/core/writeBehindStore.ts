import type {
  VoiceLogger,
  VoiceSessionRecord,
  VoiceSessionStore,
} from "./types";
import { createVoiceMemoryStore } from "./memoryStore";

const DEFAULT_FLUSH_DEBOUNCE_MS = 750;
// On shutdown we keep draining until the pending set is empty, but bound the
// passes so a persistent store that keeps failing can't spin forever.
const MAX_FLUSH_DRAIN_PASSES = 5;

export type VoiceWriteBehindStore<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = VoiceSessionStore<TSession> & {
  /** Force every pending snapshot out to the persistent store. Call on graceful
   *  shutdown (after the deploy drain) so an in-flight call survives the restart
   *  even if it was killed at the drain ceiling. Resolves once the persistent
   *  store has the latest snapshot of every dirty session. */
  flush: () => Promise<void>;
  /** Stop the debounce timer. Call after the final flush() on shutdown. */
  dispose: () => void;
};

export type VoiceWriteBehindStoreOptions<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  /** The durable store snapshots are written back to (Postgres / SQLite / file).
   *  This is what a fresh process reads from to resume a call after a restart. */
  persistent: VoiceSessionStore<TSession>;
  /** The synchronous hot-path store. Defaults to an in-memory Map store — the
   *  config that keeps up with high-frequency STT callbacks without dropping
   *  transcripts. Override only for tests. */
  memory?: VoiceSessionStore<TSession>;
  /** How long a write may sit in memory before it's flushed to the persistent
   *  store. Bounds the worst-case state lost on a hard crash. Default 750ms. A
   *  turn commit (turns array grows) bypasses this and flushes immediately. */
  flushDebounceMs?: number;
  logger?: VoiceLogger;
};

/**
 * A session store that is fast AND durable.
 *
 * The in-memory store is authoritative for the live call: get/set are
 * synchronous, so the hot path (STT partials/finals firing every ~100ms) never
 * waits on the database and concurrent writes can't race. Every write is ALSO
 * recorded as a pending snapshot and flushed to the persistent store on a
 * debounce (coalescing a burst of partials into ~one DB write), with a turn
 * commit flushing immediately so completed turns are durable right away.
 *
 * On a cold `get`/`getOrCreate` miss — e.g. a fresh process after a deploy — it
 * hydrates the session from the persistent store and repopulates memory. That's
 * the resume path: the client reconnects with the same session id, the server
 * finds the persisted session, so it does NOT re-fire the greeting and replays
 * the prior turns instead of starting over.
 */
export const createVoiceWriteBehindStore = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceWriteBehindStoreOptions<TSession>,
): VoiceWriteBehindStore<TSession> => {
  const memory = options.memory ?? createVoiceMemoryStore<TSession>();
  const { persistent } = options;
  const flushDebounceMs = options.flushDebounceMs ?? DEFAULT_FLUSH_DEBOUNCE_MS;
  const logger = options.logger;

  // id -> latest snapshot not yet confirmed written to the persistent store.
  const pending = new Map<string, TSession>();
  // id -> committed-turn count last persisted, so a growing turns array (a turn
  // commit) can trigger an immediate flush instead of waiting for the debounce.
  const persistedTurnCount = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // All flushes run on one chain so an immediate (turn-commit) flush and a
  // debounced flush can never write the persistent store concurrently.
  let flushChain: Promise<void> = Promise.resolve();

  const doFlush = async () => {
    if (pending.size === 0) {
      return;
    }

    const batch = new Map(pending);
    pending.clear();

    for (const [id, value] of batch) {
      try {
        await persistent.set(id, value);
        persistedTurnCount.set(id, value.turns.length);
      } catch (error) {
        // Keep the newest snapshot queued (a fresh write during the await wins)
        // and retry on the next cycle rather than losing the session.
        if (!pending.has(id)) {
          pending.set(id, value);
        }
        logger?.warn?.("voice write-behind flush failed; will retry", {
          error: error instanceof Error ? error.message : String(error),
          sessionId: id,
        });
        scheduleFlush();
      }
    }
  };

  const runFlush = () => {
    flushChain = flushChain.then(doFlush, doFlush);

    return flushChain;
  };

  const scheduleFlush = () => {
    if (timer) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      void runFlush();
    }, flushDebounceMs);
  };

  const markDirty = (id: string, value: TSession) => {
    pending.set(id, value);
    // A committed turn must be durable immediately — a crash in the debounce
    // window shouldn't drop a turn the caller already finished.
    if (value.turns.length > (persistedTurnCount.get(id) ?? 0)) {
      void runFlush();
    } else {
      scheduleFlush();
    }
  };

  const hydrate = async (id: string): Promise<TSession | undefined> => {
    const persisted = await persistent.get(id);
    if (!persisted) {
      return undefined;
    }

    await memory.set(id, persisted);
    // Don't treat the hydrated turns as newly-committed on the next write.
    persistedTurnCount.set(id, persisted.turns.length);

    return persisted;
  };

  const get = async (id: string) => {
    const live = await memory.get(id);
    if (live) {
      return live;
    }

    return hydrate(id);
  };

  const getOrCreate = async (id: string) => {
    const existing = await get(id);
    if (existing) {
      return existing;
    }

    return memory.getOrCreate(id);
  };

  const set = async (id: string, value: TSession) => {
    await memory.set(id, value);
    markDirty(id, value);
  };

  const remove = async (id: string) => {
    pending.delete(id);
    persistedTurnCount.delete(id);
    await memory.remove(id);
    await persistent.remove(id);
  };

  const list = () => memory.list();

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    // Drain until nothing is pending — a write that lands while a flush is in
    // flight is caught by the next pass. Bounded so a failing store can't spin.
    for (
      let pass = 0;
      pass < MAX_FLUSH_DRAIN_PASSES && pending.size > 0;
      pass += 1
    ) {
      await runFlush();
    }
    // Settle the chain even if pending was already empty on entry.
    await flushChain;
  };

  const dispose = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { dispose, flush, get, getOrCreate, list, remove, set };
};
