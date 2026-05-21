export type VoiceAgentUIState = "idle" | "listening" | "speaking" | "thinking";

export type VoiceAgentUIInput = {
  hasActivePartial: boolean;
  isConnected: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  lastAssistantAt?: number;
  lastTranscriptAt?: number;
};

export const voiceAgentUIStateOrder: ReadonlyArray<VoiceAgentUIState> = [
  "idle",
  "listening",
  "thinking",
  "speaking",
];
export const deriveVoiceAgentUIState = (
  input: VoiceAgentUIInput,
): VoiceAgentUIState => {
  if (!input.isConnected) {
    return "idle";
  }
  if (input.isPlaying) {
    return "speaking";
  }
  if (input.isRecording && input.hasActivePartial) {
    return "listening";
  }
  if (input.isRecording) {
    return "listening";
  }
  if (input.lastTranscriptAt && !input.lastAssistantAt) {
    return "thinking";
  }
  if (
    input.lastTranscriptAt &&
    input.lastAssistantAt &&
    input.lastTranscriptAt > input.lastAssistantAt
  ) {
    return "thinking";
  }

  return "idle";
};
export const describeVoiceAgentUIState = (state: VoiceAgentUIState): string => {
  switch (state) {
    case "idle":
      return "Idle";
    case "listening":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "thinking":
      return "Thinking";
  }
};
