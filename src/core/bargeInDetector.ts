import type { AudioFormat } from "./types";

// When the user makes a sound WHILE the assistant is speaking, is it a real
// interruption (cancel the assistant) or a backchannel — "mm-hm", "yeah", a
// cough — that should NOT stop it? The built-in guard is transcript-only (a
// fixed lexicon of cue words). This hook lets a detector also read the user's
// raw audio for that window. Mirrors the VoiceSemanticTurnDetector pattern.

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
  /**
   * The acoustic measurements the decision used, surfaced on the trace for
   * tuning against real audio. Omitted when no audio was judged.
   */
  metrics?: { voicedMs: number; rms: number };
};

export type VoiceBargeInDetector = {
  evaluate: (
    input: VoiceBargeInInput,
  ) => Promise<VoiceBargeInVerdict> | VoiceBargeInVerdict;
};

export type CreateAcousticBargeInDetectorOptions = {
  /** Voiced speech sustained this long (ms) is a real interruption — cancel. */
  sustainedMs?: number;
  /**
   * Leading words that mark an interruption ("wait", "hold on", "sorry"). A
   * short utterance starting with one cancels immediately instead of holding.
   * Extends (does not replace) the defaults.
   */
  interruptionCues?: string[];
};

// Measured over real TTS-on-the-wire clips, backchannels and interruptions sit at
// the SAME RMS (~0.08) — energy doesn't discriminate intent. What does: text
// (cue lexicons) and PERSISTENCE (voiced duration accumulating over successive
// partials). So the heuristic is text + duration; when neither is decisive we
// HOLD (keep talking) rather than cut the caller off, and let a continuing
// utterance cancel itself once its voiced duration crosses `sustainedMs`.

// Leading markers of a real interruption — an utterance that STARTS with one is
// the caller taking the floor, even when it's short.
const DEFAULT_INTERRUPTION_CUES = [
  "wait",
  "hold on",
  "hold up",
  "hang on",
  "stop",
  "sorry",
  "excuse me",
  "actually",
  "one sec",
  "one second",
  "quick question",
  "question",
  "can i",
  "let me",
  "no no",
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const startsWithCue = (text: string, cues: ReadonlyArray<string>) => {
  const norm = normalize(text);

  return cues.some((cue) => norm === cue || norm.startsWith(`${cue} `));
};

// |sample| (0-1) above this counts as voiced. The buffered turn audio includes
// the silence the mic streams between/around words, so duration must be measured
// over VOICED samples only — otherwise silence inflates a short cue into a
// "sustained" interruption.
const VOICED_FLOOR = 0.02;

// One pass over the PCM16 chunks → voiced speech duration + RMS over the voiced
// samples (RMS is kept for the trace/observability; the decision uses duration).
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
    return { rms: 0, voicedMs: 0 };
  }

  return {
    rms: Math.sqrt(sumSquares / voicedSamples),
    voicedMs: (voicedSamples / channels / sampleRate) * 1000,
  };
};

/**
 * A model-free backchannel-vs-barge-in classifier driven by TEXT + PERSISTENCE
 * (energy was measured to not discriminate on normalized speech):
 *   - voiced speech past `sustainedMs`  → real interruption (cancel)
 *   - known backchannel cue, still short → backchannel (keep talking)
 *   - starts with an interruption cue     → caller took the floor (cancel)
 *   - otherwise short + ambiguous         → HOLD: keep talking; a continuing
 *                                           utterance cancels itself once its
 *                                           voiced duration crosses sustainedMs
 * Runs in-process on raw arithmetic — no model, no sidecar.
 */
export const createAcousticBargeInDetector = (
  options: CreateAcousticBargeInDetectorOptions = {},
): VoiceBargeInDetector => {
  const sustainedMs = options.sustainedMs ?? 600;
  const interruptionCues = [
    ...DEFAULT_INTERRUPTION_CUES,
    ...(options.interruptionCues ?? []),
  ];

  return {
    evaluate: (input) => {
      const isInterruptionCue = startsWithCue(
        input.partialText,
        interruptionCues,
      );
      const { turnAudio, turnAudioFormat } = input;
      if (!turnAudio || turnAudio.length === 0 || !turnAudioFormat) {
        // No audio to judge — text only. Backchannel keeps talking; an explicit
        // interruption cancels; otherwise let it through (can't measure persistence).
        if (input.isBackchannelByText) {
          return { reason: "text_backchannel", shouldCancel: false };
        }

        return {
          reason: isInterruptionCue ? "text_interruption" : "text_only",
          shouldCancel: true,
        };
      }
      const metrics = measureTurnAudio(turnAudio, turnAudioFormat);
      metrics.voicedMs = Math.round(metrics.voicedMs);

      if (metrics.voicedMs >= sustainedMs) {
        return { metrics, reason: "acoustic_sustained", shouldCancel: true };
      }
      if (input.isBackchannelByText) {
        return { metrics, reason: "acoustic_backchannel", shouldCancel: false };
      }
      if (isInterruptionCue) {
        return { metrics, reason: "acoustic_interruption", shouldCancel: true };
      }

      // Short, neither a known cue nor sustained yet → keep talking. If the
      // caller is really interrupting they'll continue, and the next partial's
      // larger voiced duration trips acoustic_sustained.
      return { metrics, reason: "acoustic_hold", shouldCancel: false };
    },
  };
};
