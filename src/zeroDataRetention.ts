import type { VoiceTraceEvent } from "./trace";
import type { VoiceTurnRecord } from "./types";

export type VoiceZeroDataRetentionMode = "off" | "strict" | "custom";

export type VoiceZeroDataRetentionRetainFlags = {
  /** Persist committed/partial transcript text. */
  transcriptText: boolean;
  /** Persist assistant response text. */
  assistantText: boolean;
  /** Persist recorded audio artifacts. */
  recordings: boolean;
  /** Persist free-text payloads on trace events. */
  traceText: boolean;
  /** Persist arbitrary session/turn metadata. */
  metadata: boolean;
};

export type VoiceZeroDataRetentionPolicy = {
  mode: VoiceZeroDataRetentionMode;
  retain: VoiceZeroDataRetentionRetainFlags;
};

export type CreateVoiceZeroDataRetentionPolicyOptions = {
  mode?: VoiceZeroDataRetentionMode;
  /** Per-flag overrides; only meaningful with mode "custom" (or to relax "strict"). */
  retain?: Partial<VoiceZeroDataRetentionRetainFlags>;
};

const RETAIN_ALL: VoiceZeroDataRetentionRetainFlags = {
  assistantText: true,
  metadata: true,
  recordings: true,
  traceText: true,
  transcriptText: true,
};

const RETAIN_NONE: VoiceZeroDataRetentionRetainFlags = {
  assistantText: false,
  metadata: false,
  recordings: false,
  traceText: false,
  transcriptText: false,
};

const REDACTED = "[redacted:zdr]";

export const createVoiceZeroDataRetentionPolicy = (
  options: CreateVoiceZeroDataRetentionPolicyOptions = {},
): VoiceZeroDataRetentionPolicy => {
  const mode = options.mode ?? "off";
  const base =
    mode === "strict" ? RETAIN_NONE : mode === "off" ? RETAIN_ALL : RETAIN_ALL;
  return {
    mode,
    retain: { ...base, ...(options.retain ?? {}) },
  };
};

export const isVoiceZeroDataRetentionActive = (
  policy: VoiceZeroDataRetentionPolicy,
): boolean =>
  policy.mode !== "off" &&
  Object.values(policy.retain).some((retain) => retain === false);

export const shouldRetainVoiceRecording = (
  policy: VoiceZeroDataRetentionPolicy,
): boolean => policy.retain.recordings;

export const shouldRetainVoiceTranscript = (
  policy: VoiceZeroDataRetentionPolicy,
): boolean => policy.retain.transcriptText;

/**
 * Returns a scrubbed copy of a turn record honoring the ZDR policy. Structural
 * fields (ids, timestamps, transcript count, citation ids) are preserved;
 * content fields are replaced with a redaction marker or dropped.
 */
export const scrubVoiceTurnForZeroDataRetention = <TResult = unknown>(
  turn: VoiceTurnRecord<TResult>,
  policy: VoiceZeroDataRetentionPolicy,
): VoiceTurnRecord<TResult> => {
  if (!isVoiceZeroDataRetentionActive(policy)) return turn;
  const scrubbed: VoiceTurnRecord<TResult> = {
    ...turn,
    text: policy.retain.transcriptText ? turn.text : REDACTED,
    transcripts: policy.retain.transcriptText
      ? turn.transcripts
      : turn.transcripts.map((transcript) => ({
          ...transcript,
          text: REDACTED,
        })),
  };
  if (!policy.retain.assistantText && scrubbed.assistantText !== undefined) {
    scrubbed.assistantText = REDACTED;
  }
  if (!policy.retain.metadata) {
    delete (scrubbed as { attachments?: unknown }).attachments;
  }
  return scrubbed;
};

/**
 * Returns a scrubbed copy of a trace event honoring the ZDR policy. Drops or
 * masks free-text payload fields while keeping the event type, ids, and
 * timestamps so observability/lifecycle accounting still works.
 */
export const scrubVoiceTraceForZeroDataRetention = (
  event: VoiceTraceEvent,
  policy: VoiceZeroDataRetentionPolicy,
): VoiceTraceEvent => {
  if (!isVoiceZeroDataRetentionActive(policy) || policy.retain.traceText) {
    return event;
  }
  const payload = event.payload;
  if (!payload || typeof payload !== "object") return event;
  const scrubbedPayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    scrubbedPayload[key] = typeof value === "string" ? REDACTED : value;
  }
  return { ...event, payload: scrubbedPayload };
};

export const VOICE_ZERO_DATA_RETENTION_REDACTION_MARKER = REDACTED;
