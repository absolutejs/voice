import {
  applyAudioRedaction,
  mergeAudioRedactionRanges,
  type AudioRedactionFill,
} from "@absolutejs/media";
import type { AudioFormat, Transcript } from "./types";
import {
  DEFAULT_VOICE_REDACTION_PATTERNS,
  type VoiceRedactionPattern,
} from "./redaction";

export type VoiceRecordingRedactionRange = {
  endMs: number;
  label?: string;
  startMs: number;
};

export type DeriveVoiceRecordingRedactionRangesInput = {
  /** When the recording starts in epoch ms; used to convert absolute timestamps if transcripts use them. */
  recordingStartedAtEpochMs?: number;
  /** Optional padding around redaction ranges, in ms (default 100). */
  paddingMs?: number;
  /** Patterns to test against transcripts. Defaults to DEFAULT_VOICE_REDACTION_PATTERNS. */
  patterns?: ReadonlyArray<VoiceRedactionPattern>;
  /** Transcripts to scan. */
  transcripts: ReadonlyArray<Transcript>;
};

const matchesAnyPattern = (
  text: string,
  patterns: ReadonlyArray<VoiceRedactionPattern>,
): VoiceRedactionPattern | undefined => {
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      pattern.regex.lastIndex = 0;

      return pattern;
    }
  }

  return undefined;
};

export const deriveVoiceRecordingRedactionRanges = (
  input: DeriveVoiceRecordingRedactionRangesInput,
): VoiceRecordingRedactionRange[] => {
  const patterns = input.patterns ?? DEFAULT_VOICE_REDACTION_PATTERNS;
  const padding = Math.max(0, input.paddingMs ?? 100);
  const baseEpoch = input.recordingStartedAtEpochMs;
  const out: VoiceRecordingRedactionRange[] = [];
  for (const transcript of input.transcripts) {
    if (!transcript.isFinal) continue;
    if (typeof transcript.startedAtMs !== "number") continue;
    if (typeof transcript.endedAtMs !== "number") continue;
    const matched = matchesAnyPattern(transcript.text, patterns);
    if (!matched) continue;
    const absStart = transcript.startedAtMs;
    const absEnd = transcript.endedAtMs;
    const start =
      typeof baseEpoch === "number" && absStart >= baseEpoch
        ? absStart - baseEpoch
        : absStart;
    const end =
      typeof baseEpoch === "number" && absEnd >= baseEpoch
        ? absEnd - baseEpoch
        : absEnd;
    out.push({
      endMs: end + padding,
      label: matched.label,
      startMs: Math.max(0, start - padding),
    });
  }

  return out;
};

export type RedactVoiceRecordingInput = {
  /** Raw pcm_s16le bytes of the recorded artifact. */
  pcm: ArrayBuffer | ArrayBufferView;
  /** Format of the recording (must be raw pcm_s16le). */
  format: AudioFormat;
  /** Final transcripts with timing, scanned for sensitive content. */
  transcripts: ReadonlyArray<Transcript>;
  recordingStartedAtEpochMs?: number;
  paddingMs?: number;
  patterns?: ReadonlyArray<VoiceRedactionPattern>;
  /** Bleep style — silence (default) or a tone. */
  fill?: AudioRedactionFill;
};

export type RedactVoiceRecordingResult = {
  /** The redacted pcm_s16le bytes. */
  bytes: Uint8Array;
  /** The merged ranges that were bleeped. */
  ranges: VoiceRecordingRedactionRange[];
  /** How many ranges were redacted. */
  redactedCount: number;
};

/**
 * End-to-end recording redaction: derives sensitive ranges from final
 * transcripts, merges overlaps, and applies the audio bleep via
 * `@absolutejs/media`'s `applyAudioRedaction`. Returns the redacted bytes
 * ready to re-store in place of the original artifact.
 */
export const redactVoiceRecording = (
  input: RedactVoiceRecordingInput,
): RedactVoiceRecordingResult => {
  const derived = deriveVoiceRecordingRedactionRanges({
    transcripts: input.transcripts,
    ...(input.recordingStartedAtEpochMs !== undefined
      ? { recordingStartedAtEpochMs: input.recordingStartedAtEpochMs }
      : {}),
    ...(input.paddingMs !== undefined ? { paddingMs: input.paddingMs } : {}),
    ...(input.patterns !== undefined ? { patterns: input.patterns } : {}),
  });
  const ranges = mergeAudioRedactionRanges(derived);
  const bytes = applyAudioRedaction(input.pcm, input.format, ranges, {
    ...(input.fill !== undefined ? { fill: input.fill } : {}),
  });

  return {
    bytes,
    ranges,
    redactedCount: ranges.length,
  };
};
