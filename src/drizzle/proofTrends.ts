import {
  type VoiceRealCallProfileEvidenceListOptions,
  type VoiceRealCallProfileEvidenceRecord,
  type VoiceRealCallProfileEvidenceStore,
  type VoiceRealCallProfileRecoveryJob,
  type VoiceRealCallProfileRecoveryJobListOptions,
  type VoiceRealCallProfileRecoveryJobStore,
} from "../core/proofTrends";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleDatabase,
  type VoiceDrizzleStoreOptions,
} from "./shared";

export const voiceRealCallProfileEvidenceTable = voiceDocumentTable(
  "voice_real_call_profile_evidence",
);
export const voiceRealCallProfileRecoveryJobsTable = voiceDocumentTable(
  "voice_real_call_profile_recovery_jobs",
);

// The Postgres family stores recovery jobs and evidence as JSONB documents,
// matching the SQLite/in-memory variants in core/proofTrends. The base record
// store gives get/list/remove/set over the (id, sort_at, payload) table; the
// factories layer create/update/append on top to mirror id generation,
// timestamps, merge semantics, and filter/sort/limit exactly.
const parseRealCallProfileEvidenceBoundary = (
  value: Date | number | string | undefined,
) => {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }

  return Date.parse(value);
};

const readRealCallProfileEvidenceSortTime = (
  evidence: VoiceRealCallProfileEvidenceRecord,
  fallback: string,
) => Date.parse(evidence.generatedAt ?? fallback) || Date.parse(fallback);

const matchesRealCallProfileEvidenceListOptions = (
  record: VoiceRealCallProfileEvidenceRecord,
  input: VoiceRealCallProfileEvidenceListOptions,
) => {
  const evidenceTime = readRealCallProfileEvidenceSortTime(
    record,
    record.createdAt,
  );
  const since = parseRealCallProfileEvidenceBoundary(input.since);
  const until = parseRealCallProfileEvidenceBoundary(input.until);

  return (
    (!input.profileId || record.profileId === input.profileId) &&
    (!input.sessionId || record.sessionId === input.sessionId) &&
    (since === undefined || Number.isNaN(since) || evidenceTime >= since) &&
    (until === undefined || Number.isNaN(until) || evidenceTime <= until)
  );
};

const matchesRealCallProfileRecoveryJobListOptions = (
  job: VoiceRealCallProfileRecoveryJob,
  input: VoiceRealCallProfileRecoveryJobListOptions,
) =>
  (!input.actionId || job.actionId === input.actionId) &&
  (!input.status || job.status === input.status);

const createDrizzleRealCallProfileRecoveryJobStore = <
  DB extends VoiceDrizzleDatabase,
>(
  db: DB,
  options: { idPrefix?: string; now?: () => Date } = {},
): VoiceRealCallProfileRecoveryJobStore => {
  const store = createVoiceDrizzleRecordStore<VoiceRealCallProfileRecoveryJob>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => Date.parse(value.updatedAt) || Date.now(),
    table: voiceRealCallProfileRecoveryJobsTable,
  });
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const createId = () =>
    `${options.idPrefix ?? "voice-recovery-job"}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  return {
    get: store.get,
    create: async (input) => {
      const createdAt = input.createdAt ?? now();
      const job: VoiceRealCallProfileRecoveryJob = {
        actionId: input.actionId,
        createdAt,
        id: input.id ?? createId(),
        message: input.message,
        status: input.status ?? "queued",
        updatedAt: createdAt,
      };
      await store.set(job.id, job);

      return job;
    },
    list: async (input = {}) => {
      const limit =
        Number.isFinite(input.limit) &&
        input.limit !== undefined &&
        input.limit > 0
          ? Math.floor(input.limit)
          : 50;

      return (await store.list())
        .filter((job) =>
          matchesRealCallProfileRecoveryJobListOptions(job, input),
        )
        .slice(0, limit);
    },
    update: async (id, update) => {
      const existing = await store.get(id);
      if (!existing) {
        return undefined;
      }
      const next: VoiceRealCallProfileRecoveryJob = {
        ...existing,
        ...update,
        updatedAt: update.updatedAt ?? now(),
      };
      await store.set(id, next);

      return next;
    },
  };
};

const createDrizzleRealCallProfileEvidenceStore = <
  DB extends VoiceDrizzleDatabase,
>(
  db: DB,
  options: { idPrefix?: string; now?: () => Date } = {},
): VoiceRealCallProfileEvidenceStore => {
  const store =
    createVoiceDrizzleRecordStore<VoiceRealCallProfileEvidenceRecord>({
      db,
      decorate: (_id, value) => value,
      getSortAt: (value) =>
        readRealCallProfileEvidenceSortTime(value, value.createdAt),
      table: voiceRealCallProfileEvidenceTable,
    });
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const createId = () =>
    `${options.idPrefix ?? "voice-profile-evidence"}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  return {
    get: store.get,
    remove: store.remove,
    append: async (input) => {
      const record: VoiceRealCallProfileEvidenceRecord = {
        ...input,
        createdAt: input.createdAt ?? now(),
        id: input.id ?? createId(),
      };
      await store.set(record.id, record);

      return record;
    },
    list: async (input = {}) => {
      const limit =
        Number.isFinite(input.limit) &&
        input.limit !== undefined &&
        input.limit > 0
          ? Math.floor(input.limit)
          : 500;

      return (await store.list())
        .filter((record) =>
          matchesRealCallProfileEvidenceListOptions(record, input),
        )
        .slice(0, limit);
    },
  };
};

export const createVoiceDrizzleRealCallProfileEvidenceStore = (
  options: VoiceDrizzleStoreOptions & {
    idPrefix?: string;
    now?: () => Date;
  },
): VoiceRealCallProfileEvidenceStore =>
  createDrizzleRealCallProfileEvidenceStore(options.db, {
    idPrefix: options.idPrefix,
    now: options.now,
  });

export const createVoiceDrizzleRealCallProfileRecoveryJobStore = (
  options: VoiceDrizzleStoreOptions & {
    idPrefix?: string;
    now?: () => Date;
  },
): VoiceRealCallProfileRecoveryJobStore =>
  createDrizzleRealCallProfileRecoveryJobStore(options.db, {
    idPrefix: options.idPrefix,
    now: options.now,
  });
