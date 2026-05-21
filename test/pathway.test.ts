import { describe, expect, test } from "bun:test";
import { validateVoicePathway, type VoicePathway } from "../src/core/pathway";

const goodPathway: VoicePathway = {
  entryStateId: "greet",
  id: "support",
  label: "Support pathway",
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
      label: "Ask issue",
      transitions: [
        { condition: { kind: "slot-filled", slotId: "issue" }, to: "done" },
      ],
    },
    {
      id: "done",
      kind: "terminal",
      label: "Done",
      transitions: [],
    },
  ],
};

describe("validateVoicePathway", () => {
  test("happy path returns valid with no errors", () => {
    const report = validateVoicePathway(goodPathway);
    expect(report.valid).toBe(true);
    expect(report.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  test("detects unknown entry state", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      entryStateId: "missing",
    });
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "unknown-entry")).toBe(true);
  });

  test("detects missing transition target", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        {
          id: "greet",
          kind: "entry",
          label: "Greet",
          transitions: [{ condition: { kind: "always" }, to: "ghost" }],
        },
        { id: "done", kind: "terminal", label: "Done", transitions: [] },
      ],
    });
    expect(
      report.issues.some((i) => i.code === "missing-transition-target"),
    ).toBe(true);
  });

  test("flags unreachable states as warnings", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        ...goodPathway.states,
        {
          id: "orphan",
          kind: "terminal",
          label: "Orphan",
          transitions: [],
        },
      ],
    });
    const issue = report.issues.find(
      (i) => i.code === "unreachable-state" && i.stateId === "orphan",
    );
    expect(issue?.severity).toBe("warning");
  });

  test("detects missing slot ref in actions", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        {
          actions: [{ kind: "collect-slot", slotId: "ghost-slot" }],
          id: "greet",
          kind: "entry",
          label: "Greet",
          transitions: [{ condition: { kind: "always" }, to: "done" }],
        },
        { id: "done", kind: "terminal", label: "Done", transitions: [] },
      ],
    });
    expect(report.issues.some((i) => i.code === "missing-slot-ref")).toBe(true);
  });

  test("requires fallback transitions to be last", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        {
          id: "greet",
          kind: "entry",
          label: "Greet",
          transitions: [
            { condition: { kind: "fallback" }, to: "done" },
            { condition: { kind: "always" }, to: "done" },
          ],
        },
        { id: "done", kind: "terminal", label: "Done", transitions: [] },
      ],
    });
    expect(report.issues.some((i) => i.code === "fallback-not-last")).toBe(
      true,
    );
  });

  test("requires a reachable terminal state", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        {
          id: "greet",
          kind: "entry",
          label: "Greet",
          transitions: [{ condition: { kind: "always" }, to: "greet" }],
        },
      ],
    });
    expect(report.issues.some((i) => i.code === "no-terminal-reachable")).toBe(
      true,
    );
  });

  test("detects duplicate state ids", () => {
    const report = validateVoicePathway({
      ...goodPathway,
      states: [
        ...goodPathway.states,
        {
          id: "greet",
          kind: "entry",
          label: "Greet again",
          transitions: [],
        },
      ],
    });
    expect(report.issues.some((i) => i.code === "duplicate-state")).toBe(true);
  });
});
