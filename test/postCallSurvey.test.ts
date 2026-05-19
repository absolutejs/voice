import { describe, expect, test } from "bun:test";
import {
  createVoicePostCallSurvey,
  summarizeVoicePostCallSurveys,
} from "../src/postCallSurvey";

describe("createVoicePostCallSurvey", () => {
  test("walks the default question set and buckets NPS", () => {
    const survey = createVoicePostCallSurvey({ sessionId: "call_42" });
    expect(survey.next()?.id).toBe("nps");
    survey.record("nps", 10);
    expect(survey.next()?.id).toBe("resolved");
    survey.record("resolved", true);
    survey.record("comment", "thanks");
    const response = survey.complete();
    expect(response.npsBucket).toBe("promoter");
    expect(response.completedAt).not.toBeNull();
    expect(response.answers).toHaveLength(3);
  });

  test("rejects ratings outside the configured range", () => {
    const survey = createVoicePostCallSurvey({ sessionId: "call_43" });
    expect(() => survey.record("nps", 11)).toThrow();
    expect(() => survey.record("nps", -1)).toThrow();
  });

  test("refuses to skip required questions", () => {
    const survey = createVoicePostCallSurvey({ sessionId: "call_44" });
    expect(() => survey.skip()).toThrow(/required/);
  });

  test("allows skipping optional questions", () => {
    const survey = createVoicePostCallSurvey({ sessionId: "call_45" });
    survey.record("nps", 7);
    survey.record("resolved", false);
    const skipped = survey.skip();
    expect(skipped?.id).toBe("comment");
    const response = survey.complete();
    expect(response.npsBucket).toBe("passive");
  });

  test("complete() fails until required questions answered", () => {
    const survey = createVoicePostCallSurvey({ sessionId: "call_46" });
    survey.record("nps", 5);
    expect(() => survey.complete()).toThrow(/required/);
  });
});

describe("summarizeVoicePostCallSurveys", () => {
  test("computes NPS across a batch of completed surveys", () => {
    const make = (rating: number) => {
      const survey = createVoicePostCallSurvey({ sessionId: `c_${rating}` });
      survey.record("nps", rating);
      survey.record("resolved", true);
      return survey.complete();
    };
    const summary = summarizeVoicePostCallSurveys([
      make(10),
      make(9),
      make(7),
      make(3),
    ]);
    expect(summary.promoters).toBe(2);
    expect(summary.detractors).toBe(1);
    expect(summary.nps).toBeCloseTo(25, 4);
  });

  test("returns null NPS for an empty batch", () => {
    const summary = summarizeVoicePostCallSurveys([]);
    expect(summary.nps).toBeNull();
    expect(summary.completion).toBe(0);
  });
});
