import { describe, expect, test } from "bun:test";
import { createLiveAgentConsole } from "../src/client/liveAgentConsole";
import type { VoiceCallerMemorySnapshot } from "../src/callerMemory";

const snapshot: VoiceCallerMemorySnapshot = {
  facts: { plan: "Pro" },
  identity: { externalId: "user-42" },
  lastSessionAt: Date.now(),
  openActions: ["follow up tuesday"],
  summary: "Repeat customer, wants refund.",
};

describe("createLiveAgentConsole", () => {
  test("starts without takeover and surfaces transcripts as they land", () => {
    const console = createLiveAgentConsole({ sessionId: "s1" });
    const initial = console.getState();
    expect(initial.hasTakeover).toBe(false);
    console.noteTranscript("I need help", 100);
    const after = console.getState();
    expect(after.recentTimeline.some((e) => e.detail === "I need help")).toBe(
      true,
    );
  });

  test("takeover() flips the flag and stamps takeoverAt", () => {
    const console = createLiveAgentConsole({ sessionId: "s2" });
    console.takeover("agent escalated");
    const state = console.getState();
    expect(state.hasTakeover).toBe(true);
    expect(state.takeoverReason).toBe("agent escalated");
    expect(state.takeoverAt).toBeGreaterThan(0);
  });

  test("releaseTakeover clears the takeover state", () => {
    const console = createLiveAgentConsole({ sessionId: "s3" });
    console.takeover("escalated");
    console.releaseTakeover();
    const state = console.getState();
    expect(state.hasTakeover).toBe(false);
    expect(state.takeoverReason).toBeUndefined();
  });

  test("setCaller surfaces the caller memory snapshot to consumers", () => {
    const console = createLiveAgentConsole({ sessionId: "s4" });
    console.setCaller(snapshot);
    expect(console.getState().caller?.summary).toContain("Repeat customer");
  });

  test("resolveCaller hook is awaited and populated asynchronously", async () => {
    const console = createLiveAgentConsole({
      resolveCaller: async () => snapshot,
      sessionId: "s5",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(console.getState().caller?.identity.externalId).toBe("user-42");
  });

  test("recentTimeline is capped at recentLimit", () => {
    const console = createLiveAgentConsole({
      recentLimit: 3,
      sessionId: "s6",
    });
    for (let i = 0; i < 8; i += 1) console.noteTranscript(`t${i}`, i);
    expect(console.getState().recentTimeline).toHaveLength(3);
  });

  test("subscribers fire on every console state change", () => {
    const console = createLiveAgentConsole({ sessionId: "s7" });
    let fires = 0;
    console.subscribe(() => {
      fires += 1;
    });
    console.notePartial("hi");
    console.takeover("escalated");
    console.releaseTakeover();
    expect(fires).toBeGreaterThanOrEqual(3);
  });
});
