import { describe, expect, test } from "bun:test";
import { createVoiceLiveCoach } from "../src/core/liveCoach";

describe("createVoiceLiveCoach", () => {
  test("push enqueues a nudge that shows up in pending", () => {
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => 1_000,
      sessionId: "call_1",
    });
    coach.push({
      kind: "hint",
      supervisorId: "sup_1",
      text: "Ask about budget",
    });
    expect(coach.pending()).toHaveLength(1);
    expect(coach.pending()[0]?.id).toBe("n1");
  });

  test("consumeForInjection drains pending and marks injected", () => {
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => 1_000,
      sessionId: "call_1",
    });
    coach.push({
      kind: "hint",
      supervisorId: "sup_1",
      text: "Ask about budget",
    });
    const messages = coach.consumeForInjection();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("Ask about budget");
    expect(coach.pending()).toEqual([]);
  });

  test("acknowledge prevents injection", () => {
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => 1_000,
      sessionId: "call_1",
    });
    const nudge = coach.push({
      kind: "warning",
      supervisorId: "sup_1",
      text: "Slow down",
    });
    coach.acknowledge(nudge.id);
    expect(coach.consumeForInjection()).toEqual([]);
  });

  test("expired nudges drop out of pending", () => {
    let t = 1_000;
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => t,
      sessionId: "call_1",
    });
    coach.push({
      expiresAt: 2_000,
      kind: "hint",
      supervisorId: "sup_1",
      text: "x",
    });
    expect(coach.pending()).toHaveLength(1);
    t = 3_000;
    expect(coach.pending()).toEqual([]);
  });

  test("custom template for kind is applied", () => {
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => 1_000,
      sessionId: "call_1",
      templateForKind: {
        hint: "[COACH]: {{text}}",
      },
    });
    coach.push({ kind: "hint", supervisorId: "sup_1", text: "go for it" });
    const messages = coach.consumeForInjection();
    expect(messages[0]?.content).toBe("[COACH]: go for it");
  });

  test("subscribe receives push events", () => {
    const coach = createVoiceLiveCoach({
      generateId: () => "n1",
      now: () => 1_000,
      sessionId: "call_1",
    });
    const seen: string[] = [];
    coach.subscribe((n) => seen.push(n.id));
    coach.push({ kind: "hint", supervisorId: "sup_1", text: "x" });
    expect(seen).toEqual(["n1"]);
  });
});
