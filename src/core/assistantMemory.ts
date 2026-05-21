import type { VoiceSessionRecord } from "./types";
import type { VoiceTraceEventStore } from "./trace";

export type VoiceAssistantMemoryRecord<
  TValue = unknown,
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  assistantId: string;
  createdAt: number;
  key: string;
  metadata?: TMetadata;
  namespace: string;
  updatedAt: number;
  value: TValue;
};

export type VoiceAssistantMemoryStore<
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
> = {
  delete: (input: {
    assistantId: string;
    key: string;
    namespace: string;
  }) => Promise<void>;
  get: (input: {
    assistantId: string;
    key: string;
    namespace: string;
  }) => Promise<TRecord | undefined>;
  list: (input: {
    assistantId: string;
    namespace?: string;
  }) => Promise<TRecord[]>;
  set: (
    input: Omit<TRecord, "createdAt" | "updatedAt"> & {
      createdAt?: number;
      updatedAt?: number;
    },
  ) => Promise<TRecord>;
};

export type VoiceAssistantMemoryNamespaceInput<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
> = {
  assistantId: string;
  context: TContext;
  session: TSession;
};

export type VoiceAssistantMemoryOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
> = {
  namespace:
    | string
    | ((
        input: VoiceAssistantMemoryNamespaceInput<TContext, TSession>,
      ) => Promise<string> | string);
  store: VoiceAssistantMemoryStore<TRecord>;
};

export type VoiceAssistantMemoryBinding<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
> = VoiceAssistantMemoryOptions<TContext, TSession, TRecord>;

export type VoiceAssistantMemoryHandle<
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
> = {
  delete: (key: string) => Promise<void>;
  get: <TValue = unknown>(key: string) => Promise<TValue | undefined>;
  list: () => Promise<TRecord[]>;
  namespace: string;
  set: <TValue = unknown>(
    key: string,
    value: TValue,
    metadata?: Record<string, unknown>,
  ) => Promise<TRecord>;
};

const createMemoryId = (input: {
  assistantId: string;
  key: string;
  namespace: string;
}) => `${input.assistantId}:${input.namespace}:${input.key}`;

export const createVoiceAssistantMemoryRecord = <
  TValue = unknown,
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
>(
  input: Omit<
    VoiceAssistantMemoryRecord<TValue, TMetadata>,
    "createdAt" | "updatedAt"
  > & {
    createdAt?: number;
    updatedAt?: number;
  },
): VoiceAssistantMemoryRecord<TValue, TMetadata> => {
  const now = Date.now();
  return {
    ...input,
    createdAt: input.createdAt ?? input.updatedAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
};

export const createVoiceMemoryAssistantMemoryStore = <
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
>(): VoiceAssistantMemoryStore<TRecord> => {
  const records = new Map<string, TRecord>();

  return {
    delete: async (input) => {
      records.delete(createMemoryId(input));
    },
    get: async (input) => records.get(createMemoryId(input)),
    list: async (input) =>
      [...records.values()]
        .filter(
          (record) =>
            record.assistantId === input.assistantId &&
            (input.namespace === undefined ||
              record.namespace === input.namespace),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    set: async (input) => {
      const id = createMemoryId(input);
      const existing = records.get(id);
      const record = createVoiceAssistantMemoryRecord({
        ...input,
        createdAt: input.createdAt ?? existing?.createdAt,
        updatedAt: input.updatedAt,
      }) as TRecord;
      records.set(id, record);
      return record;
    },
  };
};

export const resolveVoiceAssistantMemoryNamespace = async <
  TContext,
  TSession extends VoiceSessionRecord,
>(
  input: VoiceAssistantMemoryNamespaceInput<TContext, TSession> & {
    memory: VoiceAssistantMemoryOptions<TContext, TSession>;
  },
) =>
  typeof input.memory.namespace === "function"
    ? await input.memory.namespace(input)
    : input.memory.namespace;

export const createVoiceAssistantMemoryHandle = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TRecord extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
>(input: {
  assistantId: string;
  context: TContext;
  memory: VoiceAssistantMemoryOptions<TContext, TSession, TRecord>;
  session: TSession;
  trace?: VoiceTraceEventStore;
}): Promise<VoiceAssistantMemoryHandle<TRecord>> => {
  const namespace = await resolveVoiceAssistantMemoryNamespace({
    assistantId: input.assistantId,
    context: input.context,
    memory: input.memory as VoiceAssistantMemoryOptions<TContext, TSession>,
    session: input.session,
  });
  const trace = async (event: Record<string, unknown>) => {
    await input.trace?.append({
      at: Date.now(),
      payload: {
        assistantId: input.assistantId,
        namespace,
        ...event,
      },
      scenarioId: input.session.scenarioId,
      sessionId: input.session.id,
      type: "assistant.memory",
    });
  };

  return {
    delete: async (key) => {
      await input.memory.store.delete({
        assistantId: input.assistantId,
        key,
        namespace,
      });
      await trace({
        action: "delete",
        key,
      });
    },
    get: async (key) => {
      const record = await input.memory.store.get({
        assistantId: input.assistantId,
        key,
        namespace,
      });
      await trace({
        action: "get",
        found: Boolean(record),
        key,
      });
      return record?.value as never;
    },
    list: async () => {
      const records = await input.memory.store.list({
        assistantId: input.assistantId,
        namespace,
      });
      await trace({
        action: "list",
        count: records.length,
      });
      return records;
    },
    namespace,
    set: async (key, value, metadata) => {
      const record = await input.memory.store.set({
        assistantId: input.assistantId,
        key,
        metadata,
        namespace,
        value,
      } as never);
      await trace({
        action: "set",
        key,
      });
      return record;
    },
  };
};
