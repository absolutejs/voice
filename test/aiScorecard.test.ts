import { describe, expect, test } from "bun:test";
import { DEFAULT_VOICE_SALES_RUBRIC } from "../src/core/callScorecard";
import {
  createVoiceAIScorecard,
  parseVoiceAIScorecardResponse,
} from "../src/core/aiScorecard";

const allFiveResponse = JSON.stringify({
  comments: "great call",
  scores: DEFAULT_VOICE_SALES_RUBRIC.criteria.map((c) => ({
    criterionId: c.id,
    rationale: "perfect",
    score: 5,
  })),
});

describe("parseVoiceAIScorecardResponse", () => {
  test("parses raw JSON with scores + comments", () => {
    const parsed = parseVoiceAIScorecardResponse(
      allFiveResponse,
      DEFAULT_VOICE_SALES_RUBRIC,
    );
    expect(parsed.scores).toHaveLength(
      DEFAULT_VOICE_SALES_RUBRIC.criteria.length,
    );
    expect(parsed.comments).toBe("great call");
  });

  test("handles fenced markdown JSON", () => {
    const fenced = "```json\n" + allFiveResponse + "\n```";
    const parsed = parseVoiceAIScorecardResponse(
      fenced,
      DEFAULT_VOICE_SALES_RUBRIC,
    );
    expect(parsed.scores).toHaveLength(
      DEFAULT_VOICE_SALES_RUBRIC.criteria.length,
    );
  });

  test("drops unknown criteria silently", () => {
    const raw = JSON.stringify({
      scores: [
        { criterionId: "ghost", score: 5 },
        { criterionId: "greeting", score: 4 },
      ],
    });
    const parsed = parseVoiceAIScorecardResponse(
      raw,
      DEFAULT_VOICE_SALES_RUBRIC,
    );
    expect(parsed.scores).toEqual([{ criterionId: "greeting", score: 4 }]);
  });

  test("throws on empty response", () => {
    expect(() =>
      parseVoiceAIScorecardResponse("", DEFAULT_VOICE_SALES_RUBRIC),
    ).toThrow(/empty/);
  });

  test("throws on non-JSON response", () => {
    expect(() =>
      parseVoiceAIScorecardResponse("no json here", DEFAULT_VOICE_SALES_RUBRIC),
    ).toThrow(/not valid JSON/);
  });
});

describe("createVoiceAIScorecard", () => {
  test("scoreCall produces a passing scorecard from all-fives", async () => {
    const scorer = createVoiceAIScorecard({
      completion: async () => allFiveResponse,
    });
    const card = await scorer.scoreCall({
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      sessionId: "call_1",
      transcript: "agent did great",
    });
    expect(card.grade).toBe("pass");
    expect(card.reviewer).toBe("llm");
    expect(card.comments).toBe("great call");
  });

  test("defaults missing criteria to score 0 with synthetic rationale", async () => {
    const scorer = createVoiceAIScorecard({
      completion: async () =>
        JSON.stringify({
          scores: [{ criterionId: "greeting", score: 5 }],
        }),
    });
    const card = await scorer.scoreCall({
      rubric: DEFAULT_VOICE_SALES_RUBRIC,
      sessionId: "call_2",
      transcript: "agent forgot a lot",
    });
    const compliance = card.results.find(
      (r) => r.criterionId === "compliance-disclosure",
    );
    expect(compliance?.score).toBe(0);
    expect(compliance?.rationale).toContain("No rationale");
    expect(card.grade).toBe("fail");
  });
});
