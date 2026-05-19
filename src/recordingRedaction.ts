import type { Transcript } from "./types";
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
