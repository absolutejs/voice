import { describe, expect, test } from "bun:test";
import {
  compareVoiceCostScenarios,
  predictVoiceCallCost,
  type VoiceCostProfile,
} from "../src/core/costPredictor";

const baseProfile: VoiceCostProfile = {
  inboundPerDay: 50,
  inputTokensPerTurn: 200,
  llmModel: "gpt-4o-mini",
  llmProvider: "openai",
  minutesPerCall: 4,
  outputTokensPerTurn: 60,
  sttModel: "nova-3",
  sttProvider: "deepgram",
  telephonyProvider: "twilio",
  ttsCharsPerTurn: 240,
  ttsModel: "sonic-2",
  ttsProvider: "cartesia",
  turnsPerCall: 8,
};

describe("predictVoiceCallCost", () => {
  test("rolls per-call cost up to monthly across inbound + outbound", () => {
    const prediction = predictVoiceCallCost({
      profile: { ...baseProfile, outboundPerDay: 50 },
    });
    expect(prediction.callsPerDay).toBe(100);
    expect(prediction.perCall.totalUsd).toBeGreaterThan(0);
    expect(prediction.monthly.totalUsd).toBeCloseTo(
      prediction.perCall.totalUsd * 100 * 30,
      4,
    );
  });

  test("prices LLM by input + output tokens against the default price book", () => {
    const prediction = predictVoiceCallCost({ profile: baseProfile });
    const expectedInputUsd = (200 * 8 * 0.15) / 1_000_000;
    const expectedOutputUsd = (60 * 8 * 0.6) / 1_000_000;
    expect(prediction.perCall.llmUsd).toBeCloseTo(
      expectedInputUsd + expectedOutputUsd,
      6,
    );
  });

  test("prices TTS by characters", () => {
    const prediction = predictVoiceCallCost({ profile: baseProfile });
    const expected = (240 * 8 * 65) / 1_000_000;
    expect(prediction.perCall.ttsUsd).toBeCloseTo(expected, 6);
  });

  test("prices STT by seconds", () => {
    const prediction = predictVoiceCallCost({ profile: baseProfile });
    const expected = 4 * 60 * 0.000_077;
    expect(prediction.perCall.sttUsd).toBeCloseTo(expected, 6);
  });

  test("prices telephony by minutes", () => {
    const prediction = predictVoiceCallCost({ profile: baseProfile });
    expect(prediction.perCall.telephonyUsd).toBeCloseTo(4 * 0.014, 6);
  });

  test("ignores modalities with unknown providers", () => {
    const prediction = predictVoiceCallCost({
      profile: {
        ...baseProfile,
        llmModel: "made-up",
        llmProvider: "unknown",
      },
    });
    expect(prediction.perCall.llmUsd).toBe(0);
  });
});

describe("compareVoiceCostScenarios", () => {
  test("computes deltas vs the baseline scenario", () => {
    const result = compareVoiceCostScenarios({
      baselineId: "control",
      scenarios: [
        { id: "control", profile: baseProfile },
        {
          id: "premium-llm",
          profile: {
            ...baseProfile,
            llmModel: "claude-sonnet-4-5",
            llmProvider: "anthropic",
          },
        },
      ],
    });
    const premium = result.scenarios.find(
      (s) => s.scenarioId === "premium-llm",
    );
    expect(premium?.delta.perCallUsd).toBeGreaterThan(0);
    expect(premium?.delta.monthlyUsd).toBeCloseTo(
      premium!.delta.perCallUsd * 50 * 30,
      4,
    );
  });

  test("throws when baseline is missing from the scenarios list", () => {
    expect(() =>
      compareVoiceCostScenarios({
        baselineId: "missing",
        scenarios: [{ id: "a", profile: baseProfile }],
      }),
    ).toThrow(/not found/);
  });
});
