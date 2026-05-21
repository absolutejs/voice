import { describe, expect, test } from "bun:test";
import {
  encodeStereoWav,
  interleaveStereoPcm,
} from "../src/core/recordingStore";
import type { AudioFormat } from "../src/core/types";

const MONO_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 16_000,
};

const buildMonoPcm = (samples: number[]) => {
  const out = new Int16Array(samples);
  return new Uint8Array(out.buffer);
};

describe("interleaveStereoPcm", () => {
  test("interleaves left/right samples into LRLR order", () => {
    const left = buildMonoPcm([1, 2, 3]);
    const right = buildMonoPcm([4, 5, 6]);
    const out = interleaveStereoPcm({ left, right });
    const samples = new Int16Array(
      out.buffer,
      out.byteOffset,
      out.byteLength / 2,
    );
    expect(Array.from(samples)).toEqual([1, 4, 2, 5, 3, 6]);
  });

  test("pads the shorter buffer with silence", () => {
    const left = buildMonoPcm([1, 2, 3, 4]);
    const right = buildMonoPcm([5, 6]);
    const out = interleaveStereoPcm({ left, right });
    const samples = new Int16Array(
      out.buffer,
      out.byteOffset,
      out.byteLength / 2,
    );
    expect(Array.from(samples)).toEqual([1, 5, 2, 6, 3, 0, 4, 0]);
  });
});

describe("encodeStereoWav", () => {
  test("produces a valid 2-channel WAV header", () => {
    const left = buildMonoPcm([100, 200, 300]);
    const right = buildMonoPcm([400, 500, 600]);
    const wav = encodeStereoWav({ format: MONO_FORMAT, left, right });
    const decoder = new TextDecoder("ascii");
    expect(decoder.decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(decoder.decode(wav.subarray(8, 12))).toBe("WAVE");
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(16_000);
  });

  test("rejects stereo input on either channel", () => {
    expect(() =>
      encodeStereoWav({
        format: { ...MONO_FORMAT, channels: 2 },
        left: buildMonoPcm([1]),
        right: buildMonoPcm([2]),
      }),
    ).toThrow();
  });
});
