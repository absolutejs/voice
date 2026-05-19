import { describe, expect, test } from "bun:test";
import {
  createInMemoryVoiceCallerCRMLinkCache,
  createVoiceCallerCRMLinker,
} from "../src/callerCRMLinker";
import type {
  VoiceCRMContactSummary,
  VoiceCRMContract,
} from "../src/crmContract";

const buildContract = (overrides: Partial<VoiceCRMContract> = {}): VoiceCRMContract => ({
  vendor: "hubspot",
  addNote: async () => ({ noteId: "n_1" }),
  createLead: async (i) => ({ ...i, id: "c_1", vendor: "hubspot" }),
  logCall: async () => ({ activityId: "a_1" }),
  lookupByEmail: async () => null,
  lookupByPhone: async () => null,
  ...overrides,
});

const sample = (): VoiceCRMContactSummary => ({
  email: "alex@example.com",
  firstName: "Alex",
  id: "c_42",
  vendor: "hubspot",
});

describe("createVoiceCallerCRMLinker", () => {
  test("resolves via phone lookup and caches", async () => {
    let phoneCalls = 0;
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract({
        lookupByPhone: async () => {
          phoneCalls += 1;
          return sample();
        },
      }),
    });
    const first = await linker.resolve({ phone: "+14155550100" });
    const second = await linker.resolve({ phone: "+14155550100" });
    expect(first?.contactId).toBe("c_42");
    expect(second?.source).toBe("phone-lookup");
    expect(phoneCalls).toBe(1);
  });

  test("falls back to email lookup when phone misses", async () => {
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract({
        lookupByEmail: async () => sample(),
        lookupByPhone: async () => null,
      }),
    });
    const result = await linker.resolve({
      email: "alex@example.com",
      phone: "+14155550100",
    });
    expect(result?.source).toBe("email-lookup");
  });

  test("returns null when both lookups miss", async () => {
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract(),
    });
    const result = await linker.resolve({
      email: "ghost@nowhere.com",
      phone: "+14155550100",
    });
    expect(result).toBeNull();
  });

  test("stale cache entries trigger a fresh lookup", async () => {
    let t = 1_000;
    let calls = 0;
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract({
        lookupByPhone: async () => {
          calls += 1;
          return sample();
        },
      }),
      now: () => t,
      staleAfterMs: 500,
    });
    await linker.resolve({ phone: "+14155550100" });
    t = 2_000;
    await linker.resolve({ phone: "+14155550100" });
    expect(calls).toBe(2);
  });

  test("associate writes a manual link without touching the contract", async () => {
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract(),
    });
    const linked = await linker.associate(
      { phone: "+14155550100" },
      sample(),
    );
    expect(linked.source).toBe("manual");
    const cached = await linker.resolve({ phone: "+14155550100" });
    expect(cached?.contactId).toBe("c_42");
  });

  test("invalidate forces a re-lookup", async () => {
    let calls = 0;
    const linker = createVoiceCallerCRMLinker({
      contract: buildContract({
        lookupByPhone: async () => {
          calls += 1;
          return sample();
        },
      }),
    });
    await linker.resolve({ phone: "+14155550100" });
    await linker.invalidate({ phone: "+14155550100" });
    await linker.resolve({ phone: "+14155550100" });
    expect(calls).toBe(2);
  });

  test("explicit cache store is honored", async () => {
    const cache = createInMemoryVoiceCallerCRMLinkCache();
    const linker = createVoiceCallerCRMLinker({
      cache,
      contract: buildContract({ lookupByPhone: async () => sample() }),
    });
    await linker.resolve({ phone: "+14155550100" });
    expect(await cache.get("hubspot::+14155550100")).not.toBeNull();
  });
});
