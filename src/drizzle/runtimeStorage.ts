import {
  createVoiceAuditEvent,
  filterVoiceAuditEvents,
  type StoredVoiceAuditEvent,
  type VoiceAuditEventStore,
} from "../core/audit";
import type {
  VoiceAuditSinkDeliveryRecord,
  VoiceAuditSinkDeliveryStore,
} from "../core/auditSinks";
import type { VoiceCampaignRecord, VoiceCampaignStore } from "../core/campaign";
import {
  withVoiceIntegrationEventId,
  withVoiceOpsTaskId,
  type StoredVoiceExternalObjectMap,
  type StoredVoiceIntegrationEvent,
  type StoredVoiceOpsTask,
  type VoiceExternalObjectMapStore,
  type VoiceIntegrationEvent,
  type VoiceIntegrationEventStore,
  type VoiceOpsTask,
  type VoiceOpsTaskStore,
} from "../core/ops";
import { createVoiceSessionRecord, toVoiceSessionSummary } from "../core/store";
import type {
  StoredVoiceTelephonyWebhookDecision,
  VoiceTelephonyWebhookIdempotencyStore,
} from "../core/telephonyOutcome";
import {
  createVoiceTraceEvent,
  filterVoiceTraceEvents,
  type StoredVoiceTraceEvent,
  type VoiceTraceEventStore,
  type VoiceTraceSinkDeliveryRecord,
  type VoiceTraceSinkDeliveryStore,
} from "../core/trace";
import type { VoiceSessionRecord, VoiceSessionStore } from "../core/types";
import {
  withVoiceCallReviewId,
  type StoredVoiceCallReviewArtifact,
  type VoiceCallReviewArtifact,
  type VoiceCallReviewStore,
} from "../testing/review";
import type {
  VoiceAssistantMemoryRecord,
  VoiceAssistantMemoryStore,
} from "../core/assistantMemory";
import type {
  StoredVoiceIncidentBundleArtifact,
  VoiceIncidentBundleStore,
} from "../core/incidentBundle";
import { createVoiceDrizzleAssistantMemoryStore } from "./assistantMemory";
import { createVoiceDrizzleIncidentBundleStore } from "./incidentBundle";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleDatabase,
  type VoiceDrizzleStoreOptions,
} from "./shared";

export const voiceAuditDeliveriesTable = voiceDocumentTable(
  "voice_audit_deliveries",
);
export const voiceAuditTable = voiceDocumentTable("voice_audit");
export const voiceCampaignsTable = voiceDocumentTable("voice_campaigns");
export const voiceEventsTable = voiceDocumentTable("voice_events");
export const voiceExternalObjectsTable = voiceDocumentTable(
  "voice_external_objects",
);
export const voiceReviewsTable = voiceDocumentTable("voice_reviews");
export const voiceSessionsTable = voiceDocumentTable("voice_sessions");
export const voiceTasksTable = voiceDocumentTable("voice_tasks");
export const voiceTelephonyWebhookIdempotencyTable = voiceDocumentTable(
  "voice_telephony_webhook_idempotency",
);
export const voiceTraceDeliveriesTable = voiceDocumentTable(
  "voice_trace_deliveries",
);
export const voiceTracesTable = voiceDocumentTable("voice_traces");

export const voiceRuntimeStorageDrizzleSchema = {
  voiceAudit: voiceAuditTable,
  voiceAuditDeliveries: voiceAuditDeliveriesTable,
  voiceCampaigns: voiceCampaignsTable,
  voiceEvents: voiceEventsTable,
  voiceExternalObjects: voiceExternalObjectsTable,
  voiceReviews: voiceReviewsTable,
  voiceSessions: voiceSessionsTable,
  voiceTasks: voiceTasksTable,
  voiceTelephonyWebhookIdempotency: voiceTelephonyWebhookIdempotencyTable,
  voiceTraceDeliveries: voiceTraceDeliveriesTable,
  voiceTraces: voiceTracesTable,
};

export type VoiceDrizzleRuntimeStorage<
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
  TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
  TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
  TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
  TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
  TTraceDelivery extends VoiceTraceSinkDeliveryRecord =
    VoiceTraceSinkDeliveryRecord,
  TAudit extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
  TAuditDelivery extends VoiceAuditSinkDeliveryRecord =
    VoiceAuditSinkDeliveryRecord,
  TIncident extends StoredVoiceIncidentBundleArtifact =
    StoredVoiceIncidentBundleArtifact,
  TMemory extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
> = {
  audit: VoiceAuditEventStore<TAudit>;
  auditDeliveries: VoiceAuditSinkDeliveryStore<TAuditDelivery>;
  campaigns: VoiceCampaignStore;
  events: VoiceIntegrationEventStore<TEvent>;
  externalObjects: VoiceExternalObjectMapStore<TMapping>;
  incidentBundles: VoiceIncidentBundleStore<TIncident>;
  memories: VoiceAssistantMemoryStore<TMemory>;
  reviews: VoiceCallReviewStore<TReview>;
  session: VoiceSessionStore<TSession>;
  tasks: VoiceOpsTaskStore<TTask>;
  traceDeliveries: VoiceTraceSinkDeliveryStore<TTraceDelivery>;
  traces: VoiceTraceEventStore<TTrace>;
};

const createDrizzleSessionStore = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceSessionStore<TSession> => {
  const store = createVoiceDrizzleRecordStore<TSession>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.lastActivityAt ?? value.createdAt,
    table: voiceSessionsTable,
  });

  const getOrCreate = async (id: string) => {
    const existing = await store.get(id);
    if (existing) {
      return existing;
    }

    const session = createVoiceSessionRecord<TSession>(id);
    await store.set(id, session);

    return session;
  };

  return {
    get: store.get,
    getOrCreate,
    remove: store.remove,
    set: store.set,
    list: async () =>
      (await store.list())
        .map((session) => toVoiceSessionSummary(session))
        .sort(
          (first, second) =>
            (second.lastActivityAt ?? second.createdAt) -
            (first.lastActivityAt ?? first.createdAt),
        ),
  };
};

const createDrizzleReviewStore = <
  TArtifact extends StoredVoiceCallReviewArtifact =
    StoredVoiceCallReviewArtifact,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceCallReviewStore<TArtifact> =>
  createVoiceDrizzleRecordStore<TArtifact>({
    db,
    decorate: (id, value) =>
      withVoiceCallReviewId(id, value as TArtifact & VoiceCallReviewArtifact),
    getSortAt: (value) => value.generatedAt ?? 0,
    table: voiceReviewsTable,
  });

const createDrizzleTaskStore = <
  TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceOpsTaskStore<TTask> =>
  createVoiceDrizzleRecordStore<TTask>({
    db,
    decorate: (id, value) =>
      withVoiceOpsTaskId(id, value as TTask & Omit<VoiceOpsTask, "id">),
    getSortAt: (value) => value.createdAt,
    table: voiceTasksTable,
  });

const createDrizzleEventStore = <
  TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceIntegrationEventStore<TEvent> =>
  createVoiceDrizzleRecordStore<TEvent>({
    db,
    decorate: (id, value) =>
      withVoiceIntegrationEventId(
        id,
        value as TEvent & Omit<VoiceIntegrationEvent, "id">,
      ),
    getSortAt: (value) => value.createdAt,
    table: voiceEventsTable,
  });

const createDrizzleExternalObjectMapStore = <
  TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceExternalObjectMapStore<TMapping> => {
  const store = createVoiceDrizzleRecordStore<TMapping>({
    db,
    decorate: (id, value) => ({
      ...value,
      id,
    }),
    getSortAt: (value) => value.updatedAt,
    table: voiceExternalObjectsTable,
  });

  const find: VoiceExternalObjectMapStore<TMapping>["find"] = async (input) =>
    (await store.list()).find(
      (mapping) =>
        mapping.provider === input.provider &&
        mapping.sourceId === input.sourceId &&
        (input.sinkId === undefined || mapping.sinkId === input.sinkId) &&
        (input.sourceType === undefined ||
          mapping.sourceType === input.sourceType),
    );

  return {
    ...store,
    find,
  };
};

const createDrizzleTraceEventStore = <
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceTraceEventStore<TEvent> => {
  const store = createVoiceDrizzleRecordStore<TEvent>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.at,
    table: voiceTracesTable,
  });

  const append: VoiceTraceEventStore<TEvent>["append"] = async (event) => {
    const stored = createVoiceTraceEvent(event) as TEvent;
    await store.set(stored.id, stored);

    return stored;
  };

  return {
    append,
    get: store.get,
    remove: store.remove,
    list: async (filter) => filterVoiceTraceEvents(await store.list(), filter),
  };
};

const createDrizzleTraceSinkDeliveryStore = <
  TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceTraceSinkDeliveryStore<TDelivery> =>
  createVoiceDrizzleRecordStore<TDelivery>({
    db,
    decorate: (id, value) => ({
      ...value,
      id,
    }),
    getSortAt: (value) => value.createdAt,
    table: voiceTraceDeliveriesTable,
  });

const createDrizzleAuditEventStore = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceAuditEventStore<TEvent> => {
  const store = createVoiceDrizzleRecordStore<TEvent>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.at,
    table: voiceAuditTable,
  });

  const append: VoiceAuditEventStore<TEvent>["append"] = async (event) => {
    const stored = createVoiceAuditEvent(event) as TEvent;
    await store.set(stored.id, stored);

    return stored;
  };

  return {
    append,
    get: store.get,
    list: async (filter) => filterVoiceAuditEvents(await store.list(), filter),
  };
};

const createDrizzleAuditSinkDeliveryStore = <
  TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceAuditSinkDeliveryStore<TDelivery> =>
  createVoiceDrizzleRecordStore<TDelivery>({
    db,
    decorate: (id, value) => ({
      ...value,
      id,
    }),
    getSortAt: (value) => value.createdAt,
    table: voiceAuditDeliveriesTable,
  });

const createDrizzleTelephonyWebhookIdempotencyStore = <
  TResult = unknown,
  DB extends VoiceDrizzleDatabase = VoiceDrizzleDatabase,
>(
  db: DB,
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
  createVoiceDrizzleRecordStore<StoredVoiceTelephonyWebhookDecision<TResult>>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.updatedAt,
    table: voiceTelephonyWebhookIdempotencyTable,
  });

const createDrizzleCampaignStore = <DB extends VoiceDrizzleDatabase>(
  db: DB,
): VoiceCampaignStore =>
  createVoiceDrizzleRecordStore<VoiceCampaignRecord>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.campaign.createdAt,
    table: voiceCampaignsTable,
  });

export const createVoiceDrizzleAuditEventStore = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceAuditEventStore<TEvent> => createDrizzleAuditEventStore(options.db);
export const createVoiceDrizzleAuditSinkDeliveryStore = <
  TDelivery extends VoiceAuditSinkDeliveryRecord = VoiceAuditSinkDeliveryRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceAuditSinkDeliveryStore<TDelivery> =>
  createDrizzleAuditSinkDeliveryStore(options.db);
export const createVoiceDrizzleCampaignStore = (
  options: VoiceDrizzleStoreOptions,
): VoiceCampaignStore => createDrizzleCampaignStore(options.db);
export const createVoiceDrizzleExternalObjectMapStore = <
  TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceExternalObjectMapStore<TMapping> =>
  createDrizzleExternalObjectMapStore(options.db);
export const createVoiceDrizzleIntegrationEventStore = <
  TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceIntegrationEventStore<TEvent> => createDrizzleEventStore(options.db);
export const createVoiceDrizzleReviewStore = <
  TArtifact extends StoredVoiceCallReviewArtifact =
    StoredVoiceCallReviewArtifact,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceCallReviewStore<TArtifact> => createDrizzleReviewStore(options.db);
export const createVoiceDrizzleRuntimeStorage = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TReview extends StoredVoiceCallReviewArtifact = StoredVoiceCallReviewArtifact,
  TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
  TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
  TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
  TTrace extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
  TTraceDelivery extends VoiceTraceSinkDeliveryRecord =
    VoiceTraceSinkDeliveryRecord,
  TAudit extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
  TAuditDelivery extends VoiceAuditSinkDeliveryRecord =
    VoiceAuditSinkDeliveryRecord,
  TIncident extends StoredVoiceIncidentBundleArtifact =
    StoredVoiceIncidentBundleArtifact,
  TMemory extends VoiceAssistantMemoryRecord = VoiceAssistantMemoryRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceDrizzleRuntimeStorage<
  TSession,
  TReview,
  TTask,
  TEvent,
  TMapping,
  TTrace,
  TTraceDelivery,
  TAudit,
  TAuditDelivery,
  TIncident,
  TMemory
> => ({
  audit: createDrizzleAuditEventStore<TAudit>(options.db),
  auditDeliveries: createDrizzleAuditSinkDeliveryStore<TAuditDelivery>(
    options.db,
  ),
  campaigns: createDrizzleCampaignStore(options.db),
  events: createDrizzleEventStore<TEvent>(options.db),
  externalObjects: createDrizzleExternalObjectMapStore<TMapping>(options.db),
  incidentBundles: createVoiceDrizzleIncidentBundleStore<TIncident>({
    db: options.db,
  }),
  memories: createVoiceDrizzleAssistantMemoryStore<TMemory>({ db: options.db }),
  reviews: createDrizzleReviewStore<TReview>(options.db),
  session: createDrizzleSessionStore<TSession>(options.db),
  tasks: createDrizzleTaskStore<TTask>(options.db),
  traceDeliveries: createDrizzleTraceSinkDeliveryStore<TTraceDelivery>(
    options.db,
  ),
  traces: createDrizzleTraceEventStore<TTrace>(options.db),
});
export const createVoiceDrizzleSessionStore = <
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceSessionStore<TSession> => createDrizzleSessionStore(options.db);
export const createVoiceDrizzleTaskStore = <
  TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceOpsTaskStore<TTask> => createDrizzleTaskStore(options.db);
export const createVoiceDrizzleTelephonyWebhookIdempotencyStore = <
  TResult = unknown,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceTelephonyWebhookIdempotencyStore<TResult> =>
  createDrizzleTelephonyWebhookIdempotencyStore<TResult>(options.db);
export const createVoiceDrizzleTraceEventStore = <
  TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceTraceEventStore<TEvent> => createDrizzleTraceEventStore(options.db);
export const createVoiceDrizzleTraceSinkDeliveryStore = <
  TDelivery extends VoiceTraceSinkDeliveryRecord = VoiceTraceSinkDeliveryRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceTraceSinkDeliveryStore<TDelivery> =>
  createDrizzleTraceSinkDeliveryStore(options.db);
