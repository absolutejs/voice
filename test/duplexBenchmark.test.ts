import { expect, test } from "bun:test";
import {
  getDefaultVoiceDuplexBenchmarkScenarios,
  runVoiceDuplexBenchmark,
  runVoiceDuplexBenchmarkScenario,
  summarizeVoiceDuplexBenchmark,
} from "../src/testing/duplex";

test("getDefaultVoiceDuplexBenchmarkScenarios returns bundled barge-in scenarios", () => {
  const scenarios = getDefaultVoiceDuplexBenchmarkScenarios();

  expect(scenarios).toHaveLength(3);
  expect(
    scenarios.every((scenario) => scenario.expectedInterruptCount === 1),
  ).toBe(true);
});

test("runVoiceDuplexBenchmarkScenario measures manual audio-send interruption", async () => {
  const result = await runVoiceDuplexBenchmarkScenario({
    expectedInterruptCount: 1,
    id: "audio-send",
    interruptDelayMs: 2,
    mode: "audio-send",
    title: "Manual send",
  });

  expect(result.passes).toBe(true);
  expect(result.actualInterruptCount).toBe(1);
  expect(result.interruptLatencyMs).toBeGreaterThanOrEqual(0);
});

test("runVoiceDuplexBenchmarkScenario honors disabled partial-triggered barge-in", async () => {
  const result = await runVoiceDuplexBenchmarkScenario(
    {
      expectedInterruptCount: 0,
      id: "partial-disabled",
      mode: "partial",
      partial: "hello there",
      title: "Partial disabled",
    },
    {
      bargeIn: {
        interruptOnPartial: false,
      },
    },
  );

  expect(result.passes).toBe(true);
  expect(result.actualInterruptCount).toBe(0);
});

test("summarizeVoiceDuplexBenchmark aggregates latency and pass rate", () => {
  const summary = summarizeVoiceDuplexBenchmark([
    {
      actualInterruptCount: 1,
      elapsedMs: 10,
      expectedInterruptCount: 1,
      fixtureId: "a",
      interruptLatencyMs: 2,
      mode: "audio-send",
      passes: true,
      title: "A",
    },
    {
      actualInterruptCount: 0,
      elapsedMs: 20,
      expectedInterruptCount: 1,
      fixtureId: "b",
      interruptLatencyMs: 4,
      mode: "partial",
      passes: false,
      title: "B",
    },
  ]);

  expect(summary.passRate).toBe(0.5);
  expect(summary.averageElapsedMs).toBe(15);
  expect(summary.averageInterruptLatencyMs).toBe(3);
});

test("runVoiceDuplexBenchmark returns a saved-style report shape", async () => {
  const report = await runVoiceDuplexBenchmark(
    getDefaultVoiceDuplexBenchmarkScenarios().slice(0, 1),
  );

  expect(report.fixtures).toHaveLength(1);
  expect(report.summary.passCount).toBe(1);
  expect(report.generatedAt).toBeGreaterThan(0);
});
