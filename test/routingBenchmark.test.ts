import { describe, expect, test } from "bun:test";
import { evaluateVoiceSTTRouting } from "../src/testing";

describe("evaluateVoiceSTTRouting", () => {
  test("separates useful fallbacks from harmful fallbacks", () => {
    const report = evaluateVoiceSTTRouting([
      { id: "a", primaryScore: 0.5, fallbackScore: 0.9, fallbackUsed: true },
      { id: "b", primaryScore: 0.9, fallbackScore: 0.7, fallbackUsed: true },
      { id: "c", primaryScore: 0.8, fallbackScore: 0.6, fallbackUsed: false },
    ]);

    expect(report.fallbackAttemptRate).toBeCloseTo(2 / 3);
    expect(report.fallbackImprovementRate).toBe(0.5);
    expect(report.fallbackHarmRate).toBe(0.5);
    expect(report.oracleScore).toBeCloseTo((0.9 + 0.9 + 0.8) / 3);
  });
});
