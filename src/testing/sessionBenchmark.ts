import { createVoiceMemoryStore } from "../memoryStore";
import { createVoiceSession } from "../session";
import { DEFAULT_SILENCE_MS, DEFAULT_SPEECH_THRESHOLD } from "../turnDetection";
import { resolveAudioConditioningConfig } from "../audioConditioning";
import { resolveTurnDetectionConfig } from "../turnProfiles";
import type {
  STTAdapter,
  VoiceAudioConditioningConfig,
  VoiceLogger,
  VoicePhraseHint,
  VoiceResolvedSTTFallbackConfig,
  VoiceSTTFallbackConfig,
  VoiceSTTLifecycle,
  VoiceTurnCorrectionHandler,
  VoiceTurnCostEstimate,
  VoiceSessionRecord,
  VoiceServerMessage,
  VoiceTurnProfile,
  VoiceTranscriptQuality,
  VoiceSocket,
} from "../types";
import {
  scoreTranscriptAccuracy,
  type VoiceTranscriptAccuracy,
} from "./accuracy";
import type { VoiceTestFixture } from "./fixtures";

export type VoiceSessionBenchmarkScenario = VoiceTestFixture & {
  expectedTurnTexts: string[];
  phraseHints?: VoicePhraseHint[];
  reconnectAtChunkIndex?: number;
  reconnectAtChunkIndices?: number[];
  reconnectPauseMs?: number;
  reconnectPauseMsByIndex?: number[];
  silenceMs?: number;
  speechThreshold?: number;
  transcriptStabilityMs?: number;
  transcriptThreshold?: number;
  turnProfile?: VoiceTurnProfile;
  audioConditioning?: VoiceAudioConditioningConfig;
  sttLifecycle?: VoiceSTTLifecycle;
};

export type VoiceSessionBenchmarkTraceEntry = {
  atMs: number;
  data?: unknown;
  phase: string;
};

export type VoiceSessionBenchmarkTurnResult = {
  actualText: string;
  accuracy?: VoiceTranscriptAccuracy;
  expectedText?: string;
  index: number;
  passes: boolean;
  quality?: VoiceTranscriptQuality;
};

export type VoiceSessionBenchmarkScenarioResult = {
  actualTurns: string[];
  averageRelativeCostUnits: number;
  duplicateTurnCount: number;
  elapsedMs: number;
  fallbackReplayAudioMs: number;
  expectedReconnectCount: number;
  expectedTurns: string[];
  fixtureId: string;
  primaryAudioMs: number;
  passes: boolean;
  reconnectCount: number;
  reconnectTriggered: boolean;
  tags: string[];
  title: string;
  turnPassRate: number;
  turnCountDelta: number;
  turnResults: VoiceSessionBenchmarkTurnResult[];
  trace?: VoiceSessionBenchmarkTraceEntry[];
};

export type VoiceSessionBenchmarkSummary = {
  adapterId: string;
  averageElapsedMs: number;
  averageFallbackReplayAudioMs: number;
  averagePrimaryAudioMs: number;
  averageReconnectCount: number;
  averageRelativeCostUnits: number;
  averageTurnPassRate: number;
  averageWordErrorRate: number;
  duplicateTurnRate: number;
  passCount: number;
  passRate: number;
  reconnectCoverageRate: number;
  reconnectSuccessRate: number;
  scenarioCount: number;
  scenariosWithDuplicateTurns: number;
  scenariosWithTurnCountMismatch: number;
};

export type VoiceSessionBenchmarkReport = {
  adapterId: string;
  generatedAt: number;
  scenarios: VoiceSessionBenchmarkScenarioResult[];
  summary: VoiceSessionBenchmarkSummary;
};

export type VoiceSessionBenchmarkScenarioAggregate = {
  averageElapsedMs: number;
  averageFallbackReplayAudioMs: number;
  averagePrimaryAudioMs: number;
  averageReconnectCount: number;
  averageRelativeCostUnits: number;
  averageTurnPassRate: number;
  averageWordErrorRate: number;
  bestWordErrorRate: number;
  fixtureId: string;
  passCount: number;
  passRate: number;
  reconnectSuccessRate: number;
  runCount: number;
  tags: string[];
  title: string;
  worstWordErrorRate: number;
};

export type VoiceSessionBenchmarkSeriesSummary = {
  adapterId: string;
  averageElapsedMs: number;
  averageFallbackReplayAudioMs: number;
  averagePassRate: number;
  averagePrimaryAudioMs: number;
  averageReconnectCount: number;
  averageRelativeCostUnits: number;
  averageTurnPassRate: number;
  averageWordErrorRate: number;
  flakyScenarioCount: number;
  generatedRunCount: number;
  reconnectCoverageRate: number;
  reconnectSuccessRate: number;
  scenarioCount: number;
  stableScenarioCount: number;
  totalPassCount: number;
  totalRunCount: number;
};

export type VoiceSessionBenchmarkSeriesReport = {
  adapterId: string;
  generatedAt: number;
  runCount: number;
  scenarios: VoiceSessionBenchmarkScenarioAggregate[];
  summary: VoiceSessionBenchmarkSeriesSummary;
};

const average = (values: number[]) =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const normalizeTurnText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const countPassedTurns = (turnResults: VoiceSessionBenchmarkTurnResult[]) =>
  turnResults.reduce((count, result) => count + (result.passes ? 1 : 0), 0);

const calculateTurnPassRate = (
  turnResults: VoiceSessionBenchmarkTurnResult[],
) =>
  turnResults.length > 0
    ? countPassedTurns(turnResults) / turnResults.length
    : 0;

const summarizeScenarioCosts = (
  turnResults: VoiceSessionBenchmarkTurnResult[],
) => {
  const costEstimates = turnResults
    .map((turn) => turn.quality?.cost)
    .filter((value): value is VoiceTurnCostEstimate => value !== undefined);

  return {
    averageRelativeCostUnits: roundMetric(
      average(
        costEstimates.map((estimate) => estimate.estimatedRelativeCostUnits),
      ),
    ),
    fallbackReplayAudioMs: roundMetric(
      average(costEstimates.map((estimate) => estimate.fallbackReplayAudioMs)),
      2,
    ),
    primaryAudioMs: roundMetric(
      average(costEstimates.map((estimate) => estimate.primaryAudioMs)),
      2,
    ),
  };
};

const roundMetric = (value: number, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const resolveBenchmarkFallbackConfig = (
  config?: VoiceSTTFallbackConfig,
): VoiceResolvedSTTFallbackConfig | undefined => {
  if (!config) {
    return undefined;
  }

  return {
    adapter: config.adapter,
    completionTimeoutMs: config.completionTimeoutMs ?? 2_500,
    confidenceThreshold: config.confidenceThreshold ?? 0.6,
    maxAttemptsPerTurn: config.maxAttemptsPerTurn ?? 1,
    minTextLength: config.minTextLength ?? 2,
    replayWindowMs: config.replayWindowMs ?? 8_000,
    settleMs: config.settleMs ?? 220,
    trigger: config.trigger ?? "empty-or-low-confidence",
  };
};

const chunkAudio = (audio: Uint8Array, bytesPerChunk: number) => {
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < audio.byteLength; offset += bytesPerChunk) {
    chunks.push(audio.slice(offset, offset + bytesPerChunk));
  }

  return chunks;
};

const createSilence = (byteLength: number) => new Uint8Array(byteLength);

const countUnexpectedDuplicateTurns = (
  actualTurns: string[],
  expectedTurns: string[],
) => {
  if (actualTurns.length <= expectedTurns.length) {
    return 0;
  }

  const expectedCounts = new Map<string, number>();
  for (const turn of expectedTurns) {
    const key = normalizeTurnText(turn);
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }

  const actualCounts = new Map<string, number>();
  for (const turn of actualTurns) {
    const key = normalizeTurnText(turn);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  let duplicates = 0;
  for (const [key, actualCount] of actualCounts.entries()) {
    const expectedCount = expectedCounts.get(key) ?? 0;
    const allowedOccurrences = Math.max(expectedCount, 1);
    if (actualCount > allowedOccurrences) {
      duplicates += actualCount - allowedOccurrences;
    }
  }

  return duplicates;
};

const normalizeSocketMessage = (data: string | Uint8Array | ArrayBuffer) => {
  if (typeof data !== "string") {
    return {
      byteLength:
        data instanceof ArrayBuffer ? data.byteLength : data.byteLength,
      kind: "binary",
    };
  }

  try {
    return JSON.parse(data) as VoiceServerMessage;
  } catch {
    return data;
  }
};

const createMockSocket = (
  onEvent?: (entry: Omit<VoiceSessionBenchmarkTraceEntry, "atMs">) => void,
): VoiceSocket => ({
  close: async (code, reason) => {
    onEvent?.({
      data: {
        code,
        reason,
      },
      phase: "socket.close",
    });
  },
  send: async (data) => {
    onEvent?.({
      data: normalizeSocketMessage(data),
      phase: "socket.send",
    });
  },
});

const waitForSessionIdle = async (
  session: ReturnType<typeof createVoiceSession>,
  settleMs: number,
  idleTimeoutMs: number,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < idleTimeoutMs) {
    const snapshot = await session.snapshot();
    const pendingText =
      snapshot.currentTurn.finalText || snapshot.currentTurn.partialText;
    const lastActivityAt = snapshot.lastActivityAt ?? snapshot.createdAt;

    if (!pendingText && Date.now() - lastActivityAt >= settleMs) {
      return;
    }

    await Bun.sleep(Math.min(100, settleMs));
  }
};

export const runVoiceSessionBenchmarkScenario = async (
  adapter: STTAdapter,
  fixture: VoiceSessionBenchmarkScenario,
  options: {
    correctTurn?: VoiceTurnCorrectionHandler;
    sttFallback?: VoiceSTTFallbackConfig;
    trace?: boolean;
  } = {},
): Promise<VoiceSessionBenchmarkScenarioResult> => {
  const store = createVoiceMemoryStore<VoiceSessionRecord>();
  const committedTurns: Array<{
    quality?: VoiceTranscriptQuality;
    text: string;
  }> = [];
  const traceStartedAt = Date.now();
  const trace: VoiceSessionBenchmarkTraceEntry[] = [];
  const pushTrace = (entry: Omit<VoiceSessionBenchmarkTraceEntry, "atMs">) => {
    if (!options.trace) {
      return;
    }

    trace.push({
      ...entry,
      atMs: Date.now() - traceStartedAt,
    });
  };
  const captureSnapshot = async (phase: string) => {
    if (!options.trace) {
      return;
    }

    const snapshot = await store.getOrCreate(`session-bench-${fixture.id}`);
    pushTrace({
      data: {
        currentTurn: {
          finalText: snapshot.currentTurn.finalText,
          lastAudioAt: snapshot.currentTurn.lastAudioAt,
          lastSpeechAt: snapshot.currentTurn.lastSpeechAt,
          lastTranscriptAt: snapshot.currentTurn.lastTranscriptAt,
          partialText: snapshot.currentTurn.partialText,
          silenceStartedAt: snapshot.currentTurn.silenceStartedAt,
          transcriptCount: snapshot.currentTurn.transcripts.length,
        },
        lastActivityAt: snapshot.lastActivityAt,
        status: snapshot.status,
        turns: snapshot.turns.map((turn) => turn.text),
      },
      phase,
    });
  };
  const logger: VoiceLogger = {
    debug: (message, meta) => {
      pushTrace({
        data: meta,
        phase: `logger.debug:${message}`,
      });
    },
    error: (message, meta) => {
      pushTrace({
        data: meta,
        phase: `logger.error:${message}`,
      });
    },
    info: (message, meta) => {
      pushTrace({
        data: meta,
        phase: `logger.info:${message}`,
      });
    },
    warn: (message, meta) => {
      pushTrace({
        data: meta,
        phase: `logger.warn:${message}`,
      });
    },
  };
  const session = createVoiceSession({
    audioConditioning: resolveAudioConditioningConfig(
      fixture.audioConditioning,
    ),
    context: {},
    id: `session-bench-${fixture.id}`,
    logger,
    reconnect: {
      maxAttempts: 2,
      strategy: "resume-last-turn",
      timeout: 5_000,
    },
    route: {
      correctTurn: options.correctTurn,
      onComplete: async () => {},
      onTurn: async ({ turn }) => {
        committedTurns.push({
          quality: turn.quality,
          text: turn.text,
        });
        pushTrace({
          data: {
            quality: turn.quality,
            text: turn.text,
            transcriptCount: turn.transcripts.length,
            turnId: turn.id,
          },
          phase: "route.onTurn",
        });
      },
    },
    phraseHints: fixture.phraseHints,
    socket: createMockSocket(pushTrace),
    store,
    stt: adapter,
    sttFallback: resolveBenchmarkFallbackConfig(options.sttFallback),
    sttLifecycle: fixture.sttLifecycle ?? "continuous",
    turnDetection: resolveTurnDetectionConfig({
      profile: fixture.turnProfile ?? "balanced",
      silenceMs: fixture.silenceMs ?? DEFAULT_SILENCE_MS,
      speechThreshold: fixture.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD,
      transcriptStabilityMs: fixture.transcriptStabilityMs ?? 900,
    }),
  });

  const startedAt = Date.now();
  const reconnectChunkIndices = [
    ...(fixture.reconnectAtChunkIndices ?? []),
    ...(fixture.reconnectAtChunkIndex !== undefined
      ? [fixture.reconnectAtChunkIndex]
      : []),
  ]
    .filter((value): value is number => Number.isFinite(value))
    .map((value) => Math.max(0, Math.floor(value)))
    .sort((left, right) => left - right);
  const reconnectPauseMsByIndex = fixture.reconnectPauseMsByIndex ?? [];
  let reconnectCount = 0;

  await session.connect(createMockSocket(pushTrace));
  await captureSnapshot("session.connected");

  try {
    const chunkDurationMs = fixture.chunkDurationMs ?? 100;
    const bytesPerMillisecond =
      (fixture.format.sampleRateHz * fixture.format.channels * 2) / 1_000;
    const bytesPerChunk = Math.max(
      2,
      Math.floor(bytesPerMillisecond * chunkDurationMs),
    );
    const chunks = chunkAudio(fixture.audio, bytesPerChunk);

    for (const [index, chunk] of chunks.entries()) {
      await session.receiveAudio(chunk);
      await Bun.sleep(chunkDurationMs);

      while (
        reconnectChunkIndices[reconnectCount] !== undefined &&
        index === reconnectChunkIndices[reconnectCount]
      ) {
        const reconnectPauseMs =
          reconnectPauseMsByIndex[reconnectCount] ??
          fixture.reconnectPauseMs ??
          150;
        reconnectCount += 1;
        pushTrace({
          data: {
            chunkIndex: index,
            reconnectCount,
            reconnectPauseMs,
          },
          phase: "reconnect.begin",
        });
        await captureSnapshot("reconnect.pre-disconnect");
        await session.disconnect({
          reason: "benchmark-reconnect",
          recoverable: true,
          type: "close",
        });
        await captureSnapshot("reconnect.post-disconnect");
        await Bun.sleep(reconnectPauseMs);
        await session.connect(createMockSocket(pushTrace));
        await captureSnapshot("reconnect.post-connect");
      }
    }

    const tailPaddingMs = fixture.tailPaddingMs ?? 1_200;
    if (tailPaddingMs > 0) {
      const tailBytes = Math.max(
        2,
        Math.floor(bytesPerMillisecond * tailPaddingMs),
      );
      for (const chunk of chunkAudio(createSilence(tailBytes), bytesPerChunk)) {
        await session.receiveAudio(chunk);
        await Bun.sleep(chunkDurationMs);
      }
    }

    await waitForSessionIdle(
      session,
      Math.max(
        1_200,
        (fixture.silenceMs ?? DEFAULT_SILENCE_MS) +
          (fixture.transcriptStabilityMs ?? 900),
      ),
      8_000,
    );
    await captureSnapshot("session.idle");
  } finally {
    await captureSnapshot("session.pre-close");
    await session.close("session-benchmark-complete");
  }

  const duplicateTurnCount = countUnexpectedDuplicateTurns(
    committedTurns.map((turn) => turn.text),
    fixture.expectedTurnTexts,
  );
  const turnResults: VoiceSessionBenchmarkTurnResult[] =
    fixture.expectedTurnTexts.map((expectedText, index) => {
      const actualTurn = committedTurns[index];
      const actualText = actualTurn?.text;
      if (!actualText) {
        return {
          actualText: "",
          expectedText,
          index,
          passes: false,
        };
      }

      const accuracy = scoreTranscriptAccuracy(
        actualText,
        expectedText,
        fixture.transcriptThreshold ?? 0.35,
      );

      return {
        actualText,
        accuracy,
        expectedText,
        index,
        passes: accuracy.passesThreshold,
        quality: actualTurn?.quality,
      };
    });

  for (
    let index = fixture.expectedTurnTexts.length;
    index < committedTurns.length;
    index += 1
  ) {
    turnResults.push({
      actualText: committedTurns[index]?.text ?? "",
      expectedText: undefined,
      index,
      passes: false,
      quality: committedTurns[index]?.quality,
    });
  }

  const turnCountDelta =
    committedTurns.length - fixture.expectedTurnTexts.length;
  const turnPassRate = calculateTurnPassRate(turnResults);
  const scenarioCosts = summarizeScenarioCosts(turnResults);

  return {
    actualTurns: committedTurns.map((turn) => turn.text),
    averageRelativeCostUnits: scenarioCosts.averageRelativeCostUnits,
    duplicateTurnCount,
    elapsedMs: Date.now() - startedAt,
    fallbackReplayAudioMs: scenarioCosts.fallbackReplayAudioMs,
    expectedReconnectCount: reconnectChunkIndices.length,
    expectedTurns: fixture.expectedTurnTexts,
    fixtureId: fixture.id,
    primaryAudioMs: scenarioCosts.primaryAudioMs,
    passes:
      duplicateTurnCount === 0 &&
      turnCountDelta === 0 &&
      turnResults.every((result) => result.passes),
    reconnectCount,
    reconnectTriggered: reconnectCount > 0,
    tags: fixture.tags ?? [],
    title: fixture.title,
    turnPassRate: roundMetric(turnPassRate),
    turnCountDelta,
    turnResults,
    trace: options.trace ? trace : undefined,
  };
};

export const summarizeVoiceSessionBenchmark = (
  adapterId: string,
  scenarios: VoiceSessionBenchmarkScenarioResult[],
): VoiceSessionBenchmarkSummary => {
  const passCount = scenarios.filter((scenario) => scenario.passes).length;
  const reconnectScenarios = scenarios.filter(
    (scenario) => scenario.expectedReconnectCount > 0,
  );
  const reconnectSuccessCount = reconnectScenarios.filter(
    (scenario) => scenario.passes,
  ).length;
  const expectedReconnectCount = scenarios.reduce(
    (sum, scenario) => sum + scenario.expectedReconnectCount,
    0,
  );
  const actualReconnectCount = scenarios.reduce(
    (sum, scenario) => sum + scenario.reconnectCount,
    0,
  );
  const turnAccuracies = scenarios.flatMap((scenario) =>
    scenario.turnResults
      .map((turn) => turn.accuracy?.wordErrorRate)
      .filter((value): value is number => typeof value === "number"),
  );

  return {
    adapterId,
    averageElapsedMs: roundMetric(
      average(scenarios.map((scenario) => scenario.elapsedMs)),
      2,
    ),
    averageFallbackReplayAudioMs: roundMetric(
      average(scenarios.map((scenario) => scenario.fallbackReplayAudioMs)),
      2,
    ),
    averagePrimaryAudioMs: roundMetric(
      average(scenarios.map((scenario) => scenario.primaryAudioMs)),
      2,
    ),
    averageReconnectCount: roundMetric(
      average(scenarios.map((scenario) => scenario.reconnectCount)),
    ),
    averageRelativeCostUnits: roundMetric(
      average(scenarios.map((scenario) => scenario.averageRelativeCostUnits)),
    ),
    averageTurnPassRate: roundMetric(
      average(scenarios.map((scenario) => scenario.turnPassRate)),
    ),
    averageWordErrorRate: roundMetric(average(turnAccuracies)),
    duplicateTurnRate: roundMetric(
      scenarios.length > 0
        ? scenarios.filter((scenario) => scenario.duplicateTurnCount > 0)
            .length / scenarios.length
        : 0,
    ),
    passCount,
    passRate: roundMetric(
      scenarios.length > 0 ? passCount / scenarios.length : 0,
    ),
    reconnectCoverageRate: roundMetric(
      expectedReconnectCount > 0
        ? actualReconnectCount / expectedReconnectCount
        : 1,
    ),
    reconnectSuccessRate: roundMetric(
      reconnectScenarios.length > 0
        ? reconnectSuccessCount / reconnectScenarios.length
        : 1,
    ),
    scenarioCount: scenarios.length,
    scenariosWithDuplicateTurns: scenarios.filter(
      (scenario) => scenario.duplicateTurnCount > 0,
    ).length,
    scenariosWithTurnCountMismatch: scenarios.filter(
      (scenario) => scenario.turnCountDelta !== 0,
    ).length,
  };
};

export const summarizeVoiceSessionBenchmarkSeries = (input: {
  adapterId: string;
  reports: VoiceSessionBenchmarkReport[];
}): VoiceSessionBenchmarkSeriesReport => {
  const scenarioMap = new Map<string, VoiceSessionBenchmarkScenarioResult[]>();

  for (const report of input.reports) {
    for (const scenario of report.scenarios) {
      const entries = scenarioMap.get(scenario.fixtureId) ?? [];
      entries.push(scenario);
      scenarioMap.set(scenario.fixtureId, entries);
    }
  }

  const scenarioAggregates = [...scenarioMap.entries()].map(
    ([fixtureId, results]) => {
      const wordErrorRates = results.flatMap((scenario) =>
        scenario.turnResults
          .map((turn) => turn.accuracy?.wordErrorRate)
          .filter((value): value is number => typeof value === "number"),
      );
      const reconnectRuns = results.filter(
        (scenario) => scenario.reconnectTriggered,
      );
      const passCount = results.filter((scenario) => scenario.passes).length;
      const sample = results[0]!;

      return {
        averageElapsedMs: roundMetric(
          average(results.map((scenario) => scenario.elapsedMs)),
          2,
        ),
        averageFallbackReplayAudioMs: roundMetric(
          average(results.map((scenario) => scenario.fallbackReplayAudioMs)),
          2,
        ),
        averagePrimaryAudioMs: roundMetric(
          average(results.map((scenario) => scenario.primaryAudioMs)),
          2,
        ),
        averageReconnectCount: roundMetric(
          average(results.map((scenario) => scenario.reconnectCount)),
        ),
        averageRelativeCostUnits: roundMetric(
          average(results.map((scenario) => scenario.averageRelativeCostUnits)),
        ),
        averageTurnPassRate: roundMetric(
          average(results.map((scenario) => scenario.turnPassRate)),
        ),
        averageWordErrorRate: roundMetric(average(wordErrorRates)),
        bestWordErrorRate: roundMetric(
          wordErrorRates.length > 0 ? Math.min(...wordErrorRates) : 0,
        ),
        fixtureId,
        passCount,
        passRate: roundMetric(
          results.length > 0 ? passCount / results.length : 0,
        ),
        reconnectSuccessRate: roundMetric(
          reconnectRuns.length > 0
            ? reconnectRuns.filter((scenario) => scenario.passes).length /
                reconnectRuns.length
            : 1,
        ),
        runCount: results.length,
        tags: sample.tags,
        title: sample.title,
        worstWordErrorRate: roundMetric(
          wordErrorRates.length > 0 ? Math.max(...wordErrorRates) : 0,
        ),
      } satisfies VoiceSessionBenchmarkScenarioAggregate;
    },
  );

  const totalRunCount = input.reports.reduce(
    (sum, report) => sum + report.scenarios.length,
    0,
  );
  const totalPassCount = input.reports.reduce(
    (sum, report) => sum + report.summary.passCount,
    0,
  );
  const reconnectRates = scenarioAggregates
    .map((scenario) => scenario.reconnectSuccessRate)
    .filter((value) => Number.isFinite(value));
  const reconnectCoverageRates = input.reports
    .map((report) => report.summary.reconnectCoverageRate)
    .filter((value) => Number.isFinite(value));

  return {
    adapterId: input.adapterId,
    generatedAt: Date.now(),
    runCount: input.reports.length,
    scenarios: scenarioAggregates,
    summary: {
      adapterId: input.adapterId,
      averageElapsedMs: roundMetric(
        average(
          scenarioAggregates.map((scenario) => scenario.averageElapsedMs),
        ),
        2,
      ),
      averageFallbackReplayAudioMs: roundMetric(
        average(
          scenarioAggregates.map(
            (scenario) => scenario.averageFallbackReplayAudioMs,
          ),
        ),
        2,
      ),
      averagePassRate: roundMetric(
        average(scenarioAggregates.map((scenario) => scenario.passRate)),
      ),
      averagePrimaryAudioMs: roundMetric(
        average(
          scenarioAggregates.map((scenario) => scenario.averagePrimaryAudioMs),
        ),
        2,
      ),
      averageReconnectCount: roundMetric(
        average(
          scenarioAggregates.map((scenario) => scenario.averageReconnectCount),
        ),
      ),
      averageRelativeCostUnits: roundMetric(
        average(
          scenarioAggregates.map(
            (scenario) => scenario.averageRelativeCostUnits,
          ),
        ),
      ),
      averageTurnPassRate: roundMetric(
        average(
          scenarioAggregates.map((scenario) => scenario.averageTurnPassRate),
        ),
      ),
      averageWordErrorRate: roundMetric(
        average(
          scenarioAggregates.map((scenario) => scenario.averageWordErrorRate),
        ),
      ),
      flakyScenarioCount: scenarioAggregates.filter(
        (scenario) => scenario.passRate > 0 && scenario.passRate < 1,
      ).length,
      generatedRunCount: input.reports.length,
      reconnectCoverageRate: roundMetric(average(reconnectCoverageRates)),
      reconnectSuccessRate: roundMetric(average(reconnectRates)),
      scenarioCount: scenarioAggregates.length,
      stableScenarioCount: scenarioAggregates.filter(
        (scenario) => scenario.passRate === 1,
      ).length,
      totalPassCount,
      totalRunCount,
    },
  } satisfies VoiceSessionBenchmarkSeriesReport;
};

export const runVoiceSessionBenchmark = async (input: {
  adapter: STTAdapter;
  adapterId: string;
  correctTurn?: VoiceTurnCorrectionHandler;
  scenarios: VoiceSessionBenchmarkScenario[];
  sttFallback?: VoiceSTTFallbackConfig;
  trace?: boolean;
}) => {
  const scenarioResults: VoiceSessionBenchmarkScenarioResult[] = [];

  for (const scenario of input.scenarios) {
    scenarioResults.push(
      await runVoiceSessionBenchmarkScenario(input.adapter, scenario, {
        correctTurn: input.correctTurn,
        sttFallback: input.sttFallback,
        trace: input.trace,
      }),
    );
  }

  return {
    adapterId: input.adapterId,
    generatedAt: Date.now(),
    scenarios: scenarioResults,
    summary: summarizeVoiceSessionBenchmark(input.adapterId, scenarioResults),
  } satisfies VoiceSessionBenchmarkReport;
};

export const runVoiceSessionBenchmarkSeries = async (input: {
  adapter: STTAdapter;
  adapterId: string;
  correctTurn?: VoiceTurnCorrectionHandler;
  runs: number;
  scenarios: VoiceSessionBenchmarkScenario[];
  sttFallback?: VoiceSTTFallbackConfig;
  trace?: boolean;
}) => {
  const reports: VoiceSessionBenchmarkReport[] = [];
  const runCount = Math.max(1, Math.floor(input.runs));

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    reports.push(
      await runVoiceSessionBenchmark({
        adapter: input.adapter,
        adapterId: input.adapterId,
        correctTurn: input.correctTurn,
        scenarios: input.scenarios,
        sttFallback: input.sttFallback,
        trace: input.trace,
      }),
    );
  }

  return summarizeVoiceSessionBenchmarkSeries({
    adapterId: input.adapterId,
    reports,
  });
};
