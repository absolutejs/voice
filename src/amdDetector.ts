import type { Transcript, VoiceSessionHandle, VoiceSessionRecord } from "./types";

export type VoiceAMDDetectorInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  api: VoiceSessionHandle<TContext, TSession, TResult>;
  audioLevel: number | undefined;
  elapsedSinceFirstAudioMs: number;
  elapsedSinceLastTurnCommitMs: number;
  partialTranscript: string;
  session: TSession;
  transcripts: Transcript[];
};

export type VoiceAMDVerdict = {
  metadata?: Record<string, unknown>;
  reason?: string;
};

export type VoiceAMDDetector<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  evaluate: (
    input: VoiceAMDDetectorInput<TContext, TSession, TResult>,
  ) =>
    | Promise<VoiceAMDVerdict | undefined>
    | VoiceAMDVerdict
    | undefined;
  intervalMs?: number;
};

export type MonologueAMDDetectorOptions = {
  intervalMs?: number;
  minMonologueMs?: number;
  reason?: string;
  requireFirstAudio?: boolean;
};

export const createMonologueAMDDetector = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: MonologueAMDDetectorOptions = {},
): VoiceAMDDetector<TContext, TSession, TResult> => {
  const minMonologueMs = options.minMonologueMs ?? 8_000;
  const reason = options.reason ?? "monologue-suspected-voicemail";
  const requireFirstAudio = options.requireFirstAudio ?? true;
  return {
    evaluate: ({
      elapsedSinceFirstAudioMs,
      elapsedSinceLastTurnCommitMs,
      session,
    }) => {
      if (requireFirstAudio && elapsedSinceFirstAudioMs <= 0) {
        return undefined;
      }
      const noTurnsYet = session.turns.length === 0;
      const monologueElapsed = noTurnsYet
        ? elapsedSinceFirstAudioMs
        : elapsedSinceLastTurnCommitMs;
      if (monologueElapsed < minMonologueMs) {
        return undefined;
      }
      return {
        metadata: {
          detector: "monologue",
          monologueMs: monologueElapsed,
        },
        reason,
      };
    },
    intervalMs: options.intervalMs ?? 1_000,
  };
};
