import { describe, expect, test } from "bun:test";
import { createInMemoryVoiceCallQuota } from "../src/core/callQuota";

describe("createInMemoryVoiceCallQuota", () => {
  test("reserves up to reservedConcurrent + burstAllowance, then rejects with concurrency-exceeded", async () => {
    const quota = createInMemoryVoiceCallQuota({
      tiers: [
        { burstAllowance: 1, customerId: "cust-1", reservedConcurrent: 2 },
      ],
    });
    const a = await quota.reserve({ callId: "a", customerId: "cust-1" });
    const b = await quota.reserve({ callId: "b", customerId: "cust-1" });
    const c = await quota.reserve({ callId: "c", customerId: "cust-1" });
    const d = await quota.reserve({ callId: "d", customerId: "cust-1" });
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.rejection.reason).toBe("concurrency-exceeded");
      expect(d.rejection.retryAfterMs).toBe(30_000);
    }
  });

  test("releasing a reservation frees a slot", async () => {
    const quota = createInMemoryVoiceCallQuota({
      tiers: [{ customerId: "cust-2", reservedConcurrent: 1 }],
    });
    const first = await quota.reserve({ callId: "a", customerId: "cust-2" });
    expect(first.ok).toBe(true);
    const second = await quota.reserve({ callId: "b", customerId: "cust-2" });
    expect(second.ok).toBe(false);
    if (first.ok) await first.reservation.release();
    const third = await quota.reserve({ callId: "c", customerId: "cust-2" });
    expect(third.ok).toBe(true);
  });

  test("rejects with monthly-minutes-exceeded when usage hits the cap", async () => {
    const quota = createInMemoryVoiceCallQuota({
      tiers: [
        { customerId: "cust-3", monthlyMinutes: 5, reservedConcurrent: 5 },
      ],
    });
    await quota.recordMinutes({ customerId: "cust-3", minutes: 5 });
    const result = await quota.reserve({
      callId: "a",
      customerId: "cust-3",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.rejection.reason).toBe("monthly-minutes-exceeded");
  });

  test("strict mode rejects unknown customers; non-strict admits them", async () => {
    const strict = createInMemoryVoiceCallQuota({ strict: true, tiers: [] });
    const lenient = createInMemoryVoiceCallQuota({ tiers: [] });
    const a = await strict.reserve({ callId: "a", customerId: "x" });
    const b = await lenient.reserve({ callId: "a", customerId: "x" });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
  });

  test("describe reports current state", async () => {
    const quota = createInMemoryVoiceCallQuota({
      tiers: [
        { customerId: "cust-4", monthlyMinutes: 60, reservedConcurrent: 3 },
      ],
    });
    await quota.reserve({ callId: "a", customerId: "cust-4" });
    await quota.recordMinutes({ customerId: "cust-4", minutes: 12 });
    const snapshot = await quota.describe("cust-4");
    expect(snapshot?.activeCalls).toBe(1);
    expect(snapshot?.monthlyMinutesUsed).toBe(12);
    expect(snapshot?.tier.reservedConcurrent).toBe(3);
  });
});
