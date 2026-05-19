import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computePcmDurationMs,
  createVoiceMemoryRecordingStore,
  encodePcmAsWav,
} from "../src/recordingStore";
import { createVoiceFileRecordingStore } from "../src/fileStore";
import type { AudioFormat } from "../src/types";

const PCM_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

const buildPcm = (samples: number) => {
  const out = new Uint8Array(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const value = (index % 32768) * 2;
    out[index * 2] = value & 0xff;
    out[index * 2 + 1] = (value >> 8) & 0xff;
  }
  return out;
};

describe("encodePcmAsWav", () => {
  test("prepends a valid RIFF/WAVE header", () => {
    const pcm = buildPcm(1600);
    const wav = encodePcmAsWav(pcm, PCM_FORMAT);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
    const decoder = new TextDecoder("ascii");
    expect(decoder.decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(decoder.decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(decoder.decode(wav.subarray(12, 16))).toBe("fmt ");
    expect(decoder.decode(wav.subarray(36, 40))).toBe("data");
    const view = new DataView(
      wav.buffer,
      wav.byteOffset,
      wav.byteLength,
    );
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
  });

  test("rejects non-pcm_s16le formats", () => {
    expect(() =>
      encodePcmAsWav(new Uint8Array(2), {
        channels: 1,
        container: "raw",
        encoding: "pcm_f32le",
        sampleRateHz: 16_000,
      } as AudioFormat),
    ).toThrow();
  });
});

describe("computePcmDurationMs", () => {
  test("returns millisecond duration for 16k mono pcm_s16le", () => {
    expect(computePcmDurationMs(32_000, PCM_FORMAT)).toBe(1_000);
    expect(computePcmDurationMs(8_000, PCM_FORMAT)).toBe(250);
  });
});

describe("createVoiceMemoryRecordingStore", () => {
  test("round-trips an artifact", async () => {
    const store = createVoiceMemoryRecordingStore();
    const pcm = buildPcm(800);
    const stored = await store.put({
      audioBytes: pcm,
      capturedAt: 123,
      channel: "assistant",
      durationMs: 50,
      format: PCM_FORMAT,
      sessionId: "session-1",
    });
    expect(stored.recordingUrl).toBe(
      "memory://recording/session-1/assistant.wav",
    );
    const fetched = await store.get("session-1", "assistant");
    expect(fetched?.audioBytes.byteLength).toBe(pcm.byteLength);
    const list = await store.list("session-1");
    expect(list).toHaveLength(1);
  });
});

describe("createVoiceFileRecordingStore", () => {
  test("writes a wav file and metadata sidecar that can be read back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voice-recording-"));
    try {
      const store = createVoiceFileRecordingStore({ directory: dir });
      const pcm = buildPcm(800);
      const stored = await store.put({
        audioBytes: pcm,
        capturedAt: 200,
        channel: "user",
        durationMs: 50,
        format: PCM_FORMAT,
        sessionId: "sess-A",
      });
      expect(stored.recordingUrl).toMatch(/^file:\/\/.+sess-A_user\.wav$/);
      const fetched = await store.get("sess-A", "user");
      expect(fetched?.durationMs).toBe(50);
      expect(fetched?.audioBytes.byteLength).toBe(44 + pcm.byteLength);
      const decoder = new TextDecoder("ascii");
      expect(decoder.decode(fetched!.audioBytes.subarray(0, 4))).toBe("RIFF");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
