import { describe, expect, test } from "bun:test";
import {
  generateVoicePathwayFromPrompt,
  validateVoicePathway,
} from "../src";

const validPathwayJson = JSON.stringify({
  entryStateId: "greet",
  id: "support",
  label: "Support",
  slots: [
    { id: "issue", prompt: "What's the issue?", required: true, type: "string" },
  ],
  states: [
    {
      actions: [{ kind: "say", text: "Hi!" }],
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
    {
      actions: [{ kind: "end-call", reason: "resolved" }],
      id: "done",
      kind: "terminal",
      label: "Done",
      transitions: [],
    },
  ],
});

describe("generateVoicePathwayFromPrompt", () => {
  test("parses model JSON into a valid pathway in one attempt", async () => {
    const result = await generateVoicePathwayFromPrompt({
      completion: async () => validPathwayJson,
      description: "A support agent that collects the caller's issue",
    });
    expect(result.attempts).toBe(1);
    expect(result.report.valid).toBe(true);
    expect(result.pathway.entryStateId).toBe("greet");
    expect(validateVoicePathway(result.pathway).valid).toBe(true);
  });

  test("strips markdown fences around the JSON", async () => {
    const result = await generateVoicePathwayFromPrompt({
      completion: async () => "```json\n" + validPathwayJson + "\n```",
      description: "support",
    });
    expect(result.report.valid).toBe(true);
  });

  test("passes a suggested id and slugifies the description fallback", async () => {
    let seenPrompt = "";
    await generateVoicePathwayFromPrompt({
      completion: async ({ prompt }) => {
        seenPrompt = prompt;
        return validPathwayJson;
      },
      description: "Book a Dental Cleaning!!!",
    });
    expect(seenPrompt).toContain("book-a-dental-cleaning");
  });

  test("retries with the validation errors fed back, then succeeds", async () => {
    const broken = JSON.stringify({
      entryStateId: "ghost", // unknown entry → invalid
      id: "x",
      label: "X",
      slots: [],
      states: [
        { id: "a", kind: "terminal", label: "A", transitions: [] },
      ],
    });
    const prompts: string[] = [];
    let call = 0;
    const result = await generateVoicePathwayFromPrompt({
      completion: async ({ prompt }) => {
        prompts.push(prompt);
        call += 1;
        return call === 1 ? broken : validPathwayJson;
      },
      description: "support",
    });
    expect(result.attempts).toBe(2);
    expect(result.report.valid).toBe(true);
    // Second prompt should include the validation error feedback.
    expect(prompts[1]).toContain("failed validation");
    expect(prompts[1]).toMatch(/entry/i);
  });

  test("returns the invalid pathway + report when repairs are exhausted", async () => {
    const broken = JSON.stringify({
      entryStateId: "ghost",
      id: "x",
      label: "X",
      slots: [],
      states: [{ id: "a", kind: "terminal", label: "A", transitions: [] }],
    });
    const result = await generateVoicePathwayFromPrompt({
      completion: async () => broken,
      description: "support",
      maxRepairAttempts: 1,
    });
    expect(result.attempts).toBe(2); // initial + 1 repair
    expect(result.report.valid).toBe(false);
    expect(result.rawOutputs).toHaveLength(2);
  });

  test("throws on non-JSON model output", async () => {
    await expect(
      generateVoicePathwayFromPrompt({
        completion: async () => "I cannot help with that.",
        description: "support",
      }),
    ).rejects.toThrow(/not valid JSON/);
  });
});
