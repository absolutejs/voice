import { expect, test } from "bun:test";
import {
  aggregateTranscriptAccuracy,
  alignTranscriptWords,
  buildVoiceBenchmarkArtifact,
  comparePairedMetrics,
  scoreTranscriptAccuracy,
  verifyVoiceBenchmarkArtifact,
} from "../src/testing";

test("word alignment reports NIST-style C/S/D/I counts", () => {
  const result = alignTranscriptWords(
    ["we", "met", "joe", "johnson", "today"],
    ["we", "met", "joe", "johnston"],
  );
  expect(result).toMatchObject({ correct: 3, substitutions: 1, insertions: 1, deletions: 0, referenceWordCount: 4, sentenceError: true });
});

test("aggregate accuracy distinguishes macro and micro WER", () => {
  const values = [scoreTranscriptAccuracy("a", "a"), scoreTranscriptAccuracy("wrong", "one two three")];
  const result = aggregateTranscriptAccuracy(values);
  expect(result.macroWordErrorRate).toBeCloseTo(1 / 2);
  expect(result.microWordErrorRate).toBeCloseTo(3 / 4);
});

test("paired bootstrap is deterministic and preserves direction", () => {
  const result = comparePairedMetrics([0.4, 0.3, 0.2], [0.2, 0.1, 0.1], { samples: 1_000, seed: 7 });
  expect(result.delta).toBeLessThan(0);
  expect(result.probabilityCandidateIsBetter).toBe(1);
});

test("benchmark artifacts are checksummed", () => {
  const manifest = {
    adapter: { id: "example" }, corpus: { fixtures: [], manifestSha256: "abc", name: "test", version: "1" },
    createdAt: "2026-07-22T00:00:00.000Z", environment: {}, git: {}, preprocessing: {}, promptTrack: "unprompted" as const, seed: 1,
  };
  const artifact = buildVoiceBenchmarkArtifact(manifest, { passRate: 1 });
  expect(verifyVoiceBenchmarkArtifact(artifact)).toBe(true);
  expect(verifyVoiceBenchmarkArtifact({ ...artifact, report: { passRate: 0 } })).toBe(false);
});
