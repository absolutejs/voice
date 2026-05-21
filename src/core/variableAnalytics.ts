export type VoiceAnalyticsVariableValue = string | number | boolean | null;

export type VoiceAnalyticsCall = {
  sessionId: string;
  variables: Record<string, VoiceAnalyticsVariableValue>;
  durationSeconds?: number;
  costUsd?: number;
  outcome?: string;
  success?: boolean;
  at?: number;
};

export type VoiceVariableValueStats = {
  value: string;
  count: number;
  share: number;
  successRate: number | null;
  avgDurationSeconds: number | null;
  avgCostUsd: number | null;
  outcomes: Record<string, number>;
};

export type VoiceVariableBreakdown = {
  variable: string;
  distinctValues: number;
  missingCount: number;
  values: VoiceVariableValueStats[];
};

export type VoiceVariableAnalyticsReport = {
  totalCalls: number;
  overall: {
    successRate: number | null;
    avgDurationSeconds: number | null;
    avgCostUsd: number | null;
  };
  byVariable: Record<string, VoiceVariableBreakdown>;
};

export type BuildVoiceVariableAnalyticsInput = {
  calls: ReadonlyArray<VoiceAnalyticsCall>;
  /** Variable keys to break analytics down by. */
  variables: ReadonlyArray<string>;
  /**
   * Treat these outcome strings as successes when a call has no explicit
   * `success` flag. Case-insensitive.
   */
  successOutcomes?: ReadonlyArray<string>;
  /** Cap the values returned per variable (highest count first). */
  topValuesPerVariable?: number;
};

const stringifyValue = (value: VoiceAnalyticsVariableValue): string => {
  if (value === null || value === undefined) return "(none)";

  return String(value);
};

const mean = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const successRateFor = (
  calls: ReadonlyArray<VoiceAnalyticsCall>,
  successOutcomes: Set<string>,
): number | null => {
  const flagged = calls.filter(
    (call) => call.success !== undefined || call.outcome !== undefined,
  );
  if (flagged.length === 0) return null;
  const successes = flagged.filter((call) =>
    call.success !== undefined
      ? call.success
      : call.outcome !== undefined &&
        successOutcomes.has(call.outcome.toLowerCase()),
  ).length;

  return successes / flagged.length;
};

export const buildVoiceVariableAnalytics = (
  input: BuildVoiceVariableAnalyticsInput,
): VoiceVariableAnalyticsReport => {
  const successOutcomes = new Set(
    (
      input.successOutcomes ?? [
        "won",
        "resolved",
        "qualified",
        "completed",
        "booked",
      ]
    ).map((outcome) => outcome.toLowerCase()),
  );
  const totalCalls = input.calls.length;

  const overall = {
    avgCostUsd: mean(
      input.calls
        .map((call) => call.costUsd)
        .filter((cost): cost is number => typeof cost === "number"),
    ),
    avgDurationSeconds: mean(
      input.calls
        .map((call) => call.durationSeconds)
        .filter((duration): duration is number => typeof duration === "number"),
    ),
    successRate: successRateFor(input.calls, successOutcomes),
  };

  const byVariable: Record<string, VoiceVariableBreakdown> = {};

  for (const variable of input.variables) {
    const groups = new Map<string, VoiceAnalyticsCall[]>();
    let missingCount = 0;
    for (const call of input.calls) {
      const raw = call.variables[variable];
      if (raw === undefined || raw === null) {
        missingCount += 1;
        continue;
      }
      const key = stringifyValue(raw);
      const bucket = groups.get(key) ?? [];
      bucket.push(call);
      groups.set(key, bucket);
    }

    let values: VoiceVariableValueStats[] = [];
    for (const [value, calls] of groups) {
      const outcomes: Record<string, number> = {};
      for (const call of calls) {
        if (call.outcome) {
          outcomes[call.outcome] = (outcomes[call.outcome] ?? 0) + 1;
        }
      }
      values.push({
        avgCostUsd: mean(
          calls
            .map((call) => call.costUsd)
            .filter((cost): cost is number => typeof cost === "number"),
        ),
        avgDurationSeconds: mean(
          calls
            .map((call) => call.durationSeconds)
            .filter((d): d is number => typeof d === "number"),
        ),
        count: calls.length,
        outcomes,
        share: totalCalls === 0 ? 0 : calls.length / totalCalls,
        successRate: successRateFor(calls, successOutcomes),
        value,
      });
    }
    values.sort((left, right) => right.count - left.count);
    if (input.topValuesPerVariable !== undefined) {
      values = values.slice(0, input.topValuesPerVariable);
    }

    byVariable[variable] = {
      distinctValues: groups.size,
      missingCount,
      values,
      variable,
    };
  }

  return { byVariable, overall, totalCalls };
};
