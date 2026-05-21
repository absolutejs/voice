import type {
  Transcript,
  VoiceSessionRecord,
  VoiceSessionStatus,
  VoiceSessionSummary,
} from "./types";

export const createId = () => crypto.randomUUID();

export const createTranscript = (
  text: string,
  input: Partial<Transcript> = {},
): Transcript => ({
  id: input.id ?? createId(),
  isFinal: input.isFinal ?? false,
  text,
  ...input,
});

export const createVoiceSessionRecord = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  id: string,
  scenarioId?: string,
) =>
  ({
    committedTurnIds: [],
    createdAt: Date.now(),
    currentTurn: {
      finalText: "",
      lastSpeechAt: undefined,
      lastTranscriptAt: undefined,
      partialEndedAt: undefined,
      partialStartedAt: undefined,
      partialText: "",
      silenceStartedAt: undefined,
      transcripts: [],
    },
    id,
    scenarioId,
    reconnect: { attempts: 0 },
    status: "active" as VoiceSessionStatus,
    transcripts: [],
    turns: [],
    lastCommittedTurn: {
      committedAt: 0,
      signature: "",
      text: "",
      transcriptIds: [],
    },
  }) as unknown as TSession;

export const resetVoiceSessionRecord = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  id: string,
  existing?: TSession,
  scenarioId?: string,
) =>
  ({
    ...createVoiceSessionRecord<TSession>(id, scenarioId),
    metadata: existing?.metadata,
  }) as TSession;

export const toVoiceSessionSummary = (
  session: VoiceSessionRecord,
): VoiceSessionSummary => ({
  createdAt: session.createdAt,
  id: session.id,
  lastActivityAt: session.lastActivityAt,
  status: session.status,
  turnCount: session.turns.length,
});
