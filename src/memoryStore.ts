import type { VoiceSessionRecord, VoiceSessionStore } from "./types";
import { createVoiceSessionRecord, toVoiceSessionSummary } from "./store";

export const createVoiceMemoryStore = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(): VoiceSessionStore<TSession> => {
  const sessions = new Map<string, TSession>();

  const get = async (id: string) => sessions.get(id);

  const getOrCreate = async (id: string) => {
    let session = sessions.get(id);

    if (!session) {
      session = createVoiceSessionRecord<TSession>(id);
      sessions.set(id, session);
    }

    return session;
  };

  const set = async (id: string, value: TSession) => {
    sessions.set(id, value);
  };

  const list = async () =>
    Array.from(sessions.values())
      .map((session) => toVoiceSessionSummary(session))
      .sort(
        (first, second) =>
          (second.lastActivityAt ?? second.createdAt) -
          (first.lastActivityAt ?? first.createdAt),
      );

  const remove = async (id: string) => {
    sessions.delete(id);
  };

  return { get, getOrCreate, list, remove, set };
};
