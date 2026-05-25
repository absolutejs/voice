import { and, desc, eq } from "drizzle-orm";
import { bigint, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import {
  createVoiceAssistantMemoryRecord,
  type VoiceAssistantMemoryRecord,
  type VoiceAssistantMemoryStore,
} from "../core/assistantMemory";
import {
  type VoiceDrizzleDatabase,
  type VoiceDrizzleStoreOptions,
} from "./shared";

// The assistant-memory store is keyed by (assistant_id, namespace, key). A
// single deterministic surrogate `id` (the JSON-encoded composite) is the
// primary key so upserts target one column — drizzle-kit treats single-column
// PKs idempotently, whereas a composite PRIMARY KEY makes `push` churn. The
// three parts stay as columns for namespace/assistant filtering, and the full
// record lives in the JSONB payload with sort_at mirroring updatedAt.
export const voiceAssistantMemoryTable = pgTable("voice_assistant_memory", {
  assistantId: text("assistant_id").notNull(),
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  namespace: text("namespace").notNull(),
  payload: jsonb("payload").notNull(),
  sortAt: bigint("sort_at", { mode: "number" }).notNull(),
});

const voiceAssistantMemoryId = (input: {
  assistantId: string;
  key: string;
  namespace: string;
}) => JSON.stringify([input.assistantId, input.namespace, input.key]);

const createDrizzleAssistantMemoryStore = <
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
>(
  db: VoiceDrizzleDatabase,
): VoiceAssistantMemoryStore<TRecord> => {
  const get: VoiceAssistantMemoryStore<TRecord>["get"] = async (input) => {
    const rows = await db
      .select({ payload: voiceAssistantMemoryTable.payload })
      .from(voiceAssistantMemoryTable)
      .where(eq(voiceAssistantMemoryTable.id, voiceAssistantMemoryId(input)))
      .limit(1);

    return rows[0]?.payload as TRecord | undefined;
  };

  return {
    get,
    delete: async (input) => {
      await db
        .delete(voiceAssistantMemoryTable)
        .where(eq(voiceAssistantMemoryTable.id, voiceAssistantMemoryId(input)));
    },
    list: async (input) => {
      const rows = await db
        .select({ payload: voiceAssistantMemoryTable.payload })
        .from(voiceAssistantMemoryTable)
        .where(
          input.namespace === undefined
            ? eq(voiceAssistantMemoryTable.assistantId, input.assistantId)
            : and(
                eq(voiceAssistantMemoryTable.assistantId, input.assistantId),
                eq(voiceAssistantMemoryTable.namespace, input.namespace),
              ),
        )
        .orderBy(desc(voiceAssistantMemoryTable.sortAt));

      return rows.map((row) => row.payload as TRecord);
    },
    set: async (input) => {
      const existing = await get(input);
      const record = createVoiceAssistantMemoryRecord({
        ...input,
        createdAt: input.createdAt ?? existing?.createdAt,
        updatedAt: input.updatedAt,
      }) as TRecord;

      await db
        .insert(voiceAssistantMemoryTable)
        .values({
          assistantId: record.assistantId,
          id: voiceAssistantMemoryId(record),
          key: record.key,
          namespace: record.namespace,
          payload: record,
          sortAt: record.updatedAt,
        })
        .onConflictDoUpdate({
          set: {
            payload: record,
            sortAt: record.updatedAt,
          },
          target: voiceAssistantMemoryTable.id,
        });

      return record;
    },
  };
};

export const createVoiceDrizzleAssistantMemoryStore = <
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceAssistantMemoryStore<TRecord> =>
  createDrizzleAssistantMemoryStore<TRecord>(options.db);
