import { describe, expect, test } from "bun:test";
import {
  describeVoiceAgentUIState,
  deriveVoiceAgentUIState,
} from "../src/core/agentState";

describe("deriveVoiceAgentUIState", () => {
  test("returns idle when not connected", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: false,
        isConnected: false,
        isPlaying: false,
        isRecording: false,
      }),
    ).toBe("idle");
  });

  test("returns speaking when audio is playing", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: false,
        isConnected: true,
        isPlaying: true,
        isRecording: false,
      }),
    ).toBe("speaking");
  });

  test("returns listening when recording is active", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: true,
        isConnected: true,
        isPlaying: false,
        isRecording: true,
      }),
    ).toBe("listening");
  });

  test("returns thinking after a final transcript landed and no assistant reply yet", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: false,
        isConnected: true,
        isPlaying: false,
        isRecording: false,
        lastTranscriptAt: 1_000,
      }),
    ).toBe("thinking");
  });

  test("returns thinking when transcript is newer than last assistant audio", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: false,
        isConnected: true,
        isPlaying: false,
        isRecording: false,
        lastAssistantAt: 500,
        lastTranscriptAt: 1_000,
      }),
    ).toBe("thinking");
  });

  test("returns idle once the assistant has finished speaking and no new transcript landed", () => {
    expect(
      deriveVoiceAgentUIState({
        hasActivePartial: false,
        isConnected: true,
        isPlaying: false,
        isRecording: false,
        lastAssistantAt: 2_000,
        lastTranscriptAt: 1_000,
      }),
    ).toBe("idle");
  });
});

describe("describeVoiceAgentUIState", () => {
  test("returns a human-readable label for each state", () => {
    expect(describeVoiceAgentUIState("listening")).toBe("Listening");
    expect(describeVoiceAgentUIState("idle")).toBe("Idle");
  });
});
