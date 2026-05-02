import type {
  VoiceResolvedTurnDetectionConfig,
  VoiceTurnDetectionConfig,
  VoiceTurnQualityProfile,
  VoiceTurnProfile,
} from "./types";

export const TURN_PROFILE_DEFAULTS: Record<
  VoiceTurnProfile,
  Omit<VoiceResolvedTurnDetectionConfig, "profile">
> = {
  balanced: {
    qualityProfile: "general",
    silenceMs: 1_400,
    speechThreshold: 0.012,
    transcriptStabilityMs: 1_000,
  },
  fast: {
    qualityProfile: "general",
    silenceMs: 700,
    speechThreshold: 0.015,
    transcriptStabilityMs: 450,
  },
  "long-form": {
    qualityProfile: "general",
    silenceMs: 2_200,
    speechThreshold: 0.01,
    transcriptStabilityMs: 1_500,
  },
};

export const QUALITY_PROFILE_DEFAULTS: Record<
  VoiceTurnQualityProfile,
  Partial<VoiceResolvedTurnDetectionConfig>
> = {
  general: {},
  "accent-heavy": {
    silenceMs: 1_200,
    speechThreshold: 0.01,
    transcriptStabilityMs: 1_200,
  },
  "noisy-room": {
    silenceMs: 2_000,
    speechThreshold: 0.02,
    transcriptStabilityMs: 1_600,
  },
  "short-command": {
    silenceMs: 500,
    speechThreshold: 0.016,
    transcriptStabilityMs: 420,
  },
};

export const DEFAULT_TURN_PROFILE: VoiceTurnProfile = "fast";
export const DEFAULT_QUALITY_PROFILE: VoiceTurnQualityProfile = "general";

export const resolveTurnDetectionConfig = (
  config?: VoiceTurnDetectionConfig,
): VoiceResolvedTurnDetectionConfig => {
  const profile = config?.profile ?? DEFAULT_TURN_PROFILE;
  const qualityProfile = config?.qualityProfile ?? DEFAULT_QUALITY_PROFILE;
  const preset = TURN_PROFILE_DEFAULTS[profile];
  const quality = QUALITY_PROFILE_DEFAULTS[qualityProfile];

  return {
    profile,
    qualityProfile,
    silenceMs: config?.silenceMs ?? quality.silenceMs ?? preset.silenceMs,
    speechThreshold:
      config?.speechThreshold ??
      quality.speechThreshold ??
      preset.speechThreshold,
    transcriptStabilityMs:
      config?.transcriptStabilityMs ??
      quality.transcriptStabilityMs ??
      preset.transcriptStabilityMs,
  };
};
