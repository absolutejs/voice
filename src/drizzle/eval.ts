import type {
  VoiceEvalBaselineStore,
  VoiceEvalReport,
} from "../core/evalRoutes";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleDatabase,
  type VoiceDrizzleStoreOptions,
} from "./shared";

// The eval baseline is a singleton (one known-good report), so it lives in a
// document table under a single fixed row id. sort_at mirrors the report's
// checkedAt timestamp, matching the rest of the Drizzle stores.
export const voiceEvalBaselineTable = voiceDocumentTable("voice_eval_baseline");

const VOICE_EVAL_BASELINE_ID = "baseline";

const createDrizzleEvalBaselineStore = <DB extends VoiceDrizzleDatabase>(
  db: DB,
): VoiceEvalBaselineStore => {
  const store = createVoiceDrizzleRecordStore<VoiceEvalReport>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.checkedAt,
    table: voiceEvalBaselineTable,
  });

  return {
    get: async () => store.get(VOICE_EVAL_BASELINE_ID),
    set: async (report) => {
      await store.set(VOICE_EVAL_BASELINE_ID, report);
    },
  };
};

export const createVoiceDrizzleEvalBaselineStore = (
  options: VoiceDrizzleStoreOptions,
): VoiceEvalBaselineStore => createDrizzleEvalBaselineStore(options.db);
