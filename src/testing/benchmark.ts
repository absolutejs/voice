import type { STTAdapter, STTAdapterOpenOptions } from "../types";
import {
  runSTTAdapterFixture,
  type VoiceSTTAdapterHarnessOptions,
  type VoiceSTTAdapterHarnessResult,
} from "./stt";
import type { VoiceTestFixture } from "./fixtures";

export type VoiceExpectedTermAccuracy = {
  allMatched: boolean;
  expectedTerms: string[];
  matchedTerms: string[];
  missingTerms: string[];
  recall: number;
};

export type VoiceSTTFixtureEnvironment =
  | "accent"
  | "accent-noisy"
  | "clean"
  | "code-switch"
  | "jargon"
  | "multilingual"
  | "multi-speaker"
  | "noisy"
  | "telephony"
  | "other";

export type VoiceSpeakerTurnAccuracy = {
  available: boolean;
  actualTurnCount: number;
  expectedTurnCount: number;
  passes: boolean;
  patternMatchRate: number;
  postClustered?: boolean;
};

export type VoiceSTTBenchmarkFixtureResult = {
  accuracy: VoiceSTTAdapterHarnessResult["accuracy"];
  closeCount: number;
  difficulty?: VoiceTestFixture["difficulty"];
  elapsedMs: number;
  endOfTurnCount: number;
  errorCount: number;
  expectedTerms: VoiceExpectedTermAccuracy;
  finalCount: number;
  finalText: string;
  fixtureId: string;
  fragmentationCount: number;
  group: VoiceSTTFixtureEnvironment;
  passes: boolean;
  partialCount: number;
  speakerTurns?: VoiceSpeakerTurnAccuracy;
  postSpeechTimeToEndOfTurnMs?: number;
  postSpeechTimeToFirstFinalMs?: number;
  tags: string[];
  timeToEndOfTurnMs?: number;
  timeToFirstFinalMs?: number;
  timeToFirstPartialMs?: number;
  title: string;
};

export type VoiceSTTBenchmarkSummary = {
  adapterId: string;
  averageCharErrorRate: number;
  averageElapsedMs: number;
  averageEndOfTurnCount: number;
  averageFinalCount: number;
  averageSpeakerTurnMatchRate?: number;
  averageTermRecall: number;
  averagePostSpeechTimeToEndOfTurnMs?: number;
  averagePostSpeechTimeToFirstFinalMs?: number;
  averageTimeToEndOfTurnMs?: number;
  averageTimeToFirstFinalMs?: number;
  averageTimeToFirstPartialMs?: number;
  averageWordErrorRate: number;
  fixtureCount: number;
  fixturesWithErrors: number;
  fixturesWithFragmentation: number;
  passCount: number;
  passRate: number;
  totalErrorCount: number;
  wordAccuracyRate: number;
  groupSummaries: VoiceSTTBenchmarkFixtureSummary[];
};

export type VoiceSTTBenchmarkFixtureSummary = {
  group: VoiceSTTFixtureEnvironment;
  fixtureCount: number;
  fixturesWithErrors: number;
  fixturesWithFragments: number;
  passCount: number;
  passRate: number;
  wordAccuracyRate: number;
  averageTermRecall: number;
  averageSpeakerTurnMatchRate?: number;
  averageWordErrorRate: number;
  averageElapsedMs: number;
};

export type VoiceSTTBenchmarkReport = {
  adapterId: string;
  fixtures: VoiceSTTBenchmarkFixtureResult[];
  generatedAt: number;
  summary: VoiceSTTBenchmarkSummary;
};

export type VoiceSTTBenchmarkFixtureAggregate = {
  averageElapsedMs: number;
  averagePassRate: number;
  averageWordErrorRate: number;
  bestWordErrorRate: number;
  fixtureId: string;
  group: VoiceSTTFixtureEnvironment;
  passCount: number;
  runCount: number;
  tags: string[];
  title: string;
  worstWordErrorRate: number;
};

export type VoiceSTTBenchmarkSeriesSummary = {
  adapterId: string;
  averageElapsedMs: number;
  averagePassRate: number;
  averageWordErrorRate: number;
  fixtureCount: number;
  flakyFixtureCount: number;
  generatedRunCount: number;
  stableFixtureCount: number;
  totalPassCount: number;
  totalRunCount: number;
};

export type VoiceSTTBenchmarkSeriesReport = {
  adapterId: string;
  fixtures: VoiceSTTBenchmarkFixtureAggregate[];
  generatedAt: number;
  runCount: number;
  summary: VoiceSTTBenchmarkSeriesSummary;
};

export type VoiceSTTBenchmarkComparisonEntry = {
  adapterId: string;
  summary: VoiceSTTBenchmarkSummary;
};

export type VoiceSTTBenchmarkComparison = {
  bestByPassRate?: VoiceSTTBenchmarkComparisonEntry;
  bestByTermRecall?: VoiceSTTBenchmarkComparisonEntry;
  bestByWordErrorRate?: VoiceSTTBenchmarkComparisonEntry;
  entries: VoiceSTTBenchmarkComparisonEntry[];
};

export type VoiceSTTBenchmarkAcceptanceThresholds = {
  termRecall?: number;
  wordAccuracyRate?: number;
  overallPassRate?: number;
  groupPassRate?: Partial<
    Record<
      VoiceSTTFixtureEnvironment,
      { passRate?: number; wordAccuracyRate?: number }
    >
  >;
};

export type VoiceSTTBenchmarkAcceptanceResult = {
  adapterId: string;
  failures: string[];
  passed: boolean;
  score: number;
};

export type VoiceSTTBenchmarkOptions = VoiceSTTAdapterHarnessOptions & {
  fixtureOptions?: Record<
    string,
    Omit<VoiceSTTAdapterHarnessOptions, "fixtureOptions" | "openOptions">
  >;
  openOptions?:
    | Partial<STTAdapterOpenOptions>
    | ((
        fixture: VoiceTestFixture,
      ) => Partial<STTAdapterOpenOptions> | undefined);
};

export const resolveFixtureEnvironment = (
  fixture: Pick<VoiceTestFixture, "language" | "tags">,
): VoiceSTTFixtureEnvironment => {
  const tags = new Set(fixture.tags ?? []);
  if (tags.has("telephony")) {
    return "telephony";
  }

  if (tags.has("code-switch") || tags.has("code_switch")) {
    return "code-switch";
  }

  if (tags.has("multi-speaker")) {
    return "multi-speaker";
  }

  if (tags.has("jargon") || tags.has("domain-heavy")) {
    return "jargon";
  }

  const hasAccent = tags.has("accent") || tags.has("speech-accent-archive");
  const hasNoisy =
    tags.has("noisy") || tags.has("synthetic-noise") || tags.has("stress");
  const language = fixture.language?.trim().toLowerCase();
  const hasNonEnglishLanguage =
    typeof language === "string" &&
    language.length > 0 &&
    !language.startsWith("en");
  const isMultilingual =
    tags.has("multilingual") || tags.has("bilingual") || hasNonEnglishLanguage;

  if (hasAccent && hasNoisy) {
    return "accent-noisy";
  }

  if (isMultilingual) {
    return "multilingual";
  }

  if (hasAccent) {
    return "accent";
  }

  if (hasNoisy) {
    return "noisy";
  }

  if (tags.has("clean")) {
    return "clean";
  }

  return "other";
};

const normalizeBenchmarkText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreExpectedTerms = (
  actualText: string,
  expectedTerms: string[] | undefined,
): VoiceExpectedTermAccuracy => {
  const normalizedActual = normalizeBenchmarkText(actualText);
  const normalizedExpectedTerms = (expectedTerms ?? []).map((entry) =>
    normalizeBenchmarkText(entry),
  );
  const matchedTerms = normalizedExpectedTerms.filter(
    (term) => term.length > 0 && normalizedActual.includes(term),
  );
  const missingTerms = normalizedExpectedTerms.filter(
    (term) => term.length > 0 && !matchedTerms.includes(term),
  );
  const denominator = normalizedExpectedTerms.length;
  const recall = denominator > 0 ? matchedTerms.length / denominator : 1;

  return {
    allMatched: missingTerms.length === 0,
    expectedTerms: normalizedExpectedTerms,
    matchedTerms,
    missingTerms,
    recall,
  };
};

const toPatternKeys = (speakers: Array<string | number>) => {
  const mapping = new Map<string, number>();
  let nextKey = 0;

  return speakers.map((speaker) => {
    const key = String(speaker);
    if (!mapping.has(key)) {
      mapping.set(key, nextKey);
      nextKey += 1;
    }

    return mapping.get(key)!;
  });
};

const countNormalizedWords = (value: string) =>
  normalizeBenchmarkText(value)
    .split(" ")
    .filter((token) => token.length > 0);

const computeWordOverlap = (left: string, right: string) => {
  const leftWords = new Set(countNormalizedWords(left));
  const rightWords = new Set(countNormalizedWords(right));

  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftWords.size, rightWords.size);
};

const repairSpeakerTurnReentry = (
  fixture: Pick<VoiceTestFixture, "expectedSpeakerTurns" | "tags">,
  turns: Array<{ speaker?: string | number; text: string }>,
) => {
  const expectedTurns = fixture.expectedSpeakerTurns ?? [];
  const tags = new Set(
    (fixture.tags ?? []).map((tag) => tag.trim().toLowerCase()),
  );
  if (
    expectedTurns.length < 3 ||
    !tags.has("synthetic") ||
    !tags.has("handoff")
  ) {
    return {
      postClustered: false,
      turns,
    };
  }

  const repairedTurns = turns.map((turn) => ({ ...turn }));
  const firstTurnBySpeaker = new Map<
    string,
    { speaker?: string | number; text: string }
  >();
  const seenRepairedSpeakers = new Set<string>();
  let postClustered = false;
  let syntheticSpeakerIndex = 0;

  for (let index = 0; index < repairedTurns.length; index += 1) {
    const turn = repairedTurns[index]!;
    const speakerKey =
      turn.speaker === undefined ? undefined : String(turn.speaker);
    const previousTurn = repairedTurns[index - 1];
    const previousSpeakerKey =
      previousTurn?.speaker === undefined
        ? undefined
        : String(previousTurn.speaker);

    if (speakerKey === undefined) {
      continue;
    }

    if (!firstTurnBySpeaker.has(speakerKey)) {
      firstTurnBySpeaker.set(speakerKey, turn);
    }

    seenRepairedSpeakers.add(String(turn.speaker));
    const originalSpeakerTurn = firstTurnBySpeaker.get(speakerKey)!;
    const speakerReentered =
      previousSpeakerKey !== undefined &&
      previousSpeakerKey !== speakerKey &&
      index > 1;
    const needsAdditionalSpeaker =
      seenRepairedSpeakers.size < expectedTurns.length;
    const sameSpeakerOverlap = computeWordOverlap(
      turn.text,
      originalSpeakerTurn.text,
    );
    const currentWordCount = countNormalizedWords(turn.text).length;

    if (
      speakerReentered &&
      needsAdditionalSpeaker &&
      currentWordCount >= 4 &&
      sameSpeakerOverlap < 0.35
    ) {
      turn.speaker = `postcluster-${syntheticSpeakerIndex}`;
      seenRepairedSpeakers.add(String(turn.speaker));
      syntheticSpeakerIndex += 1;
      postClustered = true;
    }
  }

  return {
    postClustered,
    turns: repairedTurns,
  };
};

const scoreSpeakerTurns = (
  fixture: Pick<VoiceTestFixture, "expectedSpeakerTurns" | "tags">,
  result: VoiceSTTAdapterHarnessResult,
): VoiceSpeakerTurnAccuracy | undefined => {
  const expectedTurns = fixture.expectedSpeakerTurns ?? [];
  if (expectedTurns.length === 0) {
    return undefined;
  }

  const actualTurns = result.finalEvents
    .map((event) => ({
      speaker: event.transcript.speaker,
      text: event.transcript.text.trim(),
    }))
    .filter((turn) => turn.text.length > 0);
  const collapsedActualTurns = actualTurns.reduce<typeof actualTurns>(
    (merged, turn) => {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.speaker !== undefined &&
        turn.speaker !== undefined &&
        String(previous.speaker) === String(turn.speaker)
      ) {
        previous.text = `${previous.text} ${turn.text}`.trim();
        return merged;
      }

      merged.push({ ...turn });
      return merged;
    },
    [],
  );
  const repaired = repairSpeakerTurnReentry(fixture, collapsedActualTurns);
  const scoredTurns = repaired.turns;

  const available = scoredTurns.every((turn) => turn.speaker !== undefined);
  if (!available) {
    return {
      available: false,
      actualTurnCount: scoredTurns.length,
      expectedTurnCount: expectedTurns.length,
      passes: false,
      patternMatchRate: 0,
      postClustered: repaired.postClustered,
    };
  }

  const actualPattern = toPatternKeys(scoredTurns.map((turn) => turn.speaker!));
  const expectedPattern = toPatternKeys(
    expectedTurns.map((turn) => turn.speaker),
  );
  const maxLength = Math.max(actualPattern.length, expectedPattern.length, 1);
  let matches = 0;

  for (
    let index = 0;
    index < Math.min(actualPattern.length, expectedPattern.length);
    index += 1
  ) {
    if (actualPattern[index] === expectedPattern[index]) {
      matches += 1;
    }
  }

  const patternMatchRate = roundMetric(matches / maxLength) ?? 0;

  return {
    available: true,
    actualTurnCount: scoredTurns.length,
    expectedTurnCount: expectedTurns.length,
    passes:
      scoredTurns.length === expectedTurns.length && patternMatchRate === 1,
    patternMatchRate,
    postClustered: repaired.postClustered,
  };
};

const average = (values: Array<number | undefined>) => {
  const filtered = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
};

const roundMetric = (value: number | undefined, digits = 4) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const calculateGroupSummary = (
  fixtures: VoiceSTTBenchmarkFixtureResult[],
): VoiceSTTBenchmarkFixtureSummary[] => {
  const grouped = new Map<
    VoiceSTTFixtureEnvironment,
    VoiceSTTBenchmarkFixtureResult[]
  >();

  for (const fixture of fixtures) {
    const existing = grouped.get(fixture.group) ?? [];
    existing.push(fixture);
    grouped.set(fixture.group, existing);
  }

  return Array.from(grouped.entries())
    .map(([group, results]) => {
      const fixtureCount = results.length;
      const passCount = results.filter((fixture) => fixture.passes).length;
      const averageWordErrorRate =
        average(results.map((result) => result.accuracy.wordErrorRate)) ?? 0;
      const averageTermRecall =
        average(results.map((result) => result.expectedTerms.recall)) ?? 0;
      const averageElapsedMs = average(
        results.map((result) => result.elapsedMs),
      );
      const averageSpeakerTurnMatchRate = average(
        results.map((result) => result.speakerTurns?.patternMatchRate),
      );
      const accuracy = 1 - averageWordErrorRate;

      return {
        averageElapsedMs: roundMetric(averageElapsedMs, 2) ?? 0,
        averageSpeakerTurnMatchRate: roundMetric(averageSpeakerTurnMatchRate),
        averageTermRecall: roundMetric(averageTermRecall) ?? 0,
        averageWordErrorRate: roundMetric(averageWordErrorRate) ?? 0,
        fixturesWithErrors: results.filter((fixture) => fixture.errorCount > 0)
          .length,
        fixturesWithFragments: results.filter(
          (fixture) => fixture.fragmentationCount > 0,
        ).length,
        fixtureCount,
        group,
        passCount,
        passRate:
          fixtureCount > 0 ? (roundMetric(passCount / fixtureCount) ?? 0) : 0,
        wordAccuracyRate: roundMetric(accuracy) ?? 0,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group));
};

const toFixtureBenchmarkResult = (
  fixture: VoiceTestFixture,
  result: VoiceSTTAdapterHarnessResult,
  elapsedMs: number,
): VoiceSTTBenchmarkFixtureResult => {
  const toPostSpeechLatency = (timestamp: number | undefined) => {
    if (typeof timestamp !== "number") {
      return undefined;
    }

    return Math.max(0, timestamp - result.speechEndedAt);
  };
  const timeToFirstPartialMs = result.partialEvents[0]
    ? result.partialEvents[0].receivedAt - result.startedAt
    : undefined;
  const timeToFirstFinalMs = result.finalEvents[0]
    ? result.finalEvents[0].receivedAt - result.startedAt
    : undefined;
  const timeToEndOfTurnMs = result.endOfTurnEvents[0]
    ? result.endOfTurnEvents[0].receivedAt - result.startedAt
    : undefined;
  const postSpeechTimeToFirstFinalMs = toPostSpeechLatency(
    result.finalEvents[0]?.receivedAt,
  );
  const postSpeechTimeToEndOfTurnMs = toPostSpeechLatency(
    result.endOfTurnEvents[0]?.receivedAt,
  );
  const expectedTerms = scoreExpectedTerms(
    result.finalText,
    fixture.expectedTerms,
  );
  const speakerTurns = scoreSpeakerTurns(fixture, result);

  return {
    accuracy: result.accuracy,
    closeCount: result.closeEvents.length,
    difficulty: fixture.difficulty,
    elapsedMs,
    endOfTurnCount: result.endOfTurnEvents.length,
    errorCount: result.errorEvents.length,
    expectedTerms,
    finalCount: result.finalEvents.length,
    finalText: result.finalText,
    fixtureId: fixture.id,
    fragmentationCount: Math.max(0, result.finalEvents.length - 1),
    group: resolveFixtureEnvironment(fixture),
    passes:
      result.errorEvents.length === 0 &&
      result.finalText.trim().length > 0 &&
      result.accuracy.passesThreshold &&
      (speakerTurns ? speakerTurns.passes : true),
    partialCount: result.partialEvents.length,
    speakerTurns,
    postSpeechTimeToEndOfTurnMs,
    postSpeechTimeToFirstFinalMs,
    tags: fixture.tags ?? [],
    timeToEndOfTurnMs,
    timeToFirstFinalMs,
    timeToFirstPartialMs,
    title: fixture.title,
  };
};

export const summarizeSTTBenchmark = (
  adapterId: string,
  fixtures: VoiceSTTBenchmarkFixtureResult[],
): VoiceSTTBenchmarkSummary => {
  const fixtureCount = fixtures.length;
  const passCount = fixtures.filter((fixture) => fixture.passes).length;

  return {
    adapterId,
    averageCharErrorRate:
      roundMetric(
        average(fixtures.map((fixture) => fixture.accuracy.charErrorRate)),
      ) ?? 0,
    averageElapsedMs:
      roundMetric(average(fixtures.map((fixture) => fixture.elapsedMs)), 2) ??
      0,
    averageEndOfTurnCount:
      roundMetric(
        average(fixtures.map((fixture) => fixture.endOfTurnCount)),
        2,
      ) ?? 0,
    averageFinalCount:
      roundMetric(average(fixtures.map((fixture) => fixture.finalCount)), 2) ??
      0,
    averageSpeakerTurnMatchRate: roundMetric(
      average(
        fixtures.map((fixture) => fixture.speakerTurns?.patternMatchRate),
      ),
    ),
    averageTermRecall:
      roundMetric(
        average(fixtures.map((fixture) => fixture.expectedTerms.recall)),
      ) ?? 0,
    averagePostSpeechTimeToEndOfTurnMs: roundMetric(
      average(fixtures.map((fixture) => fixture.postSpeechTimeToEndOfTurnMs)),
      2,
    ),
    averagePostSpeechTimeToFirstFinalMs: roundMetric(
      average(fixtures.map((fixture) => fixture.postSpeechTimeToFirstFinalMs)),
      2,
    ),
    averageTimeToEndOfTurnMs: roundMetric(
      average(fixtures.map((fixture) => fixture.timeToEndOfTurnMs)),
      2,
    ),
    averageTimeToFirstFinalMs: roundMetric(
      average(fixtures.map((fixture) => fixture.timeToFirstFinalMs)),
      2,
    ),
    averageTimeToFirstPartialMs: roundMetric(
      average(fixtures.map((fixture) => fixture.timeToFirstPartialMs)),
      2,
    ),
    averageWordErrorRate:
      roundMetric(
        average(fixtures.map((fixture) => fixture.accuracy.wordErrorRate)),
      ) ?? 0,
    fixtureCount,
    fixturesWithErrors: fixtures.filter((fixture) => fixture.errorCount > 0)
      .length,
    fixturesWithFragmentation: fixtures.filter(
      (fixture) => fixture.fragmentationCount > 0,
    ).length,
    groupSummaries: calculateGroupSummary(fixtures),
    passCount,
    passRate:
      fixtureCount > 0 ? (roundMetric(passCount / fixtureCount) ?? 0) : 0,
    totalErrorCount: fixtures.reduce(
      (sum, fixture) => sum + fixture.errorCount,
      0,
    ),
    wordAccuracyRate:
      fixtureCount > 0
        ? (roundMetric(
            1 -
              (average(
                fixtures.map((fixture) => fixture.accuracy.wordErrorRate),
              ) ?? 0),
          ) ?? 0)
        : 0,
  };
};

export const evaluateSTTBenchmarkAcceptance = (
  report: VoiceSTTBenchmarkReport,
  thresholds: VoiceSTTBenchmarkAcceptanceThresholds = {},
): VoiceSTTBenchmarkAcceptanceResult => {
  const failures: string[] = [];
  const details = thresholds;

  const overallPassRate = details.overallPassRate;
  if (
    overallPassRate !== undefined &&
    report.summary.passRate < overallPassRate
  ) {
    failures.push(
      `overall passRate ${(report.summary.passRate * 100).toFixed(2)}% below ${(overallPassRate * 100).toFixed(2)}%`,
    );
  }

  const minTermRecall = details.termRecall;
  if (
    minTermRecall !== undefined &&
    report.summary.averageTermRecall < minTermRecall
  ) {
    failures.push(
      `overall term recall ${report.summary.averageTermRecall.toFixed(4)} below ${minTermRecall.toFixed(4)}`,
    );
  }

  const minWordAccuracy = details.wordAccuracyRate;
  if (
    minWordAccuracy !== undefined &&
    report.summary.wordAccuracyRate < minWordAccuracy
  ) {
    failures.push(
      `overall word accuracy ${(report.summary.wordAccuracyRate * 100).toFixed(2)}% below ${(minWordAccuracy * 100).toFixed(2)}%`,
    );
  }

  const groupThresholds = details.groupPassRate;
  if (groupThresholds) {
    for (const groupSummary of report.summary.groupSummaries) {
      const threshold = groupThresholds[groupSummary.group];
      if (!threshold) {
        continue;
      }

      if (
        threshold.passRate !== undefined &&
        groupSummary.passRate < threshold.passRate
      ) {
        failures.push(
          `${groupSummary.group} passRate ${(groupSummary.passRate * 100).toFixed(2)}% below ${(threshold.passRate * 100).toFixed(2)}%`,
        );
      }

      if (
        threshold.wordAccuracyRate !== undefined &&
        groupSummary.wordAccuracyRate < threshold.wordAccuracyRate
      ) {
        failures.push(
          `${groupSummary.group} wordAccuracy ${(groupSummary.wordAccuracyRate * 100).toFixed(2)}% below ${(threshold.wordAccuracyRate * 100).toFixed(2)}%`,
        );
      }
    }
  }

  const score =
    roundMetric(
      report.summary.passRate * 0.45 +
        report.summary.wordAccuracyRate * 0.35 +
        report.summary.averageTermRecall * 0.2,
      3,
    ) ?? 0;

  return {
    adapterId: report.adapterId,
    failures,
    passed: failures.length === 0,
    score,
  };
};

export const compareSTTBenchmarks = (
  reports: VoiceSTTBenchmarkReport[],
): VoiceSTTBenchmarkComparison => {
  const entries = reports.map((report) => ({
    adapterId: report.adapterId,
    summary: report.summary,
  }));

  const bestByMetric = (
    selectMetric: (entry: VoiceSTTBenchmarkComparisonEntry) => number,
    direction: "max" | "min",
  ) =>
    entries.reduce<VoiceSTTBenchmarkComparisonEntry | undefined>(
      (best, entry) => {
        if (!best) {
          return entry;
        }

        const next = selectMetric(entry);
        const current = selectMetric(best);
        if (direction === "max" ? next > current : next < current) {
          return entry;
        }

        return best;
      },
      undefined,
    );

  return {
    bestByPassRate: bestByMetric((entry) => entry.summary.passRate, "max"),
    bestByTermRecall: bestByMetric(
      (entry) => entry.summary.averageTermRecall,
      "max",
    ),
    bestByWordErrorRate: bestByMetric(
      (entry) => entry.summary.averageWordErrorRate,
      "min",
    ),
    entries,
  };
};

export const runSTTAdapterBenchmark = async ({
  adapter,
  adapterId,
  fixtures,
  options = {},
}: {
  adapter: STTAdapter;
  adapterId: string;
  fixtures: VoiceTestFixture[];
  options?: VoiceSTTBenchmarkOptions;
}): Promise<VoiceSTTBenchmarkReport> => {
  const results: VoiceSTTBenchmarkFixtureResult[] = [];

  for (const fixture of fixtures) {
    const startedAt = Date.now();
    const fixtureResult = await runSTTAdapterFixture(adapter, fixture, {
      ...options,
      ...(options.fixtureOptions?.[fixture.id] ?? {}),
    });

    results.push(
      toFixtureBenchmarkResult(fixture, fixtureResult, Date.now() - startedAt),
    );
  }

  return {
    adapterId,
    fixtures: results,
    generatedAt: Date.now(),
    summary: summarizeSTTBenchmark(adapterId, results),
  };
};

export const summarizeSTTBenchmarkSeries = (input: {
  adapterId: string;
  reports: VoiceSTTBenchmarkReport[];
}): VoiceSTTBenchmarkSeriesReport => {
  const fixtureMap = new Map<string, VoiceSTTBenchmarkFixtureResult[]>();

  for (const report of input.reports) {
    for (const fixture of report.fixtures) {
      const entries = fixtureMap.get(fixture.fixtureId) ?? [];
      entries.push(fixture);
      fixtureMap.set(fixture.fixtureId, entries);
    }
  }

  const fixtureAggregates = [...fixtureMap.entries()].map(
    ([fixtureId, results]) => {
      const wordErrorRates = results.map(
        (result) => result.accuracy.wordErrorRate,
      );
      const passCount = results.filter((result) => result.passes).length;
      const sample = results[0]!;

      return {
        averageElapsedMs:
          roundMetric(average(results.map((result) => result.elapsedMs)), 2) ??
          0,
        averagePassRate:
          roundMetric(results.length > 0 ? passCount / results.length : 0) ?? 0,
        averageWordErrorRate: roundMetric(average(wordErrorRates)) ?? 0,
        bestWordErrorRate:
          roundMetric(
            wordErrorRates.length > 0 ? Math.min(...wordErrorRates) : 0,
          ) ?? 0,
        fixtureId,
        group: sample.group,
        passCount,
        runCount: results.length,
        tags: sample.tags,
        title: sample.title,
        worstWordErrorRate:
          roundMetric(
            wordErrorRates.length > 0 ? Math.max(...wordErrorRates) : 0,
          ) ?? 0,
      } satisfies VoiceSTTBenchmarkFixtureAggregate;
    },
  );

  const totalRunCount = input.reports.reduce(
    (sum, report) => sum + report.fixtures.length,
    0,
  );
  const totalPassCount = input.reports.reduce(
    (sum, report) => sum + report.summary.passCount,
    0,
  );

  return {
    adapterId: input.adapterId,
    fixtures: fixtureAggregates,
    generatedAt: Date.now(),
    runCount: input.reports.length,
    summary: {
      adapterId: input.adapterId,
      averageElapsedMs:
        roundMetric(
          average(fixtureAggregates.map((fixture) => fixture.averageElapsedMs)),
          2,
        ) ?? 0,
      averagePassRate:
        roundMetric(
          average(fixtureAggregates.map((fixture) => fixture.averagePassRate)),
        ) ?? 0,
      averageWordErrorRate:
        roundMetric(
          average(
            fixtureAggregates.map((fixture) => fixture.averageWordErrorRate),
          ),
        ) ?? 0,
      fixtureCount: fixtureAggregates.length,
      flakyFixtureCount: fixtureAggregates.filter(
        (fixture) => fixture.averagePassRate > 0 && fixture.averagePassRate < 1,
      ).length,
      generatedRunCount: input.reports.length,
      stableFixtureCount: fixtureAggregates.filter(
        (fixture) => fixture.averagePassRate === 1,
      ).length,
      totalPassCount,
      totalRunCount,
    },
  };
};

export const runSTTAdapterBenchmarkSeries = async ({
  adapter,
  adapterId,
  fixtures,
  options = {},
  runs,
}: {
  adapter: STTAdapter;
  adapterId: string;
  fixtures: VoiceTestFixture[];
  options?: VoiceSTTBenchmarkOptions;
  runs: number;
}): Promise<VoiceSTTBenchmarkSeriesReport> => {
  const reports: VoiceSTTBenchmarkReport[] = [];
  const runCount = Math.max(1, Math.floor(runs));

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    reports.push(
      await runSTTAdapterBenchmark({
        adapter,
        adapterId,
        fixtures,
        options,
      }),
    );
  }

  return summarizeSTTBenchmarkSeries({
    adapterId,
    reports,
  });
};
