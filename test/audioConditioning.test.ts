import { expect, test } from "bun:test";
import {
  conditionAudioChunk,
  resolveAudioConditioningConfig,
} from "../src/audioConditioning";
import {
  resolveTurnDetectionConfig,
  TURN_PROFILE_DEFAULTS,
} from "../src/turnProfiles";

const toSamples = (audio: ArrayBuffer | ArrayBufferView) =>
  new Int16Array(
    audio instanceof ArrayBuffer ? audio : audio.buffer,
    audio instanceof ArrayBuffer ? 0 : audio.byteOffset,
    Math.floor(
      (audio instanceof ArrayBuffer ? audio.byteLength : audio.byteLength) / 2,
    ),
  );

test("resolveTurnDetectionConfig applies long-form profile defaults", () => {
  const config = resolveTurnDetectionConfig({
    profile: "long-form",
  });

  expect(config).toEqual({
    profile: "long-form",
    ...TURN_PROFILE_DEFAULTS["long-form"],
  });
});

test("resolveTurnDetectionConfig lets overrides win over preset defaults", () => {
  const config = resolveTurnDetectionConfig({
    profile: "balanced",
    silenceMs: 900,
  });

  expect(config.profile).toBe("balanced");
  expect(config.silenceMs).toBe(900);
  expect(config.transcriptStabilityMs).toBe(
    TURN_PROFILE_DEFAULTS.balanced.transcriptStabilityMs,
  );
});

test("conditionAudioChunk boosts low-level speech when conditioning is enabled", () => {
  const config = resolveAudioConditioningConfig({
    maxGain: 4,
    targetLevel: 0.1,
  });
  const source = new Int16Array(160).fill(1_000);
  const conditioned = conditionAudioChunk(source, config);

  expect(config).toBeDefined();
  expect(toSamples(conditioned)[0]).toBeGreaterThan(source[0]!);
});

test("conditionAudioChunk attenuates below-threshold noise", () => {
  const config = resolveAudioConditioningConfig({
    noiseGateAttenuation: 0,
    noiseGateThreshold: 0.05,
    targetLevel: 0.08,
  });
  const source = new Int16Array(160).fill(400);
  const conditioned = conditionAudioChunk(source, config);

  expect(
    Array.from(toSamples(conditioned)).every((sample) => sample === 0),
  ).toBe(true);
});
