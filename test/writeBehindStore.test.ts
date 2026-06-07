import { expect, test } from "bun:test";
import { createVoiceWriteBehindStore } from "../src/core/writeBehindStore";
import { createVoiceMemoryStore } from "../src/core/memoryStore";
import { createVoiceSessionRecord } from "../src/core/store";
import type { VoiceSessionRecord, VoiceSessionStore } from "../src/core/types";

// A persistent store stand-in that records every write so we can assert how
// often (and with what) the write-behind layer flushes. Optionally fails a
// configurable number of upcoming writes to exercise retry.
const createFakePersistentStore = () => {
  const sessions = new Map<string, VoiceSessionRecord>();
  const setCalls: Array<{ id: string; turns: number }> = [];
  let failNext = 0;

  const store: VoiceSessionStore = {
    get: async (id) => sessions.get(id),
    getOrCreate: async (id) => {
      const existing = sessions.get(id);
      if (existing) return existing;
      const created = createVoiceSessionRecord(id);
      sessions.set(id, created);

      return created;
    },
    list: async () => [],
    remove: async (id) => {
      sessions.delete(id);
    },
    set: async (id, value) => {
      if (failNext > 0) {
        failNext -= 1;
        throw new Error("persistent set failed");
      }
      sessions.set(id, value);
      setCalls.push({ id, turns: value.turns.length });
    },
  };

  return {
    failUpcoming: (count: number) => {
      failNext = count;
    },
    getStored: (id: string) => sessions.get(id),
    setCalls,
    store,
  };
};

const seed = (id: string, mutate?: (record: VoiceSessionRecord) => void) => {
  const record = createVoiceSessionRecord(id);
  mutate?.(record);

  return record;
};

const addTurn = (record: VoiceSessionRecord, text: string) => {
  record.turns = [
    ...record.turns,
    { committedAt: record.turns.length + 1, id: `t${record.turns.length}`, text, transcripts: [] },
  ];
};

test("write-behind store hydrates a cold session from the persistent store", async () => {
  const persistent = createFakePersistentStore();
  const prior = seed("call-1", (record) => {
    addTurn(record, "I run a startup");
    record.status = "active";
  });
  await persistent.store.set("call-1", prior);
  persistent.setCalls.length = 0;

  // Fresh write-behind store (simulating a process that just restarted): memory
  // is empty, so get() must fall back to the persistent store and repopulate.
  const memory = createVoiceMemoryStore();
  const store = createVoiceWriteBehindStore({ memory, persistent: persistent.store });

  const resumed = await store.get("call-1");
  expect(resumed?.turns).toHaveLength(1);
  expect(resumed?.turns[0]?.text).toBe("I run a startup");
  // Repopulated into memory — a second read no longer needs the DB.
  expect(await memory.get("call-1")).toMatchObject({ id: "call-1" });

  store.dispose();
});

test("write-behind store coalesces a burst of partial writes into the latest snapshot", async () => {
  const persistent = createFakePersistentStore();
  const store = createVoiceWriteBehindStore({
    flushDebounceMs: 40,
    persistent: persistent.store,
  });

  // Five rapid partial-style writes (no turn growth) within the debounce window.
  for (let index = 0; index < 5; index += 1) {
    await store.set("call-2", seed("call-2", (record) => {
      record.currentTurn.partialText = `word ${index}`;
    }));
  }

  // Nothing persisted synchronously.
  expect(persistent.setCalls).toHaveLength(0);

  await Bun.sleep(80);

  // Collapsed into a single flush carrying the LAST snapshot.
  expect(persistent.setCalls).toHaveLength(1);
  expect(persistent.getStored("call-2")?.currentTurn.partialText).toBe("word 4");

  store.dispose();
});

test("write-behind store flushes a committed turn immediately, bypassing the debounce", async () => {
  const persistent = createFakePersistentStore();
  const store = createVoiceWriteBehindStore({
    flushDebounceMs: 1_000,
    persistent: persistent.store,
  });

  const record = seed("call-3");
  addTurn(record, "first answer");
  await store.set("call-3", record);

  // The turn count grew → flushed without waiting out the 1s debounce.
  await Bun.sleep(10);
  expect(persistent.setCalls).toHaveLength(1);
  expect(persistent.getStored("call-3")?.turns).toHaveLength(1);

  store.dispose();
});

test("write-behind store flush() drains all pending writes (shutdown path)", async () => {
  const persistent = createFakePersistentStore();
  const store = createVoiceWriteBehindStore({
    flushDebounceMs: 10_000,
    persistent: persistent.store,
  });

  await store.set("a", seed("a", (r) => (r.currentTurn.partialText = "pa")));
  await store.set("b", seed("b", (r) => (r.currentTurn.partialText = "pb")));
  expect(persistent.setCalls).toHaveLength(0);

  await store.flush();

  expect(persistent.getStored("a")?.currentTurn.partialText).toBe("pa");
  expect(persistent.getStored("b")?.currentTurn.partialText).toBe("pb");

  store.dispose();
});

test("write-behind store retries a failed flush instead of losing the session", async () => {
  const persistent = createFakePersistentStore();
  const store = createVoiceWriteBehindStore({
    flushDebounceMs: 20,
    logger: { warn: () => {} },
    persistent: persistent.store,
  });

  persistent.failUpcoming(1);
  await store.set("call-4", seed("call-4", (r) => (r.currentTurn.partialText = "keep me")));

  await Bun.sleep(40); // first flush fails, re-queues
  await store.flush(); // subsequent flush succeeds

  expect(persistent.getStored("call-4")?.currentTurn.partialText).toBe("keep me");

  store.dispose();
});
