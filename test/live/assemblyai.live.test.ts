import { describe, expect, test } from "bun:test";
import { assemblyai } from "../../../voice-adapters/assemblyai/src";
import { loadVoiceTestFixtures } from "../../src/testing/fixtures";
import { runSTTAdapterFixture } from "../../src/testing/stt";
import { loadVoiceTestEnv } from "./env";

describe("assemblyai live fixtures", async () => {
  const env = await loadVoiceTestEnv();
  const apiKey = env.ASSEMBLYAI_API_KEY;
  const fixtures = await loadVoiceTestFixtures();
  const selectedFixtures = fixtures.filter((fixture) =>
    ["quietly-alone-clean", "rainstorms-noisy"].includes(fixture.id),
  );

  if (!apiKey) {
    test.skip("requires ASSEMBLYAI_API_KEY in voice/.env", () => {});
    return;
  }

  const adapter = assemblyai({
    apiKey,
    endOfTurnConfidenceThreshold: 0.55,
    formatTurns: true,
    maxTurnSilence: 4_000,
    minEndOfTurnSilenceWhenConfident: 1_200,
    speechModel: "u3-rt-pro",
  });

  for (const fixture of selectedFixtures) {
    test(`transcribes ${fixture.id}`, async () => {
      const result = await runSTTAdapterFixture(adapter, fixture, {
        idleTimeoutMs: 10_000,
        settleMs: 1_000,
        tailPaddingMs: 1_500,
        transcriptThreshold: fixture.id === "rainstorms-noisy" ? 0.5 : 0.3,
        waitForRealtimeMs: 100,
      });

      expect(result.errorEvents).toHaveLength(0);
      expect(result.finalText.length).toBeGreaterThan(0);
      expect(result.accuracy.passesThreshold).toBe(true);
    }, 20_000);
  }
});
