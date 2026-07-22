export type VoiceSTTRoutingFixture = {
  fallbackScore: number;
  fallbackUsed: boolean;
  id: string;
  primaryScore: number;
};

export type VoiceSTTRoutingBenchmarkReport = {
  fallbackAttemptRate: number;
  fallbackHarmRate: number;
  fallbackImprovementRate: number;
  fixtureCount: number;
  oracleScore: number;
  primaryScore: number;
  selectedScore: number;
};

export const evaluateVoiceSTTRouting = (
  fixtures: VoiceSTTRoutingFixture[],
): VoiceSTTRoutingBenchmarkReport => {
  const attempted = fixtures.filter((fixture) => fixture.fallbackUsed);
  const improved = attempted.filter(
    (fixture) => fixture.fallbackScore > fixture.primaryScore,
  );
  const harmed = attempted.filter(
    (fixture) => fixture.fallbackScore < fixture.primaryScore,
  );
  const average = (values: number[]) =>
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return {
    fallbackAttemptRate:
      fixtures.length > 0 ? attempted.length / fixtures.length : 0,
    fallbackHarmRate: attempted.length > 0 ? harmed.length / attempted.length : 0,
    fallbackImprovementRate:
      attempted.length > 0 ? improved.length / attempted.length : 0,
    fixtureCount: fixtures.length,
    oracleScore: average(
      fixtures.map((fixture) =>
        Math.max(fixture.primaryScore, fixture.fallbackScore),
      ),
    ),
    primaryScore: average(fixtures.map((fixture) => fixture.primaryScore)),
    selectedScore: average(
      fixtures.map((fixture) =>
        fixture.fallbackUsed ? fixture.fallbackScore : fixture.primaryScore,
      ),
    ),
  };
};
