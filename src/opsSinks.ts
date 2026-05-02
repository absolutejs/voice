import type {
  StoredVoiceExternalObjectMap,
  StoredVoiceIntegrationEvent,
  VoiceExternalObjectMap,
  VoiceExternalObjectMapStore,
  VoiceIntegrationDeliveryStatus,
  VoiceIntegrationEventType,
  VoiceIntegrationSinkDelivery,
  VoiceIntegrationWebhookConfig,
} from "./ops";

export type VoiceIntegrationSinkDeliveryResult = {
  attempts: number;
  deliveredAt?: number;
  deliveredTo?: string;
  error?: string;
  responseBody?: unknown;
  status: VoiceIntegrationDeliveryStatus;
};

export type VoiceIntegrationSink = {
  deliver: (input: {
    event: StoredVoiceIntegrationEvent;
  }) =>
    | Promise<VoiceIntegrationSinkDeliveryResult>
    | VoiceIntegrationSinkDeliveryResult;
  eventTypes?: VoiceIntegrationEventType[];
  id: string;
  kind?: string;
};

export type VoiceIntegrationHTTPSinkOptions<
  TBody extends Record<string, unknown> = Record<string, unknown>,
> = VoiceIntegrationWebhookConfig & {
  body?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) => TBody | Promise<TBody>;
  id: string;
  kind?: string;
  method?: "POST" | "PUT" | "PATCH";
};

export type VoiceHelpdeskTicketSinkOptions = VoiceIntegrationHTTPSinkOptions & {
  project?: string;
};

export type VoiceCRMActivitySinkOptions = VoiceIntegrationHTTPSinkOptions & {
  pipeline?: string;
};

export type VoiceZendeskTicketSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  accessToken: string;
  baseUrl?: string;
  buildTicket?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  externalObjects?: VoiceExternalObjectMapStore;
  resolveExternalId?: (input: {
    event: StoredVoiceIntegrationEvent;
    responseBody: unknown;
  }) => Promise<string | undefined> | string | undefined;
  requester?: {
    email?: string;
    name?: string;
  };
  subdomain?: string;
};

export type VoiceZendeskTicketSyncSinkOptions = Omit<
  VoiceZendeskTicketSinkOptions,
  "eventTypes"
> & {
  create?: Partial<VoiceZendeskTicketSinkOptions>;
  createId?: string;
  update?: Partial<VoiceZendeskTicketUpdateSinkOptions>;
  updateId?: string;
};

type VoiceSinkValueResolver =
  | string
  | ((input: {
      event: StoredVoiceIntegrationEvent;
    }) => Promise<string | undefined> | string | undefined);

export type VoiceZendeskTicketUpdateSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  accessToken: string;
  baseUrl?: string;
  buildTicket?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  externalObjects?: VoiceExternalObjectMapStore;
  status?: string;
  subdomain?: string;
  ticketId?: VoiceSinkValueResolver;
};

export type VoiceHubSpotTaskSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  accessToken: string;
  associations?:
    | Array<Record<string, unknown>>
    | ((input: {
        event: StoredVoiceIntegrationEvent;
      }) =>
        | Array<Record<string, unknown>>
        | Promise<Array<Record<string, unknown>>>);
  baseUrl?: string;
  buildProperties?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) =>
    | Record<string, string | number>
    | Promise<Record<string, string | number>>;
  externalObjects?: VoiceExternalObjectMapStore;
  ownerId?: string;
  resolveExternalId?: (input: {
    event: StoredVoiceIntegrationEvent;
    responseBody: unknown;
  }) => Promise<string | undefined> | string | undefined;
};

export type VoiceHubSpotTaskSyncSinkOptions = Omit<
  VoiceHubSpotTaskSinkOptions,
  "eventTypes"
> & {
  create?: Partial<VoiceHubSpotTaskSinkOptions>;
  createId?: string;
  update?: Partial<VoiceHubSpotTaskUpdateSinkOptions>;
  updateId?: string;
};

export type VoiceHubSpotTaskUpdateSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  accessToken: string;
  baseUrl?: string;
  buildProperties?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) =>
    | Record<string, string | number>
    | Promise<Record<string, string | number>>;
  externalObjects?: VoiceExternalObjectMapStore;
  taskId?: VoiceSinkValueResolver;
};

export type VoiceLinearIssueSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  apiKey?: string;
  authMode?: "api-key" | "bearer";
  accessToken?: string;
  apiUrl?: string;
  buildIssueInput?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  externalObjects?: VoiceExternalObjectMapStore;
  resolveExternalId?: (input: {
    event: StoredVoiceIntegrationEvent;
    responseBody: unknown;
  }) => Promise<string | undefined> | string | undefined;
  teamId: string;
};

export type VoiceLinearIssueSyncSinkOptions = Omit<
  VoiceLinearIssueSinkOptions,
  "eventTypes"
> & {
  create?: Partial<VoiceLinearIssueSinkOptions>;
  createId?: string;
  update?: Partial<VoiceLinearIssueUpdateSinkOptions>;
  updateId?: string;
};

export type VoiceLinearIssueUpdateSinkOptions = Omit<
  VoiceIntegrationHTTPSinkOptions,
  "body" | "url"
> & {
  apiKey?: string;
  authMode?: "api-key" | "bearer";
  accessToken?: string;
  apiUrl?: string;
  buildIssueInput?: (input: {
    event: StoredVoiceIntegrationEvent;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  externalObjects?: VoiceExternalObjectMapStore;
  issueId?: VoiceSinkValueResolver;
  stateId?: string;
};

const sleep = async (delayMs: number) => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const signVoiceIntegrationSinkBody = async (input: {
  body: string;
  secret: string;
  timestamp: string;
}) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    {
      hash: "SHA-256",
      name: "HMAC",
    },
    false,
    ["sign"],
  );
  const payload = encoder.encode(`${input.timestamp}.${input.body}`);
  const signature = await crypto.subtle.sign("HMAC", key, payload);

  return `sha256=${toHex(new Uint8Array(signature))}`;
};

const createVoiceSinkDeliveryError = (input: {
  attempt: number;
  error?: unknown;
  response?: Response;
}) => {
  if (input.response) {
    const statusText = input.response.statusText?.trim();
    return `Attempt ${input.attempt} failed with sink response ${input.response.status}${statusText ? ` ${statusText}` : ""}.`;
  }

  if (input.error instanceof Error) {
    return `Attempt ${input.attempt} failed: ${input.error.message}`;
  }

  return `Attempt ${input.attempt} failed: ${String(input.error)}`;
};

const deliverVoiceHTTPSinkPayload = async (input: {
  body: string;
  config: VoiceIntegrationHTTPSinkOptions;
}): Promise<VoiceIntegrationSinkDeliveryResult> => {
  const fetchImpl = input.config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return {
      attempts: 0,
      deliveredTo: input.config.url,
      error: "Sink delivery failed: fetch is not available in this runtime.",
      status: "failed",
    };
  }

  const maxRetries = Math.max(0, input.config.retries ?? 0);
  const backoffMs = Math.max(0, input.config.backoffMs ?? 250);
  const timeoutMs = Math.max(0, input.config.timeoutMs ?? 10_000);
  let lastError = "Sink delivery failed.";

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...input.config.headers,
      };

      if (input.config.signingSecret) {
        const timestamp = String(Date.now());
        headers["x-absolutejs-timestamp"] = timestamp;
        headers["x-absolutejs-signature"] = await signVoiceIntegrationSinkBody({
          body: input.body,
          secret: input.config.signingSecret,
          timestamp,
        });
      }

      controller = timeoutMs > 0 ? new AbortController() : undefined;
      if (controller && timeoutMs > 0) {
        timeout = setTimeout(() => controller?.abort(), timeoutMs);
      }

      const response = await fetchImpl(input.config.url, {
        body: input.body,
        headers,
        method: input.config.method ?? "POST",
        signal: controller?.signal,
      });
      if (response.ok) {
        let responseBody: unknown;
        try {
          responseBody = await response.clone().json();
        } catch {
          responseBody = undefined;
        }

        if (timeout) {
          clearTimeout(timeout);
        }

        return {
          attempts: attempt,
          deliveredAt: Date.now(),
          deliveredTo: input.config.url,
          responseBody,
          status: "delivered",
        };
      }

      lastError = createVoiceSinkDeliveryError({
        attempt,
        response,
      });
    } catch (error) {
      lastError = createVoiceSinkDeliveryError({
        attempt,
        error,
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (attempt <= maxRetries) {
      await sleep(backoffMs * attempt);
    }
  }

  return {
    attempts: maxRetries + 1,
    deliveredTo: input.config.url,
    error: lastError,
    status: "failed",
  };
};

const normalizeSinkDelivery = (input: {
  previous?: VoiceIntegrationSinkDelivery;
  result: VoiceIntegrationSinkDeliveryResult;
  sink: VoiceIntegrationSink;
}): VoiceIntegrationSinkDelivery => ({
  attempts: (input.previous?.attempts ?? 0) + input.result.attempts,
  deliveredAt: input.result.deliveredAt ?? input.previous?.deliveredAt,
  deliveredTo: input.result.deliveredTo ?? input.previous?.deliveredTo,
  error: input.result.error,
  sinkId: input.sink.id,
  sinkKind: input.sink.kind,
  status: input.result.status,
});

const aggregateVoiceIntegrationDeliveryStatus = (
  event: StoredVoiceIntegrationEvent,
): VoiceIntegrationDeliveryStatus | undefined => {
  const statuses = [
    ...(event.deliveryStatus && event.deliveryStatus !== "pending"
      ? [event.deliveryStatus]
      : []),
    ...Object.values(event.sinkDeliveries ?? {}).map(
      (delivery) => delivery.status,
    ),
  ];

  if (statuses.length === 0) {
    return event.deliveryStatus;
  }

  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.every((status) => status === "skipped")) {
    return "skipped";
  }

  if (statuses.some((status) => status === "delivered")) {
    return "delivered";
  }

  if (statuses.some((status) => status === "pending")) {
    return "pending";
  }

  return event.deliveryStatus;
};

const mergeVoiceSinkAggregateStatus = (
  event: StoredVoiceIntegrationEvent,
  aggregateStatus: VoiceIntegrationDeliveryStatus | undefined,
): VoiceIntegrationDeliveryStatus | undefined => {
  if (!aggregateStatus) {
    return event.deliveryStatus;
  }

  if (
    event.deliveryStatus === undefined ||
    event.deliveryStatus === "pending"
  ) {
    return aggregateStatus;
  }

  return event.deliveryStatus;
};

const buildHelpdeskTicketBody = (
  event: StoredVoiceIntegrationEvent,
  project?: string,
) => {
  const payload = event.payload;
  return {
    event: {
      createdAt: event.createdAt,
      id: event.id,
      type: event.type,
    },
    project,
    source: "absolutejs-voice",
    ticket: {
      assignee:
        typeof payload.assignee === "string" ? payload.assignee : undefined,
      description:
        typeof payload.recommendedAction === "string"
          ? payload.recommendedAction
          : typeof payload.postCall === "object" &&
              payload.postCall &&
              "summary" in payload.postCall &&
              typeof payload.postCall.summary === "string"
            ? payload.postCall.summary
            : undefined,
      externalId:
        typeof payload.taskId === "string"
          ? payload.taskId
          : typeof payload.reviewId === "string"
            ? payload.reviewId
            : event.id,
      kind: typeof payload.kind === "string" ? payload.kind : undefined,
      outcome:
        typeof payload.outcome === "string" ? payload.outcome : undefined,
      priority:
        typeof payload.priority === "string" ? payload.priority : undefined,
      queue: typeof payload.queue === "string" ? payload.queue : undefined,
      rawPayload: payload,
      reviewId:
        typeof payload.reviewId === "string" ? payload.reviewId : undefined,
      status:
        typeof payload.status === "string"
          ? payload.status
          : event.type === "review.saved"
            ? "open"
            : undefined,
      target: typeof payload.target === "string" ? payload.target : undefined,
      taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
      title:
        typeof payload.title === "string"
          ? payload.title
          : typeof payload.postCall === "object" &&
              payload.postCall &&
              "label" in payload.postCall &&
              typeof payload.postCall.label === "string"
            ? payload.postCall.label
            : event.type,
    },
  };
};

const buildCRMActivityBody = (
  event: StoredVoiceIntegrationEvent,
  pipeline?: string,
) => {
  const payload = event.payload;
  const entityType =
    event.type === "call.completed"
      ? "call"
      : event.type === "review.saved"
        ? "review"
        : "task";
  const entityId =
    typeof payload.sessionId === "string"
      ? payload.sessionId
      : typeof payload.reviewId === "string"
        ? payload.reviewId
        : typeof payload.taskId === "string"
          ? payload.taskId
          : event.id;

  return {
    activity: {
      assignee:
        typeof payload.assignee === "string" ? payload.assignee : undefined,
      entityId,
      entityType,
      eventType: event.type,
      externalId: event.id,
      outcome:
        typeof payload.outcome === "string"
          ? payload.outcome
          : typeof payload.disposition === "string"
            ? payload.disposition
            : undefined,
      priority:
        typeof payload.priority === "string" ? payload.priority : undefined,
      queue: typeof payload.queue === "string" ? payload.queue : undefined,
      rawPayload: payload,
      scenarioId:
        typeof payload.scenarioId === "string" ? payload.scenarioId : undefined,
      summary:
        typeof payload.recommendedAction === "string"
          ? payload.recommendedAction
          : typeof payload.postCall === "object" &&
              payload.postCall &&
              "summary" in payload.postCall &&
              typeof payload.postCall.summary === "string"
            ? payload.postCall.summary
            : undefined,
      title:
        typeof payload.title === "string"
          ? payload.title
          : typeof payload.postCall === "object" &&
              payload.postCall &&
              "label" in payload.postCall &&
              typeof payload.postCall.label === "string"
            ? payload.postCall.label
            : event.type,
    },
    event: {
      createdAt: event.createdAt,
      id: event.id,
      type: event.type,
    },
    pipeline,
    source: "absolutejs-voice",
  };
};

const resolveVoiceSinkText = (
  event: StoredVoiceIntegrationEvent,
  fallback: string,
) => {
  const payload = event.payload;
  if (typeof payload.recommendedAction === "string") {
    return payload.recommendedAction;
  }

  if (
    typeof payload.postCall === "object" &&
    payload.postCall &&
    "summary" in payload.postCall &&
    typeof payload.postCall.summary === "string"
  ) {
    return payload.postCall.summary;
  }

  if (typeof payload.title === "string") {
    return payload.title;
  }

  return fallback;
};

const resolveVoiceSinkPriority = (
  event: StoredVoiceIntegrationEvent,
): string | undefined =>
  typeof event.payload.priority === "string"
    ? event.payload.priority
    : undefined;

const resolveVoiceHubSpotPriority = (
  event: StoredVoiceIntegrationEvent,
): "HIGH" | "LOW" | "MEDIUM" => {
  const priority = resolveVoiceSinkPriority(event);
  switch (priority) {
    case "urgent":
    case "high":
      return "HIGH";
    case "low":
      return "LOW";
    default:
      return "MEDIUM";
  }
};

const resolveVoiceHubSpotTaskType = (
  event: StoredVoiceIntegrationEvent,
): "CALL" | "EMAIL" | "TODO" => {
  switch (event.payload.kind) {
    case "callback":
      return "CALL";
    default:
      return "TODO";
  }
};

const resolveVoiceLinearIssueTitle = (event: StoredVoiceIntegrationEvent) => {
  if (typeof event.payload.title === "string") {
    return event.payload.title;
  }

  if (typeof event.payload.kind === "string") {
    return `${event.payload.kind}: ${event.type}`;
  }

  return event.type;
};

const resolveVoiceSinkValue = async (
  value: VoiceSinkValueResolver | undefined,
  event: StoredVoiceIntegrationEvent,
  payloadKeys: string[],
) => {
  if (typeof value === "function") {
    return value({
      event,
    });
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  for (const key of payloadKeys) {
    const payloadValue = event.payload[key];
    if (typeof payloadValue === "string" && payloadValue.length > 0) {
      return payloadValue;
    }
  }

  return undefined;
};

const resolveVoiceSourceId = (
  event: StoredVoiceIntegrationEvent,
): {
  sourceId: string;
  sourceType: VoiceExternalObjectMap["sourceType"];
} => {
  if (typeof event.payload.taskId === "string") {
    return {
      sourceId: event.payload.taskId,
      sourceType: "task",
    };
  }

  if (typeof event.payload.reviewId === "string") {
    return {
      sourceId: event.payload.reviewId,
      sourceType: "review",
    };
  }

  if (typeof event.payload.sessionId === "string") {
    return {
      sourceId: event.payload.sessionId,
      sourceType: "session",
    };
  }

  return {
    sourceId: event.id,
    sourceType: "event",
  };
};

const createVoiceExternalObjectMapId = (input: {
  provider: string;
  sinkId?: string;
  sourceId: string;
}) =>
  [
    input.provider,
    input.sinkId ?? "default",
    encodeURIComponent(input.sourceId),
  ].join(":");

const storeVoiceExternalObjectMapping = async (input: {
  event: StoredVoiceIntegrationEvent;
  externalId?: string;
  provider: string;
  sinkId?: string;
  store?: VoiceExternalObjectMapStore;
}) => {
  if (!input.store || !input.externalId) {
    return;
  }

  const source = resolveVoiceSourceId(input.event);
  const existing = await input.store.find({
    provider: input.provider,
    sinkId: input.sinkId,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
  });
  const at = Date.now();
  const mapping: StoredVoiceExternalObjectMap = {
    createdAt: existing?.createdAt ?? at,
    externalId: input.externalId,
    id:
      existing?.id ??
      createVoiceExternalObjectMapId({
        provider: input.provider,
        sinkId: input.sinkId,
        sourceId: source.sourceId,
      }),
    provider: input.provider,
    sinkId: input.sinkId,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    updatedAt: at,
  };

  await input.store.set(mapping.id, mapping);
};

const findVoiceExternalObjectId = async (input: {
  event: StoredVoiceIntegrationEvent;
  provider: string;
  sinkId?: string;
  store?: VoiceExternalObjectMapStore;
}) => {
  if (!input.store) {
    return undefined;
  }

  const source = resolveVoiceSourceId(input.event);
  const exact = await input.store.find({
    provider: input.provider,
    sinkId: input.sinkId,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
  });

  if (exact) {
    return exact.externalId;
  }

  const providerMatch = await input.store.find({
    provider: input.provider,
    sourceId: source.sourceId,
    sourceType: source.sourceType,
  });

  return providerMatch?.externalId;
};

const resolveZendeskExternalId = (responseBody: unknown) => {
  if (
    typeof responseBody === "object" &&
    responseBody &&
    "ticket" in responseBody &&
    typeof responseBody.ticket === "object" &&
    responseBody.ticket &&
    "id" in responseBody.ticket
  ) {
    const id = responseBody.ticket.id;
    return typeof id === "string" || typeof id === "number"
      ? String(id)
      : undefined;
  }

  return undefined;
};

const resolveHubSpotExternalId = (responseBody: unknown) => {
  if (
    typeof responseBody === "object" &&
    responseBody &&
    "id" in responseBody
  ) {
    const id = responseBody.id;
    return typeof id === "string" || typeof id === "number"
      ? String(id)
      : undefined;
  }

  return undefined;
};

const resolveLinearExternalId = (responseBody: unknown) => {
  if (
    typeof responseBody === "object" &&
    responseBody &&
    "data" in responseBody &&
    typeof responseBody.data === "object" &&
    responseBody.data &&
    "issueCreate" in responseBody.data &&
    typeof responseBody.data.issueCreate === "object" &&
    responseBody.data.issueCreate &&
    "issue" in responseBody.data.issueCreate &&
    typeof responseBody.data.issueCreate.issue === "object" &&
    responseBody.data.issueCreate.issue &&
    "id" in responseBody.data.issueCreate.issue
  ) {
    const id = responseBody.data.issueCreate.issue.id;
    return typeof id === "string" || typeof id === "number"
      ? String(id)
      : undefined;
  }

  return undefined;
};

const createSkippedSinkDelivery = (): VoiceIntegrationSinkDeliveryResult => ({
  attempts: 0,
  status: "skipped",
});

export const createVoiceIntegrationHTTPSink = <
  TBody extends Record<string, unknown> = Record<string, unknown>,
>(
  options: VoiceIntegrationHTTPSinkOptions<TBody>,
): VoiceIntegrationSink => ({
  deliver: async ({ event }) => {
    const body = JSON.stringify(
      (await options.body?.({
        event,
      })) ?? {
        createdAt: event.createdAt,
        id: event.id,
        payload: event.payload,
        type: event.type,
      },
    );

    return deliverVoiceHTTPSinkPayload({
      body,
      config: options,
    });
  },
  eventTypes: options.eventTypes,
  id: options.id,
  kind: options.kind ?? "http",
});

export const createVoiceHelpdeskTicketSink = (
  options: VoiceHelpdeskTicketSinkOptions,
): VoiceIntegrationSink =>
  createVoiceIntegrationHTTPSink({
    ...options,
    body: ({ event }) => buildHelpdeskTicketBody(event, options.project),
    eventTypes: options.eventTypes ?? [
      "review.saved",
      "task.created",
      "task.updated",
      "task.sla_breached",
    ],
    kind: options.kind ?? "helpdesk-ticket",
  });

export const createVoiceCRMActivitySink = (
  options: VoiceCRMActivitySinkOptions,
): VoiceIntegrationSink =>
  createVoiceIntegrationHTTPSink({
    ...options,
    body: ({ event }) => buildCRMActivityBody(event, options.pipeline),
    eventTypes: options.eventTypes ?? [
      "call.completed",
      "review.saved",
      "task.created",
      "task.updated",
      "task.sla_breached",
    ],
    kind: options.kind ?? "crm-activity",
  });

export const createVoiceZendeskTicketSink = (
  options: VoiceZendeskTicketSinkOptions,
): VoiceIntegrationSink => {
  const baseUrl =
    options.baseUrl ??
    (options.subdomain
      ? `https://${options.subdomain}.zendesk.com`
      : undefined);
  if (!baseUrl) {
    throw new Error(
      "createVoiceZendeskTicketSink requires either baseUrl or subdomain.",
    );
  }

  const sink = createVoiceIntegrationHTTPSink({
    ...options,
    body: async ({ event }) => ({
      ticket: {
        ...(await options.buildTicket?.({
          event,
        })),
        comment: {
          body: resolveVoiceSinkText(
            event,
            `Voice ops event ${event.type} requires attention.`,
          ),
        },
        priority: resolveVoiceSinkPriority(event),
        requester: options.requester,
        subject: resolveVoiceLinearIssueTitle(event),
      },
    }),
    eventTypes: options.eventTypes ?? [
      "review.saved",
      "task.created",
      "task.updated",
      "task.sla_breached",
    ],
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...options.headers,
    },
    id: options.id,
    kind: options.kind ?? "zendesk-ticket",
    url: `${baseUrl.replace(/\/$/, "")}/api/v2/tickets`,
  });

  return {
    ...sink,
    deliver: async ({ event }) => {
      const result = await sink.deliver({
        event,
      });
      if (result.status === "delivered") {
        await storeVoiceExternalObjectMapping({
          event,
          externalId:
            (await options.resolveExternalId?.({
              event,
              responseBody: result.responseBody,
            })) ?? resolveZendeskExternalId(result.responseBody),
          provider: "zendesk",
          sinkId: options.id,
          store: options.externalObjects,
        });
      }

      return result;
    },
  };
};

export const createVoiceZendeskTicketUpdateSink = (
  options: VoiceZendeskTicketUpdateSinkOptions,
): VoiceIntegrationSink => {
  const baseUrl =
    options.baseUrl ??
    (options.subdomain
      ? `https://${options.subdomain}.zendesk.com`
      : undefined);
  if (!baseUrl) {
    throw new Error(
      "createVoiceZendeskTicketUpdateSink requires either baseUrl or subdomain.",
    );
  }

  return {
    deliver: async ({ event }) => {
      const ticketId =
        (await resolveVoiceSinkValue(options.ticketId, event, [
          "zendeskTicketId",
          "ticketId",
          "externalTicketId",
        ])) ??
        (await findVoiceExternalObjectId({
          event,
          provider: "zendesk",
          sinkId: options.id,
          store: options.externalObjects,
        }));
      if (!ticketId) {
        return createSkippedSinkDelivery();
      }

      return deliverVoiceHTTPSinkPayload({
        body: JSON.stringify({
          ticket: {
            ...(await options.buildTicket?.({
              event,
            })),
            comment: {
              body: resolveVoiceSinkText(
                event,
                `Voice ops event ${event.type} updated this ticket.`,
              ),
            },
            priority: resolveVoiceSinkPriority(event),
            status: options.status,
          },
        }),
        config: {
          ...options,
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            ...options.headers,
          },
          method: options.method ?? "PUT",
          url: `${baseUrl.replace(/\/$/, "")}/api/v2/tickets/${encodeURIComponent(ticketId)}`,
        },
      });
    },
    eventTypes: options.eventTypes ?? ["task.updated", "task.sla_breached"],
    id: options.id,
    kind: options.kind ?? "zendesk-ticket-update",
  };
};

export const createVoiceZendeskTicketSyncSinks = (
  options: VoiceZendeskTicketSyncSinkOptions,
): VoiceIntegrationSink[] => {
  const { create, createId, update, updateId, ...baseOptions } = options;

  return [
    createVoiceZendeskTicketSink({
      ...baseOptions,
      ...create,
      eventTypes: create?.eventTypes ?? ["review.saved", "task.created"],
      id: createId ?? create?.id ?? options.id,
    }),
    createVoiceZendeskTicketUpdateSink({
      ...baseOptions,
      ...update,
      eventTypes: update?.eventTypes ?? ["task.updated", "task.sla_breached"],
      id: updateId ?? update?.id ?? `${options.id}:update`,
    }),
  ];
};

export const createVoiceHubSpotTaskSink = (
  options: VoiceHubSpotTaskSinkOptions,
): VoiceIntegrationSink => {
  const baseUrl = options.baseUrl ?? "https://api.hubapi.com";

  const sink = createVoiceIntegrationHTTPSink({
    ...options,
    body: async ({ event }) => ({
      associations:
        typeof options.associations === "function"
          ? await options.associations({
              event,
            })
          : options.associations,
      properties: {
        ...(await options.buildProperties?.({
          event,
        })),
        hs_task_body: resolveVoiceSinkText(event, `Follow up on ${event.type}`),
        hs_task_priority: resolveVoiceHubSpotPriority(event),
        hs_task_status:
          event.type === "task.updated" && event.payload.status === "done"
            ? "COMPLETED"
            : "NOT_STARTED",
        hs_task_subject: resolveVoiceLinearIssueTitle(event),
        hs_task_type: resolveVoiceHubSpotTaskType(event),
        hs_timestamp: String(
          typeof event.payload.dueAt === "number"
            ? event.payload.dueAt
            : event.createdAt,
        ),
        ...(options.ownerId
          ? {
              hubspot_owner_id: options.ownerId,
            }
          : {}),
      },
    }),
    eventTypes: options.eventTypes ?? [
      "task.created",
      "task.updated",
      "task.sla_breached",
    ],
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...options.headers,
    },
    id: options.id,
    kind: options.kind ?? "hubspot-task",
    url: `${baseUrl.replace(/\/$/, "")}/crm/v3/objects/tasks`,
  });

  return {
    ...sink,
    deliver: async ({ event }) => {
      const result = await sink.deliver({
        event,
      });
      if (result.status === "delivered") {
        await storeVoiceExternalObjectMapping({
          event,
          externalId:
            (await options.resolveExternalId?.({
              event,
              responseBody: result.responseBody,
            })) ?? resolveHubSpotExternalId(result.responseBody),
          provider: "hubspot",
          sinkId: options.id,
          store: options.externalObjects,
        });
      }

      return result;
    },
  };
};

export const createVoiceHubSpotTaskUpdateSink = (
  options: VoiceHubSpotTaskUpdateSinkOptions,
): VoiceIntegrationSink => {
  const baseUrl = options.baseUrl ?? "https://api.hubapi.com";

  return {
    deliver: async ({ event }) => {
      const taskId =
        (await resolveVoiceSinkValue(options.taskId, event, [
          "hubspotTaskId",
          "hubSpotTaskId",
          "externalTaskId",
        ])) ??
        (await findVoiceExternalObjectId({
          event,
          provider: "hubspot",
          sinkId: options.id,
          store: options.externalObjects,
        }));
      if (!taskId) {
        return createSkippedSinkDelivery();
      }

      return deliverVoiceHTTPSinkPayload({
        body: JSON.stringify({
          properties: {
            ...(await options.buildProperties?.({
              event,
            })),
            hs_task_body: resolveVoiceSinkText(
              event,
              `Follow up on ${event.type}`,
            ),
            hs_task_priority: resolveVoiceHubSpotPriority(event),
            hs_task_status:
              event.type === "task.updated" && event.payload.status === "done"
                ? "COMPLETED"
                : "NOT_STARTED",
            hs_task_subject: resolveVoiceLinearIssueTitle(event),
            hs_task_type: resolveVoiceHubSpotTaskType(event),
            hs_timestamp: String(
              typeof event.payload.dueAt === "number"
                ? event.payload.dueAt
                : event.createdAt,
            ),
          },
        }),
        config: {
          ...options,
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            ...options.headers,
          },
          method: options.method ?? "PATCH",
          url: `${baseUrl.replace(/\/$/, "")}/crm/v3/objects/tasks/${encodeURIComponent(taskId)}`,
        },
      });
    },
    eventTypes: options.eventTypes ?? ["task.updated", "task.sla_breached"],
    id: options.id,
    kind: options.kind ?? "hubspot-task-update",
  };
};

export const createVoiceHubSpotTaskSyncSinks = (
  options: VoiceHubSpotTaskSyncSinkOptions,
): VoiceIntegrationSink[] => {
  const { create, createId, update, updateId, ...baseOptions } = options;

  return [
    createVoiceHubSpotTaskSink({
      ...baseOptions,
      ...create,
      eventTypes: create?.eventTypes ?? ["task.created"],
      id: createId ?? create?.id ?? options.id,
    }),
    createVoiceHubSpotTaskUpdateSink({
      ...baseOptions,
      ...update,
      eventTypes: update?.eventTypes ?? ["task.updated", "task.sla_breached"],
      id: updateId ?? update?.id ?? `${options.id}:update`,
    }),
  ];
};

export const createVoiceLinearIssueSink = (
  options: VoiceLinearIssueSinkOptions,
): VoiceIntegrationSink => {
  const apiUrl = options.apiUrl ?? "https://api.linear.app/graphql";
  const token = options.accessToken ?? options.apiKey;
  if (!token) {
    throw new Error(
      "createVoiceLinearIssueSink requires accessToken or apiKey.",
    );
  }
  const authHeader = options.authMode === "api-key" ? token : `Bearer ${token}`;

  const sink = createVoiceIntegrationHTTPSink({
    ...options,
    body: async ({ event }) => ({
      query: `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      title
    }
  }
}`,
      variables: {
        input: {
          ...(await options.buildIssueInput?.({
            event,
          })),
          description: resolveVoiceSinkText(
            event,
            `Voice ops event ${event.type}`,
          ),
          teamId: options.teamId,
          title: resolveVoiceLinearIssueTitle(event),
        },
      },
    }),
    eventTypes: options.eventTypes ?? [
      "review.saved",
      "task.created",
      "task.updated",
      "task.sla_breached",
    ],
    headers: {
      Authorization: authHeader,
      ...options.headers,
    },
    id: options.id,
    kind: options.kind ?? "linear-issue",
    url: apiUrl,
  });

  return {
    ...sink,
    deliver: async ({ event }) => {
      const result = await sink.deliver({
        event,
      });
      if (result.status === "delivered") {
        await storeVoiceExternalObjectMapping({
          event,
          externalId:
            (await options.resolveExternalId?.({
              event,
              responseBody: result.responseBody,
            })) ?? resolveLinearExternalId(result.responseBody),
          provider: "linear",
          sinkId: options.id,
          store: options.externalObjects,
        });
      }

      return result;
    },
  };
};

export const createVoiceLinearIssueSyncSinks = (
  options: VoiceLinearIssueSyncSinkOptions,
): VoiceIntegrationSink[] => {
  const { create, createId, update, updateId, ...baseOptions } = options;

  return [
    createVoiceLinearIssueSink({
      ...baseOptions,
      ...create,
      eventTypes: create?.eventTypes ?? ["review.saved", "task.created"],
      id: createId ?? create?.id ?? options.id,
    }),
    createVoiceLinearIssueUpdateSink({
      ...baseOptions,
      ...update,
      eventTypes: update?.eventTypes ?? ["task.updated", "task.sla_breached"],
      id: updateId ?? update?.id ?? `${options.id}:update`,
    }),
  ];
};

export const createVoiceLinearIssueUpdateSink = (
  options: VoiceLinearIssueUpdateSinkOptions,
): VoiceIntegrationSink => {
  const apiUrl = options.apiUrl ?? "https://api.linear.app/graphql";
  const token = options.accessToken ?? options.apiKey;
  if (!token) {
    throw new Error(
      "createVoiceLinearIssueUpdateSink requires accessToken or apiKey.",
    );
  }
  const authHeader = options.authMode === "api-key" ? token : `Bearer ${token}`;

  return {
    deliver: async ({ event }) => {
      const issueId =
        (await resolveVoiceSinkValue(options.issueId, event, [
          "linearIssueId",
          "issueId",
          "externalIssueId",
        ])) ??
        (await findVoiceExternalObjectId({
          event,
          provider: "linear",
          sinkId: options.id,
          store: options.externalObjects,
        }));
      if (!issueId) {
        return createSkippedSinkDelivery();
      }

      return deliverVoiceHTTPSinkPayload({
        body: JSON.stringify({
          query: `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      title
    }
  }
}`,
          variables: {
            id: issueId,
            input: {
              ...(await options.buildIssueInput?.({
                event,
              })),
              description: resolveVoiceSinkText(
                event,
                `Voice ops event ${event.type}`,
              ),
              ...(options.stateId
                ? {
                    stateId: options.stateId,
                  }
                : {}),
              title: resolveVoiceLinearIssueTitle(event),
            },
          },
        }),
        config: {
          ...options,
          headers: {
            Authorization: authHeader,
            ...options.headers,
          },
          method: options.method ?? "POST",
          url: apiUrl,
        },
      });
    },
    eventTypes: options.eventTypes ?? ["task.updated", "task.sla_breached"],
    id: options.id,
    kind: options.kind ?? "linear-issue-update",
  };
};

export const deliverVoiceIntegrationEventToSinks = async (input: {
  event: StoredVoiceIntegrationEvent;
  sinks: VoiceIntegrationSink[];
}): Promise<StoredVoiceIntegrationEvent> => {
  let event = input.event;
  for (const sink of input.sinks) {
    const previous = event.sinkDeliveries?.[sink.id];
    const result =
      previous?.status === "delivered" || previous?.status === "skipped"
        ? {
            attempts: 0,
            deliveredAt: previous.deliveredAt,
            deliveredTo: previous.deliveredTo,
            status: previous.status,
          }
        : sink.eventTypes && !sink.eventTypes.includes(event.type)
          ? {
              attempts: 0,
              status: "skipped" as const,
            }
          : await sink.deliver({
              event,
            });
    const delivery = normalizeSinkDelivery({
      previous,
      result,
      sink,
    });

    event = {
      ...event,
      deliveredTo:
        event.deliveredTo ??
        (delivery.status === "delivered" ? delivery.deliveredTo : undefined),
      sinkDeliveries: {
        ...(event.sinkDeliveries ?? {}),
        [sink.id]: delivery,
      },
    };
    const aggregateStatus = aggregateVoiceIntegrationDeliveryStatus(event);
    event = {
      ...event,
      deliveryStatus: mergeVoiceSinkAggregateStatus(event, aggregateStatus),
    };
  }

  return event;
};
