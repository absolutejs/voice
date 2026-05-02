import { expect, test } from "bun:test";
import { runVoiceResilienceBenchmark } from "../src/testing";

test("runVoiceResilienceBenchmark includes duplicate end-of-turn protection", async () => {
  const report = await runVoiceResilienceBenchmark();

  expect(report.scenarios).toHaveLength(6);
  const duplicateEndOfTurnScenario = report.scenarios.find(
    (scenario) => scenario.id === "duplicate-end-of-turn",
  );
  expect(duplicateEndOfTurnScenario).toBeDefined();
  expect(duplicateEndOfTurnScenario?.passes).toBe(true);
  expect(duplicateEndOfTurnScenario?.actualTurns).toEqual([
    "Repeated end-of-turn should only commit once",
  ]);
  expect(duplicateEndOfTurnScenario?.replayedTurns).toBe(0);

  const jitterScenario = report.scenarios.find(
    (scenario) => scenario.id === "duplicate-end-of-turn-jitter",
  );
  expect(jitterScenario).toBeDefined();
  expect(jitterScenario?.passes).toBe(true);
  expect(jitterScenario?.actualTurns).toEqual([
    "Noisy end-of-turn signals should still commit once",
  ]);
  expect(jitterScenario?.replayedTurns).toBe(0);

  const reconnectJitterScenario = report.scenarios.find(
    (scenario) => scenario.id === "reconnect-end-of-turn-jitter",
  );
  expect(reconnectJitterScenario).toBeDefined();
  expect(reconnectJitterScenario?.passes).toBe(true);
  expect(reconnectJitterScenario?.actualTurns).toEqual([
    "Reconnect duplicate end-of-turn should dedupe",
  ]);
  expect(reconnectJitterScenario?.replayedTurns).toBe(0);

  expect(report.summary.scenarioCount).toBe(6);
  expect(report.summary.passCount).toBeGreaterThanOrEqual(5);
  expect(report.summary.duplicateTurnRate).toBe(0);
});
