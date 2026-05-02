import { expect, test } from "bun:test";
import {
  compareSTTBenchmarks,
  evaluateSTTBenchmarkAcceptance,
  resolveFixtureEnvironment,
  summarizeSTTBenchmark,
  type VoiceSTTBenchmarkFixtureResult,
} from "../src/testing";

const buildFixtureResult = (
  overrides: Partial<VoiceSTTBenchmarkFixtureResult>,
): VoiceSTTBenchmarkFixtureResult => ({
  accuracy: {
    actualText: "alpha beta",
    charDistance: 0,
    charErrorRate: 0,
    expectedText: "alpha beta",
    passesThreshold: true,
    threshold: 0.3,
    wordDistance: 0,
    wordErrorRate: 0,
  },
  closeCount: 1,
  elapsedMs: 1000,
  endOfTurnCount: 1,
  errorCount: 0,
  expectedTerms: {
    allMatched: true,
    expectedTerms: ["alpha"],
    matchedTerms: ["alpha"],
    missingTerms: [],
    recall: 1,
  },
  finalCount: 1,
  finalText: "alpha beta",
  fixtureId: "fixture-a",
  fragmentationCount: 0,
  passes: true,
  partialCount: 2,
  tags: ["clean"],
  group: "clean",
  title: "Fixture A",
  ...overrides,
});

test("summarizeSTTBenchmark aggregates fixture metrics", () => {
  const summary = summarizeSTTBenchmark("adapter-a", [
    buildFixtureResult({ fixtureId: "a" }),
    buildFixtureResult({
      accuracy: {
        actualText: "alpha",
        charDistance: 2,
        charErrorRate: 0.1,
        expectedText: "alpha beta",
        passesThreshold: false,
        threshold: 0.3,
        wordDistance: 1,
        wordErrorRate: 0.5,
      },
      errorCount: 1,
      expectedTerms: {
        allMatched: false,
        expectedTerms: ["alpha", "beta"],
        matchedTerms: ["alpha"],
        missingTerms: ["beta"],
        recall: 0.5,
      },
      fixtureId: "b",
      fragmentationCount: 2,
      passes: false,
    }),
  ]);

  expect(summary.adapterId).toBe("adapter-a");
  expect(summary.fixtureCount).toBe(2);
  expect(summary.passCount).toBe(1);
  expect(summary.passRate).toBe(0.5);
  expect(summary.fixturesWithErrors).toBe(1);
  expect(summary.fixturesWithFragmentation).toBe(1);
  expect(summary.averageWordErrorRate).toBe(0.25);
  expect(summary.wordAccuracyRate).toBe(0.75);
  expect(summary.averageTermRecall).toBe(0.75);
  expect(summary.averagePostSpeechTimeToFirstFinalMs).toBeUndefined();
  expect(summary.averagePostSpeechTimeToEndOfTurnMs).toBeUndefined();
  expect(summary.groupSummaries).toHaveLength(1);
  expect(summary.groupSummaries[0].group).toBe("clean");
});

test("evaluateSTTBenchmarkAcceptance applies configured thresholds", () => {
  const report = summarizeSTTBenchmark("adapter-a", [
    buildFixtureResult({
      fixtureId: "a",
      group: "clean",
      accuracy: {
        actualText: "alpha beta",
        charDistance: 0,
        charErrorRate: 0.1,
        expectedText: "alpha beta",
        passesThreshold: false,
        threshold: 0.3,
        wordDistance: 1,
        wordErrorRate: 0.45,
      },
      expectedTerms: {
        allMatched: false,
        expectedTerms: ["alpha", "beta"],
        matchedTerms: ["alpha"],
        missingTerms: ["beta"],
        recall: 0.5,
      },
      passes: false,
    }),
    buildFixtureResult({
      fixtureId: "b",
      group: "clean",
      accuracy: {
        actualText: "hello world",
        charDistance: 0,
        charErrorRate: 0.05,
        expectedText: "hello world",
        passesThreshold: true,
        threshold: 0.3,
        wordDistance: 0,
        wordErrorRate: 0.1,
      },
      expectedTerms: {
        allMatched: true,
        expectedTerms: ["hello"],
        matchedTerms: ["hello"],
        missingTerms: [],
        recall: 1,
      },
      passes: true,
    }),
  ]);

  const result = evaluateSTTBenchmarkAcceptance(
    {
      adapterId: "adapter-a",
      fixtures: [],
      generatedAt: Date.now(),
      summary: report,
    },
    {
      overallPassRate: 0.8,
      termRecall: 0.8,
    },
  );

  expect(result.passed).toBe(false);
  expect(result.failures.length).toBeGreaterThan(0);
  expect(result.score).toBeGreaterThanOrEqual(0);
});

test("compareSTTBenchmarks ranks reports by generic quality metrics", () => {
  const comparison = compareSTTBenchmarks([
    {
      adapterId: "adapter-a",
      fixtures: [],
      generatedAt: 1,
      summary: summarizeSTTBenchmark("adapter-a", [
        buildFixtureResult({ fixtureId: "a" }),
      ]),
    },
    {
      adapterId: "adapter-b",
      fixtures: [],
      generatedAt: 2,
      summary: summarizeSTTBenchmark("adapter-b", [
        buildFixtureResult({
          accuracy: {
            actualText: "alpha",
            charDistance: 2,
            charErrorRate: 0.1,
            expectedText: "alpha beta",
            passesThreshold: true,
            threshold: 0.3,
            wordDistance: 1,
            wordErrorRate: 0.5,
          },
          expectedTerms: {
            allMatched: false,
            expectedTerms: ["alpha", "beta"],
            matchedTerms: ["alpha"],
            missingTerms: ["beta"],
            recall: 0.5,
          },
          fixtureId: "b",
        }),
      ]),
    },
  ]);

  expect(comparison.entries).toHaveLength(2);
  expect(comparison.bestByPassRate?.adapterId).toBe("adapter-a");
  expect(comparison.bestByWordErrorRate?.adapterId).toBe("adapter-a");
  expect(comparison.bestByTermRecall?.adapterId).toBe("adapter-a");
});

test("resolveFixtureEnvironment prioritizes telephony fixtures as their own group", () => {
  expect(
    resolveFixtureEnvironment({
      tags: ["clean", "telephony", "narrowband"],
    }),
  ).toBe("telephony");
});

test("resolveFixtureEnvironment recognizes code-switch fixtures", () => {
  expect(
    resolveFixtureEnvironment({
      language: "es",
      tags: ["code-switch", "multilingual"],
    }),
  ).toBe("code-switch");
});

test("resolveFixtureEnvironment recognizes jargon fixtures before clean/noisy fallback", () => {
  expect(
    resolveFixtureEnvironment({
      tags: ["clean", "jargon", "domain-heavy"],
    }),
  ).toBe("jargon");
});

test("resolveFixtureEnvironment recognizes multi-speaker fixtures", () => {
  expect(
    resolveFixtureEnvironment({
      tags: ["multi-speaker", "synthetic"],
    }),
  ).toBe("multi-speaker");
});

test("resolveFixtureEnvironment recognizes multilingual fixtures from language metadata", () => {
  expect(
    resolveFixtureEnvironment({
      language: "fr",
      tags: ["clean"],
    }),
  ).toBe("multilingual");
});

test("summarizeSTTBenchmark includes speaker turn match rate", () => {
  const summary = summarizeSTTBenchmark("adapter-a", [
    buildFixtureResult({
      fixtureId: "speaker-a",
      group: "multi-speaker",
      speakerTurns: {
        available: true,
        actualTurnCount: 2,
        expectedTurnCount: 2,
        passes: true,
        patternMatchRate: 1,
      },
    }),
    buildFixtureResult({
      fixtureId: "speaker-b",
      group: "multi-speaker",
      passes: false,
      speakerTurns: {
        available: true,
        actualTurnCount: 2,
        expectedTurnCount: 3,
        passes: false,
        patternMatchRate: 0.5,
      },
    }),
  ]);

  expect(summary.averageSpeakerTurnMatchRate).toBe(0.75);
  expect(summary.groupSummaries[0]?.averageSpeakerTurnMatchRate).toBe(0.75);
});
