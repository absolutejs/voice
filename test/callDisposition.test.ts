import { describe, expect, test } from "bun:test";
import {
  createVoiceCallDispositionTagger,
  DEFAULT_VOICE_CALL_DISPOSITIONS,
} from "../src/callDisposition";

describe("createVoiceCallDispositionTagger", () => {
  test("default taxonomy ships with positive/neutral/negative/no-contact codes", () => {
    const outcomes = new Set(
      DEFAULT_VOICE_CALL_DISPOSITIONS.map((d) => d.outcome),
    );
    expect(outcomes).toEqual(
      new Set(["positive", "neutral", "negative", "no-contact"]),
    );
  });

  test("tag rejects unknown codes", () => {
    const tagger = createVoiceCallDispositionTagger();
    expect(() => tagger.tag("call_1", "nonsense")).toThrow(/Unknown/);
  });

  test("tag replaces by default", () => {
    const tagger = createVoiceCallDispositionTagger();
    tagger.tag("call_1", "voicemail-left");
    tagger.tag("call_1", "sale");
    const list = tagger.listForSession("call_1");
    expect(list).toHaveLength(1);
    expect(list[0]?.code).toBe("sale");
  });

  test("allowMultiple appends tags", () => {
    const tagger = createVoiceCallDispositionTagger({ allowMultiple: true });
    tagger.tag("call_1", "voicemail-left");
    tagger.tag("call_1", "callback-requested", "ring back at 3pm");
    const list = tagger.listForSession("call_1");
    expect(list).toHaveLength(2);
    expect(list[1]?.note).toBe("ring back at 3pm");
  });

  test("untag by code removes only that code", () => {
    const tagger = createVoiceCallDispositionTagger({ allowMultiple: true });
    tagger.tag("call_1", "voicemail-left");
    tagger.tag("call_1", "callback-requested");
    expect(tagger.untag("call_1", "voicemail-left")).toBe(1);
    expect(tagger.listForSession("call_1").map((t) => t.code)).toEqual([
      "callback-requested",
    ]);
  });

  test("summarize rolls up by outcome + retryable", () => {
    const tagger = createVoiceCallDispositionTagger();
    tagger.tag("call_1", "sale");
    tagger.tag("call_2", "voicemail-left");
    tagger.tag("call_3", "not-interested");
    tagger.tag("call_4", "no-answer");
    const summary = tagger.summarize();
    expect(summary.byOutcome.positive).toBe(1);
    expect(summary.byOutcome.negative).toBe(1);
    expect(summary.byOutcome["no-contact"]).toBe(2);
    expect(summary.retryablePct).toBeCloseTo(0.5, 2);
  });
});
