import { describe, expect, test } from "bun:test";
import type { VoicePathway } from "../src/core/pathway";
import {
  createVoicePathwayRuntime,
  type VoicePathwayRuntimeEvent,
} from "../src/core/pathwayRuntime";

const simple: VoicePathway = {
  entryStateId: "greet",
  id: "support",
  label: "Support",
  slots: [
    {
      id: "issue",
      prompt: "What is the issue?",
      required: true,
      type: "string",
    },
  ],
  states: [
    {
      actions: [{ kind: "say", text: "Hi!" }],
      id: "greet",
      kind: "entry",
      label: "Greet",
      transitions: [{ condition: { kind: "always" }, to: "ask" }],
    },
    {
      actions: [{ kind: "collect-slot", slotId: "issue" }],
      id: "ask",
      kind: "collect",
      label: "Ask",
      transitions: [
        { condition: { kind: "slot-filled", slotId: "issue" }, to: "done" },
      ],
    },
    {
      actions: [{ kind: "end-call", reason: "resolved" }],
      id: "done",
      kind: "terminal",
      label: "Done",
      transitions: [],
    },
  ],
};

describe("createVoicePathwayRuntime", () => {
  test("start emits state-entered + say + ask-slot", () => {
    const runtime = createVoicePathwayRuntime({ pathway: simple });
    const events: VoicePathwayRuntimeEvent[] = [];
    runtime.subscribe((e) => events.push(e));
    runtime.start();
    expect(events.map((e) => e.type)).toEqual([
      "state-entered",
      "say",
      "state-entered",
      "ask-slot",
    ]);
  });

  test("fillSlot advances to terminal", () => {
    const runtime = createVoicePathwayRuntime({ pathway: simple });
    runtime.start();
    runtime.fillSlot("issue", "billing");
    const finalState = runtime.getState();
    expect(finalState.currentStateId).toBe("done");
    expect(finalState.status).toBe("ended");
  });

  test("initialSlots skip the collect-slot prompt", () => {
    const runtime = createVoicePathwayRuntime({
      initialSlots: { issue: "billing" },
      pathway: simple,
    });
    const events: VoicePathwayRuntimeEvent[] = [];
    runtime.subscribe((e) => events.push(e));
    runtime.start();
    expect(events.some((e) => e.type === "ask-slot")).toBe(false);
    expect(runtime.getState().status).toBe("ended");
  });

  test("branching transitions pick first matching condition", () => {
    const branching: VoicePathway = {
      entryStateId: "router",
      id: "router-flow",
      label: "Router",
      slots: [
        {
          id: "intent",
          prompt: "Intent?",
          required: true,
          type: "string",
        },
      ],
      states: [
        {
          actions: [{ kind: "collect-slot", slotId: "intent" }],
          id: "router",
          kind: "branch",
          label: "Router",
          transitions: [
            {
              condition: {
                kind: "slot-equals",
                slotId: "intent",
                value: "sales",
              },
              to: "sales-terminal",
            },
            {
              condition: { kind: "fallback" },
              to: "support-terminal",
            },
          ],
        },
        {
          id: "sales-terminal",
          kind: "terminal",
          label: "Sales",
          transitions: [],
        },
        {
          id: "support-terminal",
          kind: "terminal",
          label: "Support",
          transitions: [],
        },
      ],
    };
    const runtime = createVoicePathwayRuntime({ pathway: branching });
    runtime.start();
    runtime.fillSlot("intent", "sales");
    expect(runtime.getState().currentStateId).toBe("sales-terminal");
  });

  test("end-call ends the runtime", () => {
    const runtime = createVoicePathwayRuntime({
      initialSlots: { issue: "x" },
      pathway: simple,
    });
    runtime.start();
    expect(runtime.getState().endedReason).toBe("resolved");
  });

  test("rejects invalid pathway at creation", () => {
    expect(() =>
      createVoicePathwayRuntime({
        pathway: {
          entryStateId: "ghost",
          id: "bad",
          label: "Bad",
          slots: [],
          states: [{ id: "x", kind: "terminal", label: "X", transitions: [] }],
        },
      }),
    ).toThrow(/Invalid pathway/);
  });
});
