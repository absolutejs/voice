import { describe, expect, test } from "bun:test";
import {
  createVoiceDNCRegistry,
  importVoiceDNCFromCSV,
} from "../src/core/dncRegistry";

describe("createVoiceDNCRegistry", () => {
  test("normalizes phone numbers on block/check", async () => {
    const registry = createVoiceDNCRegistry();
    registry.block("+1 (415) 555-0100");
    const verdict = await registry.check("+1-415-555-0100");
    expect(verdict.blocked).toBe(true);
    expect(verdict.entry?.phoneNumber).toBe("+14155550100");
  });

  test("unblock removes entry", () => {
    const registry = createVoiceDNCRegistry({
      entries: [
        {
          addedAt: 0,
          phoneNumber: "+14155550100",
          source: "internal",
        },
      ],
    });
    expect(registry.has("+14155550100")).toBe(true);
    expect(registry.unblock("+14155550100")).toBe(true);
    expect(registry.has("+14155550100")).toBe(false);
  });

  test("expired entries fall off", () => {
    let t = 1000;
    const registry = createVoiceDNCRegistry({ now: () => t });
    registry.block("+14155550101", { expiresAt: 2000 });
    expect(registry.has("+14155550101")).toBe(true);
    t = 3000;
    expect(registry.has("+14155550101")).toBe(false);
  });

  test("falls through to external lookup when not in store", async () => {
    const registry = createVoiceDNCRegistry({
      externalLookup: (phone) =>
        phone === "+14155550199"
          ? {
              addedAt: 0,
              phoneNumber: phone,
              reason: "FTC",
              source: "regulatory",
            }
          : null,
    });
    const verdict = await registry.check("+14155550199");
    expect(verdict.blocked).toBe(true);
    expect(verdict.matchedFromExternal).toBe(true);
    expect(verdict.entry?.source).toBe("regulatory");
  });

  test("snapshot excludes expired", () => {
    let t = 1000;
    const registry = createVoiceDNCRegistry({ now: () => t });
    registry.block("+14155550100");
    registry.block("+14155550101", { expiresAt: 1500 });
    t = 2000;
    const snap = registry.snapshot();
    expect(snap.map((e) => e.phoneNumber)).toEqual(["+14155550100"]);
  });

  test("rejects invalid phone numbers", () => {
    const registry = createVoiceDNCRegistry();
    expect(() => registry.block("not-a-number")).toThrow();
    expect(() => registry.block("")).toThrow();
  });
});

describe("importVoiceDNCFromCSV", () => {
  test("parses headers + rows with optional reason", () => {
    const csv = "phone,reason\n+14155550100,opted-out\n+14155550101,";
    const entries = importVoiceDNCFromCSV(csv, { now: () => 5_000 });
    expect(entries).toHaveLength(2);
    expect(entries[0]?.reason).toBe("opted-out");
    expect(entries[1]?.reason).toBeUndefined();
    expect(entries[0]?.source).toBe("imported");
  });

  test("respects custom column names", () => {
    const csv = "number\n+14155550100";
    const entries = importVoiceDNCFromCSV(csv, { phoneColumn: "number" });
    expect(entries).toHaveLength(1);
  });

  test("throws on missing phone column", () => {
    expect(() => importVoiceDNCFromCSV("name\nalice")).toThrow(/Phone column/);
  });
});
