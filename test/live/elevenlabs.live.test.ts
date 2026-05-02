import { describe, expect, test } from "bun:test";
import { elevenlabs } from "../../../voice-adapters/elevenlabs/src";
import { loadVoiceTestEnv } from "./env";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

describe("elevenlabs live tts", async () => {
  const env = await loadVoiceTestEnv();
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId =
    (env as Record<string, string | undefined>).ELEVENLABS_VOICE_ID ??
    DEFAULT_VOICE_ID;

  if (!apiKey) {
    test.skip("requires ELEVENLABS_API_KEY in voice/.env", () => {});
    return;
  }

  test("streams pcm audio for a short utterance", async () => {
    const adapter = elevenlabs({
      apiKey,
      modelId: "eleven_flash_v2_5",
      outputFormat: "pcm_16000",
      voiceId,
    });
    const session = await adapter.open({
      sessionId: "elevenlabs-live-test",
    });
    const audioChunks: Uint8Array[] = [];
    const errors: string[] = [];
    const unsubscribers = [
      session.on("audio", (event) => {
        audioChunks.push(
          event.chunk instanceof Uint8Array
            ? event.chunk
            : new Uint8Array(
                event.chunk.buffer,
                event.chunk.byteOffset,
                event.chunk.byteLength,
              ),
        );
        expect(event.format.sampleRateHz).toBe(16000);
        expect(event.format.encoding).toBe("pcm_s16le");
      }),
      session.on("error", (event) => {
        errors.push(event.error.message);
      }),
    ];

    try {
      await session.send("This is a short ElevenLabs voice adapter test.");
    } finally {
      await session.close();
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }

    const totalBytes = audioChunks.reduce(
      (sum, chunk) => sum + chunk.byteLength,
      0,
    );

    expect(errors).toHaveLength(0);
    expect(audioChunks.length).toBeGreaterThan(0);
    expect(totalBytes).toBeGreaterThan(2048);
  }, 20_000);
});
