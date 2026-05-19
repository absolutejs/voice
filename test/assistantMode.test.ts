import { describe, expect, test } from "bun:test";
import {
  describeVoiceAssistantMode,
  resolveVoiceAssistantMode,
} from "../src/assistantMode";

describe("resolveVoiceAssistantMode", () => {
  test("returns 's2s' when only a realtime adapter is configured", () => {
    expect(
      resolveVoiceAssistantMode({
        realtime: { kind: "realtime", open: async () => ({}) as never },
      }),
    ).toBe("s2s");
  });

  test("returns 'cascade' when only stt/tts adapters are configured", () => {
    expect(
      resolveVoiceAssistantMode({
        stt: { kind: "stt", open: async () => ({}) as never },
        tts: { kind: "tts", open: async () => ({}) as never },
      }),
    ).toBe("cascade");
  });

  test("explicit assistantMode override wins over adapter shape", () => {
    expect(
      resolveVoiceAssistantMode({
        assistantMode: "cascade",
        realtime: { kind: "realtime", open: async () => ({}) as never },
      }),
    ).toBe("cascade");
  });
});

describe("describeVoiceAssistantMode", () => {
  test("returns hasRealtime/hasSTT/hasTTS booleans alongside the resolved mode", () => {
    const descriptor = describeVoiceAssistantMode({
      realtime: { kind: "realtime", open: async () => ({}) as never },
      tts: { kind: "tts", open: async () => ({}) as never },
    });
    expect(descriptor.mode).toBe("s2s");
    expect(descriptor.hasRealtime).toBe(true);
    expect(descriptor.hasTTS).toBe(true);
    expect(descriptor.hasSTT).toBe(false);
    expect(descriptor.modalities).toContain("audio");
  });

  test("deduplicates and preserves caller-supplied modalities", () => {
    const descriptor = describeVoiceAssistantMode({
      modalities: ["text", "audio", "text"],
      realtime: { kind: "realtime", open: async () => ({}) as never },
    });
    expect(descriptor.modalities.sort()).toEqual(["audio", "text"]);
  });
});
