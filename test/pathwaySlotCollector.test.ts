import { describe, expect, test } from "bun:test";
import type { VoicePathwaySlot } from "../src/pathway";
import { createVoicePathwaySlotCollector } from "../src/pathwaySlotCollector";

const slot = (
  type: VoicePathwaySlot["type"],
  overrides: Partial<VoicePathwaySlot> = {},
): VoicePathwaySlot => ({
  id: "s",
  prompt: "?",
  type,
  ...overrides,
});

describe("createVoicePathwaySlotCollector", () => {
  test("string parser respects min/max length", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(
      slot("string", { validation: { maxLength: 5, minLength: 2 } }),
      "x",
    );
    expect(result.result.ok).toBe(false);
  });

  test("number parser handles digit words", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(slot("number"), "seven");
    expect(result.result.ok).toBe(true);
    if (result.result.ok) expect(result.result.value).toBe(7);
  });

  test("boolean parser accepts colloquial yes/no", () => {
    const collector = createVoicePathwaySlotCollector();
    const yes = collector.interpret(slot("boolean"), "yeah");
    const no = collector.interpret(slot("boolean"), "nope");
    expect(yes.result.ok).toBe(true);
    expect(no.result.ok).toBe(true);
  });

  test("time parser handles am/pm", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(slot("time"), "3pm");
    if (result.result.ok) expect(result.result.normalized).toBe("15:00");
  });

  test("phone parser normalizes US numbers", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(slot("phone"), "(415) 555-0100");
    if (result.result.ok) expect(result.result.value).toBe("+14155550100");
  });

  test("email parser collapses 'at' + 'dot' speech artifacts", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(
      slot("email"),
      "alex at example dot com",
    );
    expect(result.result.ok).toBe(true);
    if (result.result.ok) expect(result.result.value).toBe("alex@example.com");
  });

  test("currency parser strips $ and trailing 'dollars'", () => {
    const collector = createVoicePathwaySlotCollector();
    const result = collector.interpret(slot("currency"), "$1,250 dollars");
    if (result.result.ok) expect(result.result.value).toBe(1250);
  });

  test("choice parser requires match", () => {
    const collector = createVoicePathwaySlotCollector();
    const ok = collector.interpret(
      slot("choice", { choices: ["red", "blue"] }),
      "red",
    );
    const bad = collector.interpret(
      slot("choice", { choices: ["red", "blue"] }),
      "purple",
    );
    expect(ok.result.ok).toBe(true);
    expect(bad.result.ok).toBe(false);
  });

  test("attemptsExceeded after max attempts", () => {
    const collector = createVoicePathwaySlotCollector({
      maxAttemptsPerSlot: 2,
    });
    collector.interpret(slot("number"), "nope");
    collector.interpret(slot("number"), "still no");
    expect(collector.attemptsExceeded("s")).toBe(true);
  });

  test("reset clears attempt counter", () => {
    const collector = createVoicePathwaySlotCollector({
      maxAttemptsPerSlot: 2,
    });
    collector.interpret(slot("number"), "nope");
    collector.reset();
    expect(collector.attemptsExceeded("s")).toBe(false);
  });
});
