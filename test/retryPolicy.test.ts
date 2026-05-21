import { describe, expect, test } from "bun:test";
import { createVoiceRetryPolicy } from "../src/core/retryPolicy";

describe("createVoiceRetryPolicy", () => {
  test("schedules a retry after voicemail with cooldown", () => {
    const policy = createVoiceRetryPolicy({
      jitterMs: 0,
      now: () => 0,
    });
    const decision = policy.decide(
      [{ at: 0, disposition: "voicemail-left" }],
      "voicemail-left",
    );
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.attemptNumber).toBe(2);
      expect(decision.retryAt).toBe(4 * 60 * 60 * 1000);
    }
  });

  test("applies exponential backoff to subsequent attempts", () => {
    const policy = createVoiceRetryPolicy({
      backoffMultiplier: 2,
      jitterMs: 0,
      now: () => 0,
    });
    const decision = policy.decide(
      [
        { at: 0, disposition: "no-answer" },
        { at: 1, disposition: "no-answer" },
      ],
      "no-answer",
    );
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.retryAt).toBe(30 * 60 * 1000 * 2);
    }
  });

  test("abandons immediately on do-not-call", () => {
    const policy = createVoiceRetryPolicy({ jitterMs: 0 });
    const decision = policy.decide([], "do-not-call");
    expect(decision.action).toBe("abandon");
    if (decision.action === "abandon") {
      expect(decision.reason).toBe("non-retryable");
    }
  });

  test("abandons on max attempts", () => {
    const policy = createVoiceRetryPolicy({
      jitterMs: 0,
      maxAttempts: 2,
    });
    const decision = policy.decide(
      [
        { at: 0, disposition: "voicemail-left" },
        { at: 1, disposition: "voicemail-left" },
      ],
      "voicemail-left",
    );
    expect(decision.action).toBe("abandon");
    if (decision.action === "abandon") {
      expect(decision.reason).toBe("max-attempts");
    }
  });

  test("escalates when escalateAfterAttempts is hit", () => {
    const policy = createVoiceRetryPolicy({
      escalateAfterAttempts: 3,
      jitterMs: 0,
    });
    const decision = policy.decide(
      [
        { at: 0, disposition: "no-answer" },
        { at: 1, disposition: "no-answer" },
        { at: 2, disposition: "no-answer" },
      ],
      "no-answer",
    );
    expect(decision.action).toBe("escalate");
  });

  test("updateRule overrides cooldown live", () => {
    const policy = createVoiceRetryPolicy({
      jitterMs: 0,
      now: () => 0,
    });
    policy.updateRule({
      action: "retry",
      cooldownMs: 60_000,
      disposition: "no-answer",
    });
    const decision = policy.decide(
      [{ at: 0, disposition: "no-answer" }],
      "no-answer",
    );
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.retryAt).toBe(60_000);
    }
  });

  test("custom maxAttemptsOverride is respected", () => {
    const policy = createVoiceRetryPolicy({
      jitterMs: 0,
      maxAttempts: 10,
      rules: [
        {
          action: "retry",
          cooldownMs: 1_000,
          disposition: "no-answer",
          maxAttemptsOverride: 1,
        },
      ],
      now: () => 0,
    });
    const decision = policy.decide(
      [{ at: 0, disposition: "no-answer" }],
      "no-answer",
    );
    expect(decision.action).toBe("abandon");
  });
});
