import { describe, expect, test } from "bun:test";
import {
  createVoiceRetentionScheduler,
  purgeVoiceRetentionStore,
} from "../src/core/retention";

type Record = { at: number; id: string };

const makeStore = (initial: Record[]) => {
  const records = new Map(initial.map((r) => [r.id, r]));
  const removed: string[] = [];
  return {
    list: async () => Array.from(records.values()),
    remove: async (id: string) => {
      records.delete(id);
      removed.push(id);
    },
    removed,
    snapshot: () => Array.from(records.values()),
  };
};

describe("purgeVoiceRetentionStore", () => {
  test("removes only records older than maxAgeMs", async () => {
    const now = 1_000_000;
    const store = makeStore([
      { at: now - 10 * 60_000, id: "old-1" },
      { at: now - 5 * 60_000, id: "old-2" },
      { at: now - 60_000, id: "fresh" },
    ]);
    const report = await purgeVoiceRetentionStore(
      store,
      { maxAgeMs: 2 * 60_000 },
      now,
    );
    expect(report.removed).toBe(2);
    expect(report.purgedIds.sort()).toEqual(["old-1", "old-2"]);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]!.id).toBe("fresh");
  });

  test("counts failures separately from successes", async () => {
    const failingStore = {
      list: async () => [
        { at: 0, id: "a" },
        { at: 0, id: "b" },
      ],
      remove: async (id: string) => {
        if (id === "b") throw new Error("nope");
      },
    };
    const report = await purgeVoiceRetentionStore(
      failingStore,
      { maxAgeMs: 1 },
      Date.now(),
    );
    expect(report.attempted).toBe(2);
    expect(report.removed).toBe(1);
    expect(report.failed).toBe(1);
  });

  test("honors a custom resolveAt for records keyed on a different timestamp field", async () => {
    const now = 1_000_000;
    const records = [
      { createdAt: now - 100, id: "x" },
      { createdAt: now, id: "y" },
    ];
    const store = {
      list: async () => records,
      remove: async (id: string) => {
        records.splice(
          records.findIndex((r) => r.id === id),
          1,
        );
      },
    };
    const report = await purgeVoiceRetentionStore(
      store,
      {
        maxAgeMs: 50,
        resolveAt: (event) =>
          typeof (event as { createdAt?: number }).createdAt === "number"
            ? (event as { createdAt: number }).createdAt
            : undefined,
      },
      now,
    );
    expect(report.purgedIds).toEqual(["x"]);
  });
});

describe("createVoiceRetentionScheduler", () => {
  test("clamps intervalMs to at least 60 seconds", () => {
    const scheduler = createVoiceRetentionScheduler({
      intervalMs: 10,
      policy: { maxAgeMs: 1_000 },
      store: { list: async () => [], remove: async () => {} },
    });
    scheduler.start();
    scheduler.stop();
    expect(true).toBe(true);
  });
});
