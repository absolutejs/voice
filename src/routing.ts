import {
  createPhraseHintCorrectionHandler,
  createRiskyTurnCorrectionHandler,
} from "./correction";
import type {
  VoiceSTTRoutingCorrectionMode,
  VoiceSTTRoutingGoal,
  VoiceSTTRoutingStrategy,
  VoiceTurnCorrectionHandler,
} from "./types";

export const resolveVoiceSTTRoutingStrategy = (
  goal: VoiceSTTRoutingGoal = "best",
): VoiceSTTRoutingStrategy => {
  if (goal === "low-cost") {
    return {
      benchmarkSessionTarget: "deepgram-flux",
      correctionMode: "none",
      goal,
      notes: [
        "Uses the cheapest in-package path: one primary STT pass with no correction hook.",
        "Good for baseline throughput and lower post-processing overhead.",
      ],
      preset: "default",
      sttLifecycle: "turn-scoped",
    };
  }

  return {
    benchmarkSessionTarget: "deepgram-corrected",
    correctionMode: "generic",
    goal,
    notes: [
      "Uses the current best in-package path: Deepgram Flux with generic deterministic correction.",
      "Optimized for accuracy and robustness rather than minimum processing cost.",
    ],
    preset: "reliability",
    sttLifecycle: "continuous",
  };
};

export const createVoiceSTTRoutingCorrectionHandler = (
  mode: VoiceSTTRoutingCorrectionMode = "generic",
): VoiceTurnCorrectionHandler | undefined => {
  if (mode === "none") {
    return undefined;
  }

  if (mode === "risky-turn") {
    return createRiskyTurnCorrectionHandler();
  }

  return createPhraseHintCorrectionHandler();
};
