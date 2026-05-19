import { describe, expect, test } from "bun:test";
import type { VoicePathway } from "../src/pathway";
import {
  renderVoicePathwayMermaid,
  renderVoicePathwayText,
  visualizeVoicePathway,
} from "../src/pathwayVisualizer";

const sample: VoicePathway = {
  entryStateId: "greet",
  id: "support",
  label: "Support pathway",
  slots: [
    { id: "issue", prompt: "Issue?", required: true, type: "string" },
  ],
  states: [
    {
      id: "greet",
      kind: "entry",
      label: "Greet",
      transitions: [{ condition: { kind: "always" }, to: "collect" }],
    },
    {
      actions: [{ kind: "collect-slot", slotId: "issue" }],
      id: "collect",
      kind: "collect",
      label: "Collect",
      transitions: [
        { condition: { kind: "slot-filled", slotId: "issue" }, to: "done" },
      ],
    },
    { id: "done", kind: "terminal", label: "Done", transitions: [] },
  ],
};

describe("renderVoicePathwayMermaid", () => {
  test("emits flowchart TD with state nodes + transitions", () => {
    const text = renderVoicePathwayMermaid(sample);
    expect(text).toContain("flowchart TD");
    expect(text).toContain("greet");
    expect(text).toContain("collect");
    expect(text).toContain("issue ✓");
  });

  test("entry uses circle shape, terminal uses double-circle", () => {
    const text = renderVoicePathwayMermaid(sample);
    expect(text).toContain('greet(("greet: Greet")');
    expect(text).toContain('done(("done: Done"))');
  });
});

describe("renderVoicePathwayText", () => {
  test("renders entry state + transitions hierarchically", () => {
    const text = renderVoicePathwayText(sample);
    expect(text).toContain("Pathway: Support pathway (support)");
    expect(text).toContain("greet: Greet");
    expect(text).toContain("→ collect (always)");
    expect(text).toContain("issue (string, required)");
  });

  test("marks already-shown states to avoid cycles", () => {
    const cyclic: VoicePathway = {
      entryStateId: "a",
      id: "loop",
      label: "Loop",
      slots: [],
      states: [
        {
          id: "a",
          kind: "entry",
          label: "A",
          transitions: [{ condition: { kind: "always" }, to: "b" }],
        },
        {
          id: "b",
          kind: "terminal",
          label: "B",
          transitions: [{ condition: { kind: "always" }, to: "a" }],
        },
      ],
    };
    const text = renderVoicePathwayText(cyclic);
    expect(text).toContain("already shown");
  });
});

describe("visualizeVoicePathway", () => {
  test("combined output has both mermaid + text", () => {
    const viz = visualizeVoicePathway(sample);
    expect(viz.mermaid).toContain("flowchart TD");
    expect(viz.text).toContain("Pathway: Support pathway");
  });
});
