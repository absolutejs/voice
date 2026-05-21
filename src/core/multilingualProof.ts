import type { STTAdapter } from "./types";
import {
  loadVoiceTestFixtures,
  type VoiceTestFixture,
} from "../testing/fixtures";
import {
  runSTTAdapterBenchmark,
  type VoiceSTTBenchmarkFixtureResult,
  type VoiceSTTBenchmarkOptions,
  type VoiceSTTBenchmarkReport,
} from "../testing/benchmark";

export type VoiceMultilingualLanguageCode = string;

export type VoiceMultilingualProofLanguageThresholds = {
  label?: string;
  language: VoiceMultilingualLanguageCode;
  maxAverageWordErrorRate?: number;
  minAverageWordAccuracyRate?: number;
  minPassRate?: number;
  minTermRecall?: number;
};

export type VoiceMultilingualProofDefaultThresholds = Omit<
  VoiceMultilingualProofLanguageThresholds,
  "label" | "language"
>;

export type VoiceMultilingualProofAdapterEntry = {
  adapter: STTAdapter;
  adapterId: string;
  benchmarkOptions?: VoiceSTTBenchmarkOptions;
};

export type VoiceMultilingualProofOptions = {
  adapters: readonly VoiceMultilingualProofAdapterEntry[];
  defaultThresholds?: VoiceMultilingualProofDefaultThresholds;
  filter?: (fixture: VoiceTestFixture) => boolean;
  fixtureDirectories?: string | readonly string[];
  fixtures?: readonly VoiceTestFixture[];
  perLanguage?: readonly VoiceMultilingualProofLanguageThresholds[];
};

export type VoiceMultilingualProofLanguageMetrics = {
  averageTermRecall: number;
  averageWordAccuracyRate: number;
  averageWordErrorRate: number;
  fixtureCount: number;
  passCount: number;
  passRate: number;
};

export type VoiceMultilingualProofLanguageReport = {
  applied: VoiceMultilingualProofLanguageThresholds;
  failures: readonly string[];
  fixtureIds: readonly string[];
  label?: string;
  language: VoiceMultilingualLanguageCode;
  metrics: VoiceMultilingualProofLanguageMetrics;
  passes: boolean;
};

export type VoiceMultilingualProofAdapterReport = {
  adapterId: string;
  benchmark: VoiceSTTBenchmarkReport;
  failures: readonly string[];
  fixtureCount: number;
  languageReports: readonly VoiceMultilingualProofLanguageReport[];
  overall: VoiceMultilingualProofLanguageMetrics;
  passes: boolean;
};

export type VoiceMultilingualProofReport = {
  adapters: readonly VoiceMultilingualProofAdapterReport[];
  generatedAt: number;
  passes: boolean;
  summary: {
    adapterCount: number;
    failedAdapters: readonly string[];
    fixtureCount: number;
    languageCount: number;
  };
};

const average = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;

  return total / values.length;
};

const computeMetrics = (
  results: readonly VoiceSTTBenchmarkFixtureResult[],
): VoiceMultilingualProofLanguageMetrics => {
  if (results.length === 0) {
    return {
      averageTermRecall: 0,
      averageWordAccuracyRate: 0,
      averageWordErrorRate: 0,
      fixtureCount: 0,
      passCount: 0,
      passRate: 0,
    };
  }
  const wordErrorRates = results.map(
    (result) => result.accuracy.wordErrorRate ?? 0,
  );
  const wordAccuracyRates = results.map(
    (result) => 1 - (result.accuracy.wordErrorRate ?? 0),
  );
  const termRecalls = results.map((result) => result.expectedTerms.recall ?? 0);
  const passCount = results.filter((result) => result.passes).length;

  return {
    averageTermRecall: average(termRecalls),
    averageWordAccuracyRate: average(wordAccuracyRates),
    averageWordErrorRate: average(wordErrorRates),
    fixtureCount: results.length,
    passCount,
    passRate: passCount / results.length,
  };
};

const resolveLanguageThreshold = (
  language: VoiceMultilingualLanguageCode,
  defaults: VoiceMultilingualProofDefaultThresholds | undefined,
  perLanguage: readonly VoiceMultilingualProofLanguageThresholds[] | undefined,
): VoiceMultilingualProofLanguageThresholds => {
  const explicit = perLanguage?.find(
    (entry) => entry.language.toLowerCase() === language.toLowerCase(),
  );

  return {
    label: explicit?.label,
    language,
    maxAverageWordErrorRate:
      explicit?.maxAverageWordErrorRate ?? defaults?.maxAverageWordErrorRate,
    minAverageWordAccuracyRate:
      explicit?.minAverageWordAccuracyRate ??
      defaults?.minAverageWordAccuracyRate,
    minPassRate: explicit?.minPassRate ?? defaults?.minPassRate,
    minTermRecall: explicit?.minTermRecall ?? defaults?.minTermRecall,
  };
};

const evaluateLanguage = (
  language: VoiceMultilingualLanguageCode,
  fixtureResults: readonly VoiceSTTBenchmarkFixtureResult[],
  thresholds: VoiceMultilingualProofLanguageThresholds,
): VoiceMultilingualProofLanguageReport => {
  const metrics = computeMetrics(fixtureResults);
  const failures: string[] = [];
  if (
    thresholds.maxAverageWordErrorRate !== undefined &&
    metrics.averageWordErrorRate > thresholds.maxAverageWordErrorRate
  ) {
    failures.push(
      `${language}: avg WER ${metrics.averageWordErrorRate.toFixed(3)} exceeds budget ${thresholds.maxAverageWordErrorRate.toFixed(3)}.`,
    );
  }
  if (
    thresholds.minAverageWordAccuracyRate !== undefined &&
    metrics.averageWordAccuracyRate < thresholds.minAverageWordAccuracyRate
  ) {
    failures.push(
      `${language}: avg WAR ${metrics.averageWordAccuracyRate.toFixed(3)} below floor ${thresholds.minAverageWordAccuracyRate.toFixed(3)}.`,
    );
  }
  if (
    thresholds.minPassRate !== undefined &&
    metrics.passRate < thresholds.minPassRate
  ) {
    failures.push(
      `${language}: pass rate ${metrics.passRate.toFixed(3)} below floor ${thresholds.minPassRate.toFixed(3)}.`,
    );
  }
  if (
    thresholds.minTermRecall !== undefined &&
    metrics.averageTermRecall < thresholds.minTermRecall
  ) {
    failures.push(
      `${language}: term recall ${metrics.averageTermRecall.toFixed(3)} below floor ${thresholds.minTermRecall.toFixed(3)}.`,
    );
  }

  return {
    applied: thresholds,
    failures,
    fixtureIds: fixtureResults.map((result) => result.fixtureId),
    label: thresholds.label,
    language,
    metrics,
    passes: failures.length === 0,
  };
};

const collectFixtures = async (
  options: VoiceMultilingualProofOptions,
): Promise<VoiceTestFixture[]> => {
  // An explicit `fixtures` value (even an empty array) is authoritative —
  // callers use that to opt out of the loader entirely.
  if (options.fixtures !== undefined) {
    return options.fixtures.slice();
  }
  const loaded = await loadVoiceTestFixtures(
    options.fixtureDirectories as string | string[] | undefined,
  );

  return options.filter ? loaded.filter(options.filter) : loaded;
};

const groupByLanguage = (
  results: readonly VoiceSTTBenchmarkFixtureResult[],
  fixtures: readonly VoiceTestFixture[],
): Map<VoiceMultilingualLanguageCode, VoiceSTTBenchmarkFixtureResult[]> => {
  const lookup = new Map<string, string>();
  for (const fixture of fixtures) {
    lookup.set(fixture.id, fixture.language ?? "unknown");
  }
  const grouped = new Map<string, VoiceSTTBenchmarkFixtureResult[]>();
  for (const result of results) {
    const language = lookup.get(result.fixtureId) ?? "unknown";
    const bucket = grouped.get(language) ?? [];
    bucket.push(result);
    grouped.set(language, bucket);
  }

  return grouped;
};

export const renderVoiceMultilingualProofMarkdown = (
  report: VoiceMultilingualProofReport,
): string => {
  const lines: string[] = [
    `# Voice Multilingual STT Proof`,
    "",
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    `Status: ${report.passes ? "**PASS**" : "**FAIL**"}`,
    `Adapters: ${String(report.summary.adapterCount)}; Fixtures: ${String(report.summary.fixtureCount)}; Languages: ${String(report.summary.languageCount)}.`,
    "",
  ];
  if (report.summary.failedAdapters.length > 0) {
    lines.push(
      `Failed adapters: ${report.summary.failedAdapters.join(", ")}.`,
      "",
    );
  }
  for (const adapter of report.adapters) {
    lines.push(
      `## ${adapter.adapterId} — ${adapter.passes ? "pass" : "fail"}`,
      "",
      `- Fixtures: ${String(adapter.fixtureCount)}`,
      `- Avg WER: ${adapter.overall.averageWordErrorRate.toFixed(3)}`,
      `- Avg WAR: ${adapter.overall.averageWordAccuracyRate.toFixed(3)}`,
      `- Pass rate: ${(adapter.overall.passRate * 100).toFixed(1)}%`,
      "",
      `| Language | Fixtures | Avg WER | Avg WAR | Pass rate | Threshold | Status |`,
      `| --- | ---: | ---: | ---: | ---: | --- | --- |`,
    );
    for (const language of adapter.languageReports) {
      const threshold: string[] = [];
      if (language.applied.maxAverageWordErrorRate !== undefined) {
        threshold.push(
          `WER<=${language.applied.maxAverageWordErrorRate.toFixed(3)}`,
        );
      }
      if (language.applied.minAverageWordAccuracyRate !== undefined) {
        threshold.push(
          `WAR>=${language.applied.minAverageWordAccuracyRate.toFixed(3)}`,
        );
      }
      if (language.applied.minPassRate !== undefined) {
        threshold.push(`pass>=${language.applied.minPassRate.toFixed(3)}`);
      }
      if (language.applied.minTermRecall !== undefined) {
        threshold.push(`recall>=${language.applied.minTermRecall.toFixed(3)}`);
      }
      lines.push(
        `| ${language.language}${language.label ? ` (${language.label})` : ""} | ${String(language.metrics.fixtureCount)} | ${language.metrics.averageWordErrorRate.toFixed(3)} | ${language.metrics.averageWordAccuracyRate.toFixed(3)} | ${(language.metrics.passRate * 100).toFixed(1)}% | ${threshold.join(", ") || "—"} | ${language.passes ? "pass" : "fail"} |`,
      );
    }
    if (adapter.failures.length > 0) {
      lines.push("", "Failures:");
      for (const failure of adapter.failures) {
        lines.push(`- ${failure}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
};
export const runVoiceMultilingualProof = async (
  options: VoiceMultilingualProofOptions,
): Promise<VoiceMultilingualProofReport> => {
  if (options.adapters.length === 0) {
    throw new Error(
      "runVoiceMultilingualProof requires at least one adapter entry.",
    );
  }
  const fixtures = await collectFixtures(options);
  if (fixtures.length === 0) {
    throw new Error(
      "runVoiceMultilingualProof found zero fixtures. Did you set VOICE_FIXTURE_DIR or pass fixtures/fixtureDirectories?",
    );
  }
  const languageCodes = new Set(
    fixtures.map((fixture) => fixture.language ?? "unknown"),
  );
  const adapterReports: VoiceMultilingualProofAdapterReport[] = [];
  for (const entry of options.adapters) {
    const benchmark = await runSTTAdapterBenchmark({
      adapter: entry.adapter,
      adapterId: entry.adapterId,
      fixtures,
      options: entry.benchmarkOptions,
    });
    const grouped = groupByLanguage(benchmark.fixtures, fixtures);
    const languageReports: VoiceMultilingualProofLanguageReport[] = [];
    for (const language of languageCodes) {
      const bucket = grouped.get(language) ?? [];
      if (bucket.length === 0) continue;
      const thresholds = resolveLanguageThreshold(
        language,
        options.defaultThresholds,
        options.perLanguage,
      );
      languageReports.push(evaluateLanguage(language, bucket, thresholds));
    }
    const overall = computeMetrics(benchmark.fixtures);
    const failures: string[] = languageReports.flatMap(
      (report) => report.failures,
    );
    adapterReports.push({
      adapterId: entry.adapterId,
      benchmark,
      failures,
      fixtureCount: benchmark.fixtures.length,
      languageReports,
      overall,
      passes: failures.length === 0,
    });
  }
  const failedAdapters = adapterReports
    .filter((report) => !report.passes)
    .map((report) => report.adapterId);

  return {
    adapters: adapterReports,
    generatedAt: Date.now(),
    passes: failedAdapters.length === 0,
    summary: {
      adapterCount: adapterReports.length,
      failedAdapters,
      fixtureCount: fixtures.length,
      languageCount: languageCodes.size,
    },
  };
};

export type VoiceMultilingualProofReadinessOptions = {
  baseHref?: string;
  label?: string;
};

export type VoiceMultilingualProofReadinessCheck = {
  detail: string;
  href?: string;
  label: string;
  status: "fail" | "pass" | "warn";
  value?: number | string;
};

export const buildVoiceMultilingualProofReadinessCheck = (
  report: VoiceMultilingualProofReport,
  options: VoiceMultilingualProofReadinessOptions = {},
): VoiceMultilingualProofReadinessCheck => {
  const label = options.label ?? "Multilingual STT proof";
  if (report.adapters.length === 0) {
    return {
      detail: "No STT adapters were exercised against the multilingual corpus.",
      href: options.baseHref,
      label,
      status: "warn",
      value: 0,
    };
  }
  const {failedAdapters} = report.summary;
  if (failedAdapters.length === 0) {
    const passingDetail = report.adapters
      .map(
        (adapter) =>
          `${adapter.adapterId}: WER ${adapter.overall.averageWordErrorRate.toFixed(3)} across ${String(adapter.fixtureCount)} fixtures`,
      )
      .join("; ");

    return {
      detail: passingDetail,
      href: options.baseHref,
      label,
      status: "pass",
      value: report.summary.adapterCount,
    };
  }

  return {
    detail: `Failed adapters: ${failedAdapters.join(", ")}. ${report.adapters
      .filter((adapter) => !adapter.passes)
      .flatMap((adapter) => adapter.failures.slice(0, 3))
      .join(" ")}`,
    href: options.baseHref,
    label,
    status: "fail",
    value: failedAdapters.length,
  };
};
