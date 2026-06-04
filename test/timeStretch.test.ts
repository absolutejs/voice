import { describe, expect, test } from "bun:test";
import { createTimeStretcher } from "../src/client/timeStretch";

const SAMPLE_RATE = 24_000;

// Synthesize a pure sine of `freq` Hz, `seconds` long.
const sine = (freq: number, seconds: number) => {
  const length = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    data[index] = Math.sin((2 * Math.PI * freq * index) / SAMPLE_RATE);
  }

  return data;
};

// Estimate the dominant frequency from the mean spacing between rising
// zero-crossings — a robust pitch proxy for a single-tone signal.
const estimateFreq = (data: Float32Array) => {
  const crossings: number[] = [];
  for (let index = 1; index < data.length; index += 1) {
    const prev = data[index - 1] ?? 0;
    const curr = data[index] ?? 0;
    if (prev < 0 && curr >= 0) crossings.push(index);
  }
  if (crossings.length < 2) return 0;
  const first = crossings[0] ?? 0;
  const last = crossings[crossings.length - 1] ?? 0;
  const periods = crossings.length - 1;

  return (SAMPLE_RATE * periods) / (last - first);
};

// Feed the whole signal through the streaming stretcher in small chunks (as the
// player would) and concatenate the output.
const stretch = (data: Float32Array, speed: number, chunk = 1200) => {
  const stretcher = createTimeStretcher();
  const parts: Float32Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunk) {
    const slice = data.subarray(offset, Math.min(offset + chunk, data.length));
    const [out] = stretcher.process([slice], speed, SAMPLE_RATE);
    if (out && out.length > 0) parts.push(out);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Float32Array(total);
  let pos = 0;
  for (const part of parts) {
    merged.set(part, pos);
    pos += part.length;
  }

  return merged;
};

describe("createTimeStretcher", () => {
  test("faster playback keeps pitch (no chipmunk) and shortens duration", () => {
    const input = sine(220, 1);
    const speed = 1.5;
    const output = stretch(input, speed);

    // Duration compressed by ~speed.
    expect(output.length / input.length).toBeCloseTo(1 / speed, 1);
    // Pitch preserved within 3% — the whole point versus resampling.
    const ratio = estimateFreq(output) / estimateFreq(input);
    expect(ratio).toBeGreaterThan(0.97);
    expect(ratio).toBeLessThan(1.03);
  });

  test("slower playback keeps pitch and lengthens duration", () => {
    const input = sine(330, 1);
    const speed = 0.7;
    const output = stretch(input, speed);

    expect(output.length / input.length).toBeCloseTo(1 / speed, 1);
    const ratio = estimateFreq(output) / estimateFreq(input);
    expect(ratio).toBeGreaterThan(0.97);
    expect(ratio).toBeLessThan(1.03);
  });

  test("output is finite (no NaN/Inf) even across silence", () => {
    const input = new Float32Array(SAMPLE_RATE); // all zeros
    const output = stretch(input, 1.4);
    for (const sample of output) {
      expect(Number.isFinite(sample)).toBe(true);
    }
  });

  test("reset clears buffered state between runs", () => {
    const stretcher = createTimeStretcher();
    const input = sine(200, 0.5);
    stretcher.process([input], 1.5, SAMPLE_RATE);
    stretcher.reset();
    // After reset, a fresh short feed shouldn't throw and stays finite.
    const [out] = stretcher.process([input], 1.5, SAMPLE_RATE);
    expect(out).toBeDefined();
    for (const sample of out ?? new Float32Array(0)) {
      expect(Number.isFinite(sample)).toBe(true);
    }
  });
});
