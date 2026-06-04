// Streaming WSOLA (Waveform-Similarity Overlap-Add) time-stretcher.
//
// Web Audio's AudioBufferSourceNode.playbackRate *resamples* the buffer, so
// raising the rate also raises the pitch — the "chipmunk" effect. There is no
// preservesPitch for a buffer source (that flag only exists on
// HTMLMediaElement). To let the assistant talk faster or slower while keeping
// its natural pitch we instead time-stretch the PCM in software — synthesizing
// a shorter/longer waveform at the SAME pitch — and play the result back at
// rate 1.
//
// WSOLA overlap-adds short Hann-windowed grains, sliding each grain by a small
// similarity search so successive grains line up at the waveform level. That
// alignment is what keeps speech free of the phasiness and transient smearing a
// naive fixed-hop OLA produces. It runs streaming: feed each TTS chunk in, drain
// whatever finished output is ready; the grain/overlap state carries across
// chunks so grains stay continuous over chunk boundaries.

const HOP_MS = 10; // synthesis hop — grain length is 2x this (50% overlap)
const SEEK_MS = 5; // similarity-search radius around the nominal analysis point
const ENERGY_EPSILON = 1e-6; // guards the normalized-correlation denominator
const HALF = 0.5;
const MS_PER_SECOND = 1000;

export type TimeStretcher = {
  // Push one decoded chunk (Float32 per channel) at the given speed and return
  // whatever stretched output is ready (Float32 per channel; may be empty).
  // speed > 1 compresses (faster), speed < 1 expands (slower); pitch unchanged.
  process: (
    input: Float32Array[],
    speed: number,
    sampleRate: number,
  ) => Float32Array[];
  // Drop all buffered state. Used when playback returns to rate 1 (no stretch),
  // so a later speed change re-primes cleanly.
  reset: () => void;
};

const makeHann = (length: number) => {
  // Periodic Hann: w[n] + w[n + length/2] === 1, so a 50%-overlap add preserves
  // amplitude exactly (constant-overlap-add).
  const weights = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    weights[index] = HALF - HALF * Math.cos((2 * Math.PI * index) / length);
  }

  return weights;
};

// Normalized cross-correlation of the raw waveform starting at `start` against
// the natural-continuation reference. Higher = better waveform alignment.
const correlationScore = (
  base: Float32Array,
  start: number,
  ref: Float32Array,
  length: number,
) => {
  let dot = 0;
  let energy = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = base[start + index] ?? 0;
    dot += sample * (ref[index] ?? 0);
    energy += sample * sample;
  }

  return dot / Math.sqrt(energy + ENERGY_EPSILON);
};

// One Hann-windowed grain split into the finished (overlap with prior tail) half
// and the next pending overlap tail.
const overlapAddGrain = (
  src: Float32Array,
  off: number,
  tail: Float32Array,
  weights: Float32Array,
  hop: number,
) => {
  const out = new Float32Array(hop);
  const nextTail = new Float32Array(hop);
  for (let index = 0; index < hop; index += 1) {
    out[index] =
      (tail[index] ?? 0) + (src[off + index] ?? 0) * (weights[index] ?? 0);
    nextTail[index] =
      (src[off + hop + index] ?? 0) * (weights[hop + index] ?? 0);
  }

  return { nextTail, out };
};

export const createTimeStretcher = (): TimeStretcher => {
  let sampleRate = 0;
  let channelCount = 0;
  let hop = 0; // synthesis hop Hs (samples)
  let frameLen = 0; // grain length = 2 * hop
  let seek = 0; // search radius (samples)
  let weights = new Float32Array(0); // Hann window

  // Per-channel input ring: `buffers[ch]` holds samples whose absolute index
  // starts at `inputStart`. We trim the consumed front each call so length
  // stays bounded regardless of call duration.
  let buffers: Float32Array[] = [];
  let inputStart = 0;
  let analysisPos = 0; // absolute float index of the next nominal grain
  let olaTail: Float32Array[] = []; // pending overlap half per channel
  let naturalRef: Float32Array | null = null; // expected continuation (channel 0)

  const init = (rate: number, channels: number) => {
    sampleRate = rate;
    channelCount = channels;
    hop = Math.max(1, Math.round((sampleRate * HOP_MS) / MS_PER_SECOND));
    frameLen = hop * 2;
    seek = Math.max(1, Math.round((sampleRate * SEEK_MS) / MS_PER_SECOND));
    weights = makeHann(frameLen);
    buffers = Array.from({ length: channels }, () => new Float32Array(0));
    olaTail = Array.from({ length: channels }, () => new Float32Array(hop));
    inputStart = 0;
    // Start one search radius in so the first grain has room to seek backward.
    analysisPos = seek;
    naturalRef = null;
  };

  const reset = () => {
    buffers = buffers.map(() => new Float32Array(0));
    olaTail = olaTail.map(() => new Float32Array(hop));
    inputStart = 0;
    analysisPos = seek;
    naturalRef = null;
  };

  const append = (input: Float32Array[]) => {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const incoming = input[channel] ?? input[0] ?? new Float32Array(0);
      const existing = buffers[channel] ?? new Float32Array(0);
      const merged = new Float32Array(existing.length + incoming.length);
      merged.set(existing, 0);
      merged.set(incoming, existing.length);
      buffers[channel] = merged;
    }
  };

  const inputEnd = () => inputStart + (buffers[0]?.length ?? 0);

  // Trim everything before the earliest sample any future grain could read.
  const compact = () => {
    const keepFrom = Math.max(inputStart, Math.floor(analysisPos) - seek - 1);
    if (keepFrom <= inputStart) return;
    const drop = keepFrom - inputStart;
    for (let channel = 0; channel < channelCount; channel += 1) {
      buffers[channel] = (buffers[channel] ?? new Float32Array(0)).slice(drop);
    }
    inputStart = keepFrom;
  };

  // Best grain offset in [-seek, seek] whose raw waveform best continues the
  // previous grain. Returns 0 before the first reference exists.
  const bestOffset = (center: number) => {
    if (!naturalRef) return 0;
    const [base] = buffers;
    if (!base) return 0;
    let bestDelta = 0;
    let bestScore = -Infinity;
    for (let delta = -seek; delta <= seek; delta += 1) {
      const score = correlationScore(
        base,
        center + delta - inputStart,
        naturalRef,
        frameLen,
      );
      if (score <= bestScore) continue;
      bestScore = score;
      bestDelta = delta;
    }

    return bestDelta;
  };

  const process = (input: Float32Array[], speed: number, rate: number) => {
    const channels = Math.max(1, input.length);
    if (sampleRate !== rate || channelCount !== channels) init(rate, channels);
    append(input);

    const analysisHop = hop * speed; // Ha — advance faster than Hs to compress
    const segments: Float32Array[][] = Array.from(
      { length: channelCount },
      () => [],
    );

    // Synthesize one grain at `pos` across all channels into `segments`.
    const emitGrain = (pos: number) => {
      const off = pos - inputStart;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const src = buffers[channel];
        const tail = olaTail[channel];
        if (!src || !tail) continue;
        const grain = overlapAddGrain(src, off, tail, weights, hop);
        olaTail[channel] = grain.nextTail;
        // The leading half of the first grain has no prior tail to overlap, so
        // it lands as a ~10ms Hann fade-in of the audio start — a clean entry.
        segments[channel]?.push(grain.out);
      }
    };

    // Capture the raw segment one synthesis hop past the chosen grain as the
    // reference the next grain's similarity search should continue from.
    const captureRef = (pos: number) => {
      const ref = new Float32Array(frameLen);
      const refOff = pos + hop - inputStart;
      const [base] = buffers;
      if (base) ref.set(base.subarray(refOff, refOff + frameLen));
      naturalRef = ref;
    };

    // A grain centered at `analysisPos` reads [center - seek, center + seek +
    // frameLen + hop): the extra `hop` is the natural-continuation reference.
    const canEmit = () =>
      Math.floor(analysisPos) - seek >= inputStart &&
      Math.floor(analysisPos) + seek + frameLen + hop <= inputEnd();

    while (canEmit()) {
      const center = Math.round(analysisPos);
      const pos = center + bestOffset(center);
      emitGrain(pos);
      captureRef(pos);
      analysisPos += analysisHop;
    }

    compact();

    return segments.map((channelSegments) => {
      const total = channelSegments.reduce((sum, seg) => sum + seg.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const seg of channelSegments) {
        merged.set(seg, offset);
        offset += seg.length;
      }

      return merged;
    });
  };

  return { process, reset };
};
