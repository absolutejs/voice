import { desc, eq, type TablesRelationalConfig } from "drizzle-orm";
import {
  bigint,
  jsonb,
  pgTable,
  text,
  type PgDatabase,
  type PgQueryResultHKT,
} from "drizzle-orm/pg-core";

// Every voice store is a JSONB document table shaped (id, sort_at, payload),
// matching the Postgres family. Tables are real Drizzle definitions so the
// schema can be managed with drizzle-kit (push/migrate) and inspected in
// Drizzle Studio, while reads/writes go through the typed query builder.
export const voiceDocumentTable = (name: string) =>
  pgTable(name, {
    id: text("id").primaryKey(),
    payload: jsonb("payload").notNull(),
    sortAt: bigint("sort_at", { mode: "number" }).notNull(),
  });

export type VoiceDrizzleDocumentTable = ReturnType<typeof voiceDocumentTable>;

// Any Drizzle Postgres database, regardless of the schema it was created with.
// Widening TFullSchema/TSchema lets callers pass a `drizzle(client, { schema })`
// instance (neon-http, node-postgres, pglite, …) carrying their own tables.
export type VoiceDrizzleDatabase = PgDatabase<
  PgQueryResultHKT,
  Record<string, unknown>,
  TablesRelationalConfig
>;

export type VoiceDrizzleStoreOptions = {
  db: VoiceDrizzleDatabase;
};

export const createVoiceDrizzleRecordStore = <T>(input: {
  db: VoiceDrizzleDatabase;
  decorate: (id: string, value: T) => T;
  getSortAt: (value: T) => number;
  table: VoiceDrizzleDocumentTable;
}) => {
  const get = async (id: string) => {
    const rows = await input.db
      .select({ payload: input.table.payload })
      .from(input.table)
      .where(eq(input.table.id, id))
      .limit(1);

    return rows[0]?.payload as T | undefined;
  };

  const list = async () => {
    const rows = await input.db
      .select({ payload: input.table.payload })
      .from(input.table)
      .orderBy(desc(input.table.sortAt), desc(input.table.id));

    return rows.map((row) => row.payload as T);
  };

  const set = async (id: string, value: T) => {
    const decorated = input.decorate(id, value);
    await input.db
      .insert(input.table)
      .values({
        id,
        payload: decorated,
        sortAt: input.getSortAt(decorated),
      })
      .onConflictDoUpdate({
        set: {
          payload: decorated,
          sortAt: input.getSortAt(decorated),
        },
        target: input.table.id,
      });
  };

  const remove = async (id: string) => {
    await input.db.delete(input.table).where(eq(input.table.id, id));
  };

  return { get, list, remove, set };
};
