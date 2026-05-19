import { describe, expect, test } from "bun:test";
import { createVoiceAssistantExperiment } from "../src/assistantExperiment";

const stubVariant = (id: string, weight?: number) => ({
  assistant: { definition: { id }, id, toSessionOptions: () => ({}) } as never,
  id,
  weight,
});

describe("createVoiceAssistantExperiment", () => {
  test("sticky allocator returns the same variant for the same key", () => {
    const exp = createVoiceAssistantExperiment({
      experimentId: "prompt-v1",
      variants: [stubVariant("A"), stubVariant("B"), stubVariant("C")],
    });
    const first = exp.allocate({
      context: {},
      sessionId: "session-1",
      stickyKey: "user-42",
    });
    const second = exp.allocate({
      context: {},
      sessionId: "session-2",
      stickyKey: "user-42",
    });
    expect(first.variant.id).toBe(second.variant.id);
  });

  test("random allocator can pick different variants for the same key", () => {
    const exp = createVoiceAssistantExperiment({
      allocator: "random",
      experimentId: "prompt-v1",
      variants: [stubVariant("A"), stubVariant("B")],
    });
    const ids = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      ids.add(
        exp.allocate({ context: {}, sessionId: "s", stickyKey: "k" }).variant
          .id,
      );
    }
    expect(ids.size).toBe(2);
  });

  test("custom allocator routes by external rule", () => {
    const exp = createVoiceAssistantExperiment<{ tier: string }>({
      allocator: ({ context }) => (context.tier === "gold" ? "premium" : "basic"),
      experimentId: "tier-based",
      variants: [stubVariant("basic"), stubVariant("premium")],
    });
    expect(
      exp.allocate({
        context: { tier: "gold" },
        sessionId: "s",
      }).variant.id,
    ).toBe("premium");
    expect(
      exp.allocate({
        context: { tier: "free" },
        sessionId: "s",
      }).variant.id,
    ).toBe("basic");
  });

  test("weighted variants respect their share", () => {
    const counts = { A: 0, B: 0 };
    const exp = createVoiceAssistantExperiment({
      allocator: "random",
      experimentId: "weighted",
      variants: [stubVariant("A", 9), stubVariant("B", 1)],
    });
    for (let i = 0; i < 1_000; i += 1) {
      const id = exp.allocate({ context: {}, sessionId: "s" }).variant.id as
        | "A"
        | "B";
      counts[id] += 1;
    }
    expect(counts.A).toBeGreaterThan(counts.B * 5);
  });

  test("onAllocation callback fires with assigned variant", () => {
    const seen: string[] = [];
    const exp = createVoiceAssistantExperiment({
      experimentId: "evt",
      onAllocation: ({ variant }) => seen.push(variant.id),
      variants: [stubVariant("A")],
    });
    exp.allocate({ context: {}, sessionId: "s" });
    expect(seen).toEqual(["A"]);
  });

  test("throws when no variants are provided", () => {
    expect(() =>
      createVoiceAssistantExperiment({
        experimentId: "empty",
        variants: [],
      }),
    ).toThrow(/at least one variant/);
  });
});
