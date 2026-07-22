import type { VoiceSTTBenchmarkFixtureResult } from "./benchmark";

export type VoiceBenchmarkOutcomeSummary = {
  completeRequiredProfileRate: number;
  costPerPassingFixture?: number;
  fixtureCount: number;
  passingFixtureCount: number;
  requiredFieldAccuracy: number;
  totalCost?: number;
};

export const summarizeVoiceBenchmarkOutcomes = (
  fixtures: VoiceSTTBenchmarkFixtureResult[],
  costs?: { total: number },
): VoiceBenchmarkOutcomeSummary => {
  const critical = fixtures
    .map((fixture) => fixture.criticalFields)
    .filter((value) => value !== undefined);
  const passingFixtureCount = fixtures.filter((fixture) => fixture.passes).length;
  const requiredFields = critical.flatMap((value) =>
    value!.fields.filter((field) => field.required),
  );
  const completeRequiredProfileRate =
    critical.length > 0
      ? critical.filter((value) => value!.passesRequired).length /
        critical.length
      : 1;
  return {
    completeRequiredProfileRate,
    costPerPassingFixture:
      costs && passingFixtureCount > 0
        ? costs.total / passingFixtureCount
        : undefined,
    fixtureCount: fixtures.length,
    passingFixtureCount,
    requiredFieldAccuracy:
      requiredFields.length > 0
        ? requiredFields.filter((field) => field.matched).length /
          requiredFields.length
        : 1,
    totalCost: costs?.total,
  };
};
