import { describe, expect, test } from "bun:test";
import { createVoiceTranscriptAnnotator } from "../src/transcriptAnnotator";

describe("createVoiceTranscriptAnnotator", () => {
  test("add defaults severity from kind", () => {
    const annotator = createVoiceTranscriptAnnotator({
      generateId: () => "a1",
      now: () => 1_000,
      sessionId: "call_1",
    });
    const ann = annotator.add({
      kind: "compliance-concern",
      rangeStartMs: 4_000,
      supervisorId: "sup_1",
    });
    expect(ann.severity).toBe("major");
  });

  test("custom kind requires customLabel", () => {
    const annotator = createVoiceTranscriptAnnotator({
      sessionId: "call_1",
    });
    expect(() =>
      annotator.add({
        kind: "custom",
        rangeStartMs: 0,
        supervisorId: "sup_1",
      }),
    ).toThrow(/customLabel/);
  });

  test("list filters by kind + severity + range", () => {
    const annotator = createVoiceTranscriptAnnotator({
      sessionId: "call_1",
    });
    annotator.add({
      kind: "great-recovery",
      rangeStartMs: 1_000,
      supervisorId: "sup_1",
    });
    annotator.add({
      kind: "compliance-concern",
      rangeStartMs: 5_000,
      supervisorId: "sup_2",
    });
    annotator.add({
      kind: "missed-objection",
      rangeStartMs: 8_000,
      supervisorId: "sup_1",
    });
    expect(annotator.list({ severity: "major" })).toHaveLength(1);
    expect(annotator.list({ supervisorId: "sup_1" })).toHaveLength(2);
    expect(annotator.list({ fromMs: 4_000, toMs: 9_000 })).toHaveLength(2);
  });

  test("summarize rolls up by kind + severity", () => {
    const annotator = createVoiceTranscriptAnnotator({
      sessionId: "call_1",
    });
    annotator.add({
      kind: "great-recovery",
      rangeStartMs: 0,
      supervisorId: "sup_1",
    });
    annotator.add({
      kind: "compliance-concern",
      rangeStartMs: 1,
      supervisorId: "sup_1",
    });
    annotator.add({
      kind: "missed-objection",
      rangeStartMs: 2,
      supervisorId: "sup_1",
    });
    const summary = annotator.summarize();
    expect(summary.total).toBe(3);
    expect(summary.bySeverity.major).toBe(1);
    expect(summary.bySeverity.info).toBe(1);
    expect(summary.bySeverity.minor).toBe(1);
  });

  test("remove deletes by id", () => {
    const annotator = createVoiceTranscriptAnnotator({
      generateId: () => "a1",
      sessionId: "call_1",
    });
    annotator.add({
      kind: "great-recovery",
      rangeStartMs: 0,
      supervisorId: "sup_1",
    });
    expect(annotator.remove("a1")).toBe(true);
    expect(annotator.list()).toHaveLength(0);
  });
});
