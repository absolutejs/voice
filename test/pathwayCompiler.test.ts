import { describe, expect, test } from "bun:test";
import type { VoicePathway } from "../src/pathway";
import { compileVoicePathwayToAssistant } from "../src/pathwayCompiler";

const sample: VoicePathway = {
  entryStateId: "greet",
  id: "support",
  label: "Support pathway",
  slots: [
    {
      description: "The reason for the call",
      id: "issue",
      prompt: "What is the issue?",
      required: true,
      type: "string",
    },
  ],
  states: [
    {
      actions: [{ kind: "say", text: "Hello, this is support." }],
      id: "greet",
      kind: "entry",
      label: "Greet",
      transitions: [{ condition: { kind: "always" }, to: "collect" }],
    },
    {
      actions: [{ kind: "collect-slot", slotId: "issue" }],
      id: "collect",
      kind: "collect",
      label: "Collect issue",
      transitions: [
        { condition: { kind: "slot-filled", slotId: "issue" }, to: "done" },
      ],
    },
    { id: "done", kind: "terminal", label: "Done", transitions: [] },
  ],
};

describe("compileVoicePathwayToAssistant", () => {
  test("produces a system prompt + tools + metadata", () => {
    const compiled = compileVoicePathwayToAssistant({ pathway: sample });
    expect(compiled.metadata.pathwayId).toBe("support");
    expect(compiled.tools.length).toBeGreaterThanOrEqual(3);
    expect(compiled.systemPrompt).toContain("Support pathway");
    expect(compiled.systemPrompt).toContain("issue");
  });

  test("advance tool enum matches state ids", () => {
    const compiled = compileVoicePathwayToAssistant({ pathway: sample });
    const advance = compiled.tools.find((t) =>
      t.name.endsWith("_advance"),
    );
    expect(advance?.parameters.properties.toStateId?.enum).toEqual([
      "greet",
      "collect",
      "done",
    ]);
  });

  test("fill-slot tool enum matches slot ids", () => {
    const compiled = compileVoicePathwayToAssistant({ pathway: sample });
    const fill = compiled.tools.find((t) => t.name.endsWith("_fill_slot"));
    expect(fill?.parameters.properties.slotId?.enum).toEqual(["issue"]);
  });

  test("fallback behavior end-call wires into system prompt", () => {
    const compiled = compileVoicePathwayToAssistant({
      fallbackBehavior: "end-call",
      pathway: sample,
    });
    expect(compiled.systemPrompt).toContain("end the call politely");
  });

  test("custom tool prefix is applied", () => {
    const compiled = compileVoicePathwayToAssistant({
      pathway: sample,
      toolNamePrefix: "custom",
    });
    expect(compiled.tools.every((t) => t.name.startsWith("custom_"))).toBe(true);
  });

  test("rejects invalid pathway", () => {
    expect(() =>
      compileVoicePathwayToAssistant({
        pathway: {
          ...sample,
          entryStateId: "missing",
        },
      }),
    ).toThrow(/invalid pathway/i);
  });

  test("pathway-level tools are surfaced", () => {
    const compiled = compileVoicePathwayToAssistant({
      pathway: {
        ...sample,
        tools: [
          {
            description: "Create a ticket in the CRM",
            id: "create_ticket",
          },
        ],
      },
    });
    expect(
      compiled.tools.some((t) => t.name.endsWith("_tool_create_ticket")),
    ).toBe(true);
  });
});
