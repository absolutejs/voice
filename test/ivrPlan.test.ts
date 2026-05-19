import { describe, expect, test } from "bun:test";
import {
  createVoiceIVRSession,
  describeVoiceIVRPlan,
  evaluateVoiceIVRPlan,
} from "../src/ivrPlan";
import type { VoiceIVRPlan } from "../src/ivrPlan";

const plan: VoiceIVRPlan = {
  branches: [
    {
      assistantId: "sales-assistant",
      id: "sales",
      label: "Sales",
      match: { digit: "1", speech: /sales|buy|purchase/iu },
    },
    {
      assistantId: "support-assistant",
      id: "support",
      label: "Support",
      match: { digit: "2", speech: "support" },
    },
    {
      id: "operator",
      label: "Speak to a human",
      match: { digit: "0" },
      target: "+14155550100",
    },
  ],
  fallbackBranchId: "operator",
  greeting: "Welcome. Press 1 for sales, 2 for support, 0 for an operator.",
  maxAttempts: 2,
};

describe("evaluateVoiceIVRPlan", () => {
  test("matches digit input to the right branch", () => {
    const decision = evaluateVoiceIVRPlan(plan, { digits: "1" });
    expect(decision.reason).toBe("matched");
    expect(decision.branch?.id).toBe("sales");
  });

  test("matches speech against a string substring", () => {
    const decision = evaluateVoiceIVRPlan(plan, {
      speech: "I need support please",
    });
    expect(decision.reason).toBe("matched");
    expect(decision.branch?.id).toBe("support");
  });

  test("matches speech against a regex", () => {
    const decision = evaluateVoiceIVRPlan(plan, { speech: "want to buy" });
    expect(decision.reason).toBe("matched");
    expect(decision.branch?.id).toBe("sales");
  });

  test("falls back to fallbackBranchId on no match", () => {
    const decision = evaluateVoiceIVRPlan(plan, { speech: "weather" });
    expect(decision.reason).toBe("fallback");
    expect(decision.branch?.id).toBe("operator");
  });

  test("returns no-match when fallback is missing and nothing matched", () => {
    const decision = evaluateVoiceIVRPlan(
      { ...plan, fallbackBranchId: undefined },
      { speech: "weather" },
    );
    expect(decision.reason).toBe("no-match");
    expect(decision.branch).toBeUndefined();
  });

  test("returns timeout when no input provided", () => {
    const decision = evaluateVoiceIVRPlan(plan, {});
    expect(decision.reason).toBe("timeout");
  });
});

describe("createVoiceIVRSession", () => {
  test("tracks attempts and exposes exhausted()", () => {
    const session = createVoiceIVRSession(plan);
    expect(session.exhausted()).toBe(false);
    session.decide({ speech: "weather" });
    session.decide({ speech: "weather" });
    expect(session.attempt()).toBe(2);
    expect(session.exhausted()).toBe(true);
  });

  test("reset() clears the counter", () => {
    const session = createVoiceIVRSession({ ...plan, maxAttempts: 1 });
    session.decide({ speech: "weather" });
    expect(session.exhausted()).toBe(true);
    session.reset();
    expect(session.exhausted()).toBe(false);
  });
});

describe("describeVoiceIVRPlan", () => {
  test("includes greeting and per-branch triggers", () => {
    const description = describeVoiceIVRPlan(plan);
    expect(description).toContain("Welcome");
    expect(description).toContain("Sales");
    expect(description).toContain("press 1");
    expect(description).toContain("Support");
    expect(description).toContain("press 2");
  });
});
