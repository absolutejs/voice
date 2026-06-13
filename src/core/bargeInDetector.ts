import type { AudioFormat } from "./types";

// When the user makes a sound WHILE the assistant is speaking, is it a real
// interruption (cancel the assistant) or a backchannel — "mm-hm", "yeah", a
// cough — that should NOT stop it? The built-in guard is transcript-only (a
// fixed lexicon of cue words). This hook lets a detector also read the user's
// raw audio for that window, so the decision can use prosody the text can't
// show: how long they spoke, how hard the onset was. Mirrors the
// VoiceSemanticTurnDetector pattern for end-of-turn.

export type VoiceBargeInInput = {
  /** The partial transcript that arrived while the assistant was speaking. */
  partialText: string;
  /** Word count of `partialText`. */
  wordCount: number;
  /** Whether the text matches a known backchannel cue (isBackchannelUtterance). */
  isBackchannelByText: boolean;
  /** The user's buffered PCM for this window (oldest→newest), if any. */
  turnAudio?: ReadonlyArray<Uint8Array>;
  turnAudioFormat?: AudioFormat;
};

export type VoiceBargeInVerdict = {
  /** true = real interruption → cancel the assistant's TTS. false = keep talking. */
  shouldCancel: boolean;
  /** Diagnostic label, surfaced on the barge_in / barge_in_suppressed trace. */
  reason?: string;
};

export type VoiceBargeInDetector = {
  evaluate: (
    input: VoiceBargeInInput,
  ) => Promise<VoiceBargeInVerdict> | VoiceBargeInVerdict;
};

export type CreateAcousticBargeInDetectorOptions = {
  /** Speech sustained this long (ms) is a real interruption regardless of text/energy. */
  sustainedMs?: number;
  /** RMS (0-1) at/above this is an emphatic onset ("Wait!") — cancel even if short. */
  emphaticRms?: number;
  /** Below this RMS (0-1) a short burst is incidental noise — keep talking. */
  noiseFloorRms?: number;
};

// |sample| (0-1) above this counts as voiced. The buffered turn audio includes
// the silence the mic streams between/around words, so duration must be measured
// over VOICED samples only — otherwise leading/trailing silence inflates a short
// backchannel into a "sustained" interruption.
const VOICED_FLOOR = 0.02;

// One pass over the PCM16 chunks → voiced speech duration + RMS over the voiced
// samples (so silence neither stretches the duration nor dilutes the energy).
const measureTurnAudio = (
  chunks: ReadonlyArray<Uint8Array>,
  format: AudioFormat,
) => {
  const channels = format.channels ?? 1;
  const sampleRate = format.sampleRateHz ?? 16_000;
  let sumSquares = 0;
  let voicedSamples = 0;
  for (const chunk of chunks) {
    // 16-bit little-endian; a chunk boundary can leave a stray odd byte.
    const usableBytes = chunk.byteLength - (chunk.byteLength % 2);
    const view = new DataView(chunk.buffer, chunk.byteOffset, usableBytes);
    for (let offset = 0; offset < usableBytes; offset += 2) {
      const sample = view.getInt16(offset, true) / 32_768;
      if (Math.abs(sample) >= VOICED_FLOOR) {
        sumSquares += sample * sample;
        voicedSamples += 1;
      }
    }
  }
  if (voicedSamples === 0) {
    return { durationMs: 0, rms: 0 };
  }

  return {
    durationMs: (voicedSamples / channels / sampleRate) * 1000,
    rms: Math.sqrt(sumSquares / voicedSamples),
  };
};

/**
 * A model-free acoustic backchannel-vs-barge-in classifier. Combines the user's
 * speech duration + onset energy with the text backchannel signal:
 *   - sustained speech            → real interruption (cancel)
 *   - known cue word, stayed short → backchannel (keep talking)
 *   - short but loud/sharp onset   → emphatic interruption like "Wait!" (cancel)
 *   - short + quiet                → incidental noise (keep talking)
 *   - short + moderate, real words → ambiguous, default to cancel (don't strand
 *                                    a genuine short interruption)
 * Runs in-process on raw arithmetic — no model, no sidecar.
 */
export const createAcousticBargeInDetector = (
  options: CreateAcousticBargeInDetectorOptions = {},
): VoiceBargeInDetector => {
  const sustainedMs = options.sustainedMs ?? 700;
  const emphaticRms = options.emphaticRms ?? 0.16;
  const noiseFloorRms = options.noiseFloorRms ?? 0.035;

  return {
    evaluate: (input) => {
      const { turnAudio, turnAudioFormat } = input;
      if (!turnAudio || turnAudio.length === 0 || !turnAudioFormat) {
        // No audio to judge — defer to the text signal.
        return input.isBackchannelByText
          ? { reason: "text_backchannel", shouldCancel: false }
          : { reason: "text_only", shouldCancel: true };
      }
      const { durationMs, rms } = measureTurnAudio(turnAudio, turnAudioFormat);

      if (durationMs >= sustainedMs) {
        return { reason: "acoustic_sustained", shouldCancel: true };
      }
      if (input.isBackchannelByText) {
        return { reason: "acoustic_backchannel", shouldCancel: false };
      }
      if (rms >= emphaticRms) {
        return { reason: "acoustic_emphatic", shouldCancel: true };
      }
      if (rms <= noiseFloorRms) {
        return { reason: "acoustic_noise_floor", shouldCancel: false };
      }

      return { reason: "acoustic_ambiguous", shouldCancel: true };
    },
  };
};
