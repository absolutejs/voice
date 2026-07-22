import { describe, expect, test } from "bun:test";
import { calibrateVoiceConfidence } from "../src/testing";

describe("calibrateVoiceConfidence", () => {
  test("computes ECE and Brier score without discarding empty bins", () => {
    const report = calibrateVoiceConfidence([
      { confidence: 0.9, correct: true },
      { confidence: 0.8, correct: true },
      { confidence: 0.2, correct: false },
      { confidence: 0.1, correct: false },
    ], 2);

    expect(report.sampleCount).toBe(4);
    expect(report.brierScore).toBeCloseTo(0.025);
    expect(report.expectedCalibrationError).toBeCloseTo(0.15);
  });
});
