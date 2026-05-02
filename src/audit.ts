export type VoiceAuditEventType =
  | "handoff"
  | "operator.action"
  | "profile.switch"
  | "provider.call"
  | "retention.policy"
  | "tool.call";

export type VoiceAuditActor = {
  id: string;
  kind: "agent" | "operator" | "system" | "worker";
  name?: string;
};

export type VoiceAuditResource = {
  id?: string;
  type: string;
};

export type VoiceAuditOutcome = "error" | "skipped" | "success";

export type VoiceAuditEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  action: string;
  actor?: VoiceAuditActor;
  at?: number;
  id?: string;
  metadata?: Record<string, unknown>;
  outcome?: VoiceAuditOutcome;
  payload?: TPayload;
  resource?: VoiceAuditResource;
  sessionId?: string;
  traceId?: string;
  type: VoiceAuditEventType;
};

export type StoredVoiceAuditEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = Omit<VoiceAuditEvent<TPayload>, "at" | "id"> & {
  at: number;
  id: string;
};

export type VoiceAuditEventFilter = {
  actorId?: string;
  after?: number;
  afterOrAt?: number;
  before?: number;
  beforeOrAt?: number;
  limit?: number;
  outcome?: VoiceAuditOutcome | VoiceAuditOutcome[];
  readWindow?: "recent";
  resourceId?: string;
  resourceType?: string;
  sessionId?: string;
  traceId?: string;
  type?: VoiceAuditEventType | VoiceAuditEventType[];
};

export type VoiceAuditEventStore<
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
> = {
  append: (event: VoiceAuditEvent | TEvent) => Promise<TEvent> | TEvent;
  get: (id: string) => Promise<TEvent | undefined> | TEvent | undefined;
  list: (filter?: VoiceAuditEventFilter) => Promise<TEvent[]> | TEvent[];
};

export type VoiceScopedAuditEventStoreOptions = VoiceAuditEventFilter;

export type VoiceAuditLogger = {
  handoff: (
    input: Omit<VoiceHandoffAuditEventInput, "store">,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
  operatorAction: (
    input: Omit<VoiceOperatorAuditEventInput, "store">,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
  providerCall: (
    input: Omit<VoiceProviderAuditEventInput, "store">,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
  record: (
    event: VoiceAuditEvent,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
  retention: (
    input: Omit<VoiceRetentionAuditEventInput, "store">,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
  toolCall: (
    input: Omit<VoiceToolAuditEventInput, "store">,
  ) => Promise<StoredVoiceAuditEvent> | StoredVoiceAuditEvent;
};

export type VoiceProviderAuditEventInput = {
  actor?: VoiceAuditActor;
  cost?: Record<string, unknown>;
  elapsedMs?: number;
  error?: string;
  kind: "llm" | "stt" | "tts" | string;
  metadata?: Record<string, unknown>;
  model?: string;
  outcome: VoiceAuditOutcome;
  provider: string;
  sessionId?: string;
  store: VoiceAuditEventStore;
  traceId?: string;
};

export type VoiceToolAuditEventInput = {
  actor?: VoiceAuditActor;
  elapsedMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  outcome: VoiceAuditOutcome;
  sessionId?: string;
  store: VoiceAuditEventStore;
  toolCallId?: string;
  toolName: string;
  traceId?: string;
};

export type VoiceHandoffAuditEventInput = {
  actor?: VoiceAuditActor;
  fromAgentId?: string;
  metadata?: Record<string, unknown>;
  outcome: VoiceAuditOutcome;
  reason?: string;
  sessionId?: string;
  store: VoiceAuditEventStore;
  target?: string;
  toAgentId?: string;
  traceId?: string;
};

export type VoiceRetentionAuditEventInput = {
  actor?: VoiceAuditActor;
  dryRun: boolean;
  metadata?: Record<string, unknown>;
  report: {
    deletedCount: number;
    scopes: Array<{
      deletedCount: number;
      scope: string;
      skippedReason?: string;
    }>;
  };
  store: VoiceAuditEventStore;
};

export type VoiceOperatorAuditEventInput = {
  action: string;
  actor: VoiceAuditActor;
  metadata?: Record<string, unknown>;
  outcome?: VoiceAuditOutcome;
  payload?: Record<string, unknown>;
  resource?: VoiceAuditResource;
  sessionId?: string;
  store: VoiceAuditEventStore;
  traceId?: string;
};

const includes = <TValue extends string>(
  filter: TValue | TValue[] | undefined,
  value: TValue | undefined,
) => {
  if (!filter) {
    return true;
  }

  if (!value) {
    return false;
  }

  return Array.isArray(filter) ? filter.includes(value) : filter === value;
};

export const createVoiceAuditEvent = <
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>(
  event: VoiceAuditEvent<TPayload>,
): StoredVoiceAuditEvent<TPayload> => ({
  ...event,
  at: event.at ?? Date.now(),
  id: event.id ?? crypto.randomUUID(),
});

export const filterVoiceAuditEvents = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(
  events: TEvent[],
  filter: VoiceAuditEventFilter = {},
) => {
  const sorted = events
    .filter((event) => {
      if (!includes(filter.type, event.type)) {
        return false;
      }

      if (!includes(filter.outcome, event.outcome)) {
        return false;
      }

      if (filter.actorId && event.actor?.id !== filter.actorId) {
        return false;
      }

      if (filter.resourceId && event.resource?.id !== filter.resourceId) {
        return false;
      }

      if (filter.resourceType && event.resource?.type !== filter.resourceType) {
        return false;
      }

      if (filter.sessionId && event.sessionId !== filter.sessionId) {
        return false;
      }

      if (filter.traceId && event.traceId !== filter.traceId) {
        return false;
      }

      if (typeof filter.after === "number" && event.at <= filter.after) {
        return false;
      }

      if (typeof filter.afterOrAt === "number" && event.at < filter.afterOrAt) {
        return false;
      }

      if (typeof filter.before === "number" && event.at >= filter.before) {
        return false;
      }

      if (
        typeof filter.beforeOrAt === "number" &&
        event.at > filter.beforeOrAt
      ) {
        return false;
      }

      return true;
    })
    .sort(
      (left, right) => left.at - right.at || left.id.localeCompare(right.id),
    );

  return typeof filter.limit === "number" && filter.limit >= 0
    ? sorted.slice(0, filter.limit)
    : sorted;
};

export const createVoiceScopedAuditEventStore = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(
  store: VoiceAuditEventStore<TEvent>,
  scope: VoiceScopedAuditEventStoreOptions,
): VoiceAuditEventStore<TEvent> => {
  const upstreamFilter = (filter: VoiceAuditEventFilter = {}) => {
    const next = { ...filter };
    delete next.limit;
    if (scope.actorId !== undefined) {
      delete next.actorId;
    }
    if (scope.outcome !== undefined) {
      delete next.outcome;
    }
    if (scope.resourceId !== undefined) {
      delete next.resourceId;
    }
    if (scope.resourceType !== undefined) {
      delete next.resourceType;
    }
    if (scope.sessionId !== undefined) {
      delete next.sessionId;
    }
    if (scope.traceId !== undefined) {
      delete next.traceId;
    }
    if (scope.type !== undefined) {
      delete next.type;
    }

    return next;
  };
  const scopedFilter = (filter: VoiceAuditEventFilter = {}) => ({
    ...filter,
    ...scope,
  });

  return {
    append: (event) => store.append(event),
    get: (id) => store.get(id),
    list: async (filter) =>
      filterVoiceAuditEvents(
        await store.list(upstreamFilter(filter)),
        scopedFilter(filter),
      ),
  };
};

export const createVoiceMemoryAuditEventStore = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(): VoiceAuditEventStore<TEvent> => {
  const events = new Map<string, TEvent>();

  return {
    append: (event) => {
      const stored = createVoiceAuditEvent(event) as TEvent;
      events.set(stored.id, stored);
      return stored;
    },
    get: (id) => events.get(id),
    list: (filter) => filterVoiceAuditEvents([...events.values()], filter),
  };
};

export const recordVoiceAuditEvent = (
  store: VoiceAuditEventStore,
  event: VoiceAuditEvent,
) => store.append(createVoiceAuditEvent(event));

export const recordVoiceProviderAuditEvent = (
  input: VoiceProviderAuditEventInput,
) =>
  recordVoiceAuditEvent(input.store, {
    action: `${input.kind}.provider.call`,
    actor: input.actor,
    metadata: input.metadata,
    outcome: input.outcome,
    payload: {
      cost: input.cost,
      elapsedMs: input.elapsedMs,
      error: input.error,
      kind: input.kind,
      model: input.model,
      provider: input.provider,
    },
    resource: {
      id: input.provider,
      type: "provider",
    },
    sessionId: input.sessionId,
    traceId: input.traceId,
    type: "provider.call",
  });

export const recordVoiceToolAuditEvent = (input: VoiceToolAuditEventInput) =>
  recordVoiceAuditEvent(input.store, {
    action: "tool.call",
    actor: input.actor,
    metadata: input.metadata,
    outcome: input.outcome,
    payload: {
      elapsedMs: input.elapsedMs,
      error: input.error,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
    },
    resource: {
      id: input.toolName,
      type: "tool",
    },
    sessionId: input.sessionId,
    traceId: input.traceId,
    type: "tool.call",
  });

export const recordVoiceHandoffAuditEvent = (
  input: VoiceHandoffAuditEventInput,
) =>
  recordVoiceAuditEvent(input.store, {
    action: "handoff",
    actor: input.actor,
    metadata: input.metadata,
    outcome: input.outcome,
    payload: {
      fromAgentId: input.fromAgentId,
      reason: input.reason,
      target: input.target,
      toAgentId: input.toAgentId,
    },
    resource: {
      id: input.toAgentId ?? input.target,
      type: "handoff",
    },
    sessionId: input.sessionId,
    traceId: input.traceId,
    type: "handoff",
  });

export const recordVoiceRetentionAuditEvent = (
  input: VoiceRetentionAuditEventInput,
) =>
  recordVoiceAuditEvent(input.store, {
    action: input.dryRun ? "retention.plan" : "retention.apply",
    actor: input.actor ?? {
      id: "voice-retention",
      kind: "system",
    },
    metadata: input.metadata,
    outcome: "success",
    payload: {
      deletedCount: input.report.deletedCount,
      dryRun: input.dryRun,
      scopes: input.report.scopes,
    },
    resource: {
      type: "retention-policy",
    },
    type: "retention.policy",
  });

export const recordVoiceOperatorAuditEvent = (
  input: VoiceOperatorAuditEventInput,
) =>
  recordVoiceAuditEvent(input.store, {
    action: input.action,
    actor: input.actor,
    metadata: input.metadata,
    outcome: input.outcome ?? "success",
    payload: input.payload,
    resource: input.resource,
    sessionId: input.sessionId,
    traceId: input.traceId,
    type: "operator.action",
  });

export const createVoiceAuditLogger = (
  store: VoiceAuditEventStore,
): VoiceAuditLogger => ({
  handoff: (input) => recordVoiceHandoffAuditEvent({ ...input, store }),
  operatorAction: (input) => recordVoiceOperatorAuditEvent({ ...input, store }),
  providerCall: (input) => recordVoiceProviderAuditEvent({ ...input, store }),
  record: (event) => recordVoiceAuditEvent(store, event),
  retention: (input) => recordVoiceRetentionAuditEvent({ ...input, store }),
  toolCall: (input) => recordVoiceToolAuditEvent({ ...input, store }),
});
