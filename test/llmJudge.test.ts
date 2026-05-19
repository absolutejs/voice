import { describe, expect, test } from "bun:test";
import {
  createVoiceLLMJudge,
  type VoiceLLMJudgeCompletion,
  type VoiceLLMJudgeRubric,
} from "../src/llmJudge";

const rubric: VoiceLLMJudgeRubric = {
  criteria: [
    {
      description: "Agent verifies the caller's identity before discussing account details.",
      id: "identity-verified",
      required: true,
    },
    {
      description: "Agent offers the requested refund disposition.",
      id: "refund-offered",
      weight: 2,
    },
    {
      description: "Agent thanks the caller at end of call.",
      id: "polite-close",
    },
  ],
};

const fakeCompletion = (response: string): VoiceLLMJudgeCompletion =>
  async () => response;

describe("createVoiceLLMJudge", () => {
  test("returns pass=true when all required + min-score criteria pass", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion(
        JSON.stringify({
          criteria: [
            {
              criterionId: "identity-verified",
              passed: true,
              rationale: "Asked for DOB.",
            },
            {
              criterionId: "refund-offered",
              passed: true,
              rationale: "Issued $50 credit.",
            },
            {
              criterionId: "polite-close",
              passed: true,
              rationale: "Said thanks.",
            },
          ],
          summary: "Clean call.",
        }),
      ),
      rubric,
    });
    const verdict = await judge.evaluate({ transcript: "..." });
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(1);
    expect(verdict.summary).toBe("Clean call.");
    expect(verdict.criteria).toHaveLength(3);
  });

  test("fails when a required criterion does not pass", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion(
        JSON.stringify({
          criteria: [
            {
              criterionId: "identity-verified",
              passed: false,
              rationale: "Skipped DOB.",
            },
            {
              criterionId: "refund-offered",
              passed: true,
              rationale: "ok",
            },
            {
              criterionId: "polite-close",
              passed: true,
              rationale: "ok",
            },
          ],
        }),
      ),
      rubric,
    });
    const verdict = await judge.evaluate({ transcript: "..." });
    expect(verdict.passed).toBe(false);
  });

  test("respects weight when computing score", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion(
        JSON.stringify({
          criteria: [
            {
              criterionId: "identity-verified",
              passed: true,
              rationale: "ok",
            },
            {
              criterionId: "refund-offered",
              passed: false,
              rationale: "denied",
            },
            {
              criterionId: "polite-close",
              passed: true,
              rationale: "ok",
            },
          ],
        }),
      ),
      rubric: { ...rubric, minPassScore: 0.4 },
    });
    const verdict = await judge.evaluate({ transcript: "..." });
    // weights: 1 + 2 + 1 = 4. Passed: identity (1) + polite (1) = 2. Score = 2/4 = 0.5
    expect(verdict.score).toBe(0.5);
    expect(verdict.passed).toBe(true);
  });

  test("extracts JSON wrapped in markdown fences", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion(
        "```json\n" +
          JSON.stringify({
            criteria: [
              {
                criterionId: "identity-verified",
                passed: true,
                rationale: "ok",
              },
              {
                criterionId: "refund-offered",
                passed: true,
                rationale: "ok",
              },
              {
                criterionId: "polite-close",
                passed: true,
                rationale: "ok",
              },
            ],
          }) +
          "\n```",
      ),
      rubric,
    });
    const verdict = await judge.evaluate({ transcript: "..." });
    expect(verdict.passed).toBe(true);
  });

  test("fills in a default verdict when the judge skips a criterion", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion(
        JSON.stringify({
          criteria: [
            {
              criterionId: "identity-verified",
              passed: true,
              rationale: "ok",
            },
          ],
        }),
      ),
      rubric,
    });
    const verdict = await judge.evaluate({ transcript: "..." });
    expect(verdict.criteria.find((c) => c.criterionId === "refund-offered")?.passed).toBe(
      false,
    );
    expect(verdict.passed).toBe(false);
  });

  test("throws on invalid JSON", async () => {
    const judge = createVoiceLLMJudge({
      completion: fakeCompletion("not json"),
      rubric,
    });
    await expect(judge.evaluate({ transcript: "..." })).rejects.toThrow();
  });
});
