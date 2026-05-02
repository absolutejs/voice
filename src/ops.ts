import type {
  VoiceCallDisposition,
  VoiceSessionRecord,
  VoiceSessionSummary,
} from "./types";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewArtifact,
} from "./testing/review";

export type VoiceOpsTaskStatus = "open" | "in-progress" | "done";

export type VoiceOpsTaskKind =
  | "appointment-booking"
  | "callback"
  | "escalation"
  | "lead-qualification"
  | "transfer-check"
  | "retry-review"
  | "support-triage";

export type VoiceOpsTaskPriority = "low" | "normal" | "high" | "urgent";

export type VoiceOpsTaskHistoryEntry = {
  actor: string;
  at: number;
  detail?: string;
  type:
    | "created"
    | "assigned"
    | "started"
    | "claimed"
    | "heartbeat"
    | "failed"
    | "dead-lettered"
    | "policy-applied"
    | "sla-breached"
    | "completed"
    | "reopened"
    | "requeued";
};

export type VoiceOpsTask = {
  assignee?: string;
  claimExpiresAt?: number;
  claimedAt?: number;
  claimedBy?: string;
  createdAt: number;
  deadLetteredAt?: number;
  description: string;
  dueAt?: number;
  history: VoiceOpsTaskHistoryEntry[];
  id: string;
  intakeId?: string;
  kind: VoiceOpsTaskKind;
  lastProcessedAt?: number;
  policyName?: string;
  processingAttempts?: number;
  processingError?: string;
  outcome?: VoiceCallDisposition;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  recommendedAction: string;
  reviewId?: string;
  slaBreachedAt?: number;
  status: VoiceOpsTaskStatus;
  target?: string;
  title: string;
  updatedAt: number;
};

export type StoredVoiceOpsTask = VoiceOpsTask;

export type VoiceExternalObjectMap = {
  createdAt: number;
  externalId: string;
  id: string;
  provider: string;
  sinkId?: string;
  sourceId: string;
  sourceType: "session" | "review" | "task" | "event";
  updatedAt: number;
};

export type StoredVoiceExternalObjectMap = VoiceExternalObjectMap;

export const createVoiceExternalObjectMapId = (input: {
  provider: string;
  sinkId?: string;
  sourceId: string;
}) =>
  [
    input.provider,
    input.sinkId ?? "default",
    encodeURIComponent(input.sourceId),
  ].join(":");

export const createVoiceExternalObjectMap = (input: {
  at?: number;
  externalId: string;
  provider: string;
  sinkId?: string;
  sourceId: string;
  sourceType: VoiceExternalObjectMap["sourceType"];
}): StoredVoiceExternalObjectMap => {
  const at = input.at ?? Date.now();
  return {
    createdAt: at,
    externalId: input.externalId,
    id: createVoiceExternalObjectMapId(input),
    provider: input.provider,
    sinkId: input.sinkId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    updatedAt: at,
  };
};

export type VoiceExternalObjectMapStore<
  TMapping extends StoredVoiceExternalObjectMap = StoredVoiceExternalObjectMap,
> = {
  find: (input: {
    provider: string;
    sinkId?: string;
    sourceId: string;
    sourceType?: VoiceExternalObjectMap["sourceType"];
  }) => Promise<TMapping | undefined> | TMapping | undefined;
  get: (id: string) => Promise<TMapping | undefined> | TMapping | undefined;
  list: () => Promise<TMapping[]> | TMapping[];
  remove: (id: string) => Promise<void> | void;
  set: (id: string, mapping: TMapping) => Promise<void> | void;
};

export type VoiceOpsTaskStore<
  TTask extends StoredVoiceOpsTask = StoredVoiceOpsTask,
> = {
  get: (id: string) => Promise<TTask | undefined> | TTask | undefined;
  list: () => Promise<TTask[]> | TTask[];
  remove: (id: string) => Promise<void> | void;
  set: (id: string, task: TTask) => Promise<void> | void;
};

export type VoiceOpsTaskSummary = {
  byClaimedBy: Array<[string, number]>;
  byKind: Array<[VoiceOpsTaskKind, number]>;
  byOutcome: Array<[string, number]>;
  byPriority: Array<[VoiceOpsTaskPriority, number]>;
  byQueue: Array<[string, number]>;
  claimed: number;
  done: number;
  inProgress: number;
  open: number;
  overdue: number;
  topAssignees: Array<[string, number]>;
  topQueues: Array<[string, number]>;
  topTargets: Array<[string, number]>;
  total: number;
};

export type VoiceOpsTaskAgeBucket =
  | "fresh"
  | "aging"
  | "due-soon"
  | "overdue"
  | "stale";

export type VoiceOpsTaskAssigneeAnalytics = {
  assignee: string;
  averageCompletionMs?: number;
  claimed: number;
  completed: number;
  inProgress: number;
  open: number;
  overdue: number;
  total: number;
};

export type VoiceOpsTaskWorkerAnalytics = {
  activeClaims: number;
  completed: number;
  failed: number;
  heartbeats: number;
  requeued: number;
  totalClaims: number;
  workerId: string;
};

export type VoiceOpsTaskAnalyticsSummary = {
  agingBuckets: Array<[VoiceOpsTaskAgeBucket, number]>;
  assignees: VoiceOpsTaskAssigneeAnalytics[];
  totalCompleted: number;
  totalOverdue: number;
  totalTasks: number;
  workers: VoiceOpsTaskWorkerAnalytics[];
};

export type VoiceOpsTaskPolicy = {
  assignee?: string;
  dueInMs?: number;
  name?: string;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  recommendedAction?: string;
  target?: string;
  title?: string;
};

export type VoiceOpsTaskAssignmentRuleCondition = {
  assignee?: string;
  kind?: VoiceOpsTaskKind;
  outcome?: VoiceCallDisposition;
  policyName?: string;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  status?: VoiceOpsTaskStatus;
};

export type VoiceOpsTaskAssignmentRule = {
  assign?: string;
  description?: string;
  name?: string;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  recommendedAction?: string;
  title?: string;
  when?: VoiceOpsTaskAssignmentRuleCondition;
};

export type VoiceOpsDispositionTaskPolicies = Partial<
  Record<VoiceCallDisposition, VoiceOpsTaskPolicy>
>;

export type VoiceOpsTaskAssignmentRules = VoiceOpsTaskAssignmentRule[];

export type VoiceOpsTaskAnalyticsOptions = {
  agingMs?: number;
  at?: number;
  dueSoonMs?: number;
  staleMs?: number;
};

export type VoiceIntegrationEventType =
  | "call.completed"
  | "review.saved"
  | "task.created"
  | "task.updated"
  | "task.sla_breached";

export type VoiceOpsSLABreachPolicy = {
  action?: "event" | "event-and-task" | "task";
  assignee?: string;
  description?: string;
  dueInMs?: number;
  name?: string;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  recommendedAction?: string;
  title?: string;
};

export type VoiceIntegrationDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "skipped";

export type VoiceIntegrationSinkDelivery = {
  attempts: number;
  deliveredAt?: number;
  deliveredTo?: string;
  error?: string;
  sinkId: string;
  sinkKind?: string;
  status: VoiceIntegrationDeliveryStatus;
};

export type VoiceIntegrationEvent = {
  createdAt: number;
  deliveredAt?: number;
  deliveryAttempts?: number;
  deliveredTo?: string;
  deliveryError?: string;
  deliveryStatus?: VoiceIntegrationDeliveryStatus;
  id: string;
  payload: Record<string, unknown>;
  sinkDeliveries?: Record<string, VoiceIntegrationSinkDelivery>;
  type: VoiceIntegrationEventType;
};

export type StoredVoiceIntegrationEvent = VoiceIntegrationEvent;

export type VoiceIntegrationWebhookConfig = {
  backoffMs?: number;
  eventTypes?: VoiceIntegrationEventType[];
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  retries?: number;
  signingSecret?: string;
  timeoutMs?: number;
  url: string;
};

export type VoiceIntegrationEventStore<
  TEvent extends StoredVoiceIntegrationEvent = StoredVoiceIntegrationEvent,
> = {
  get: (id: string) => Promise<TEvent | undefined> | TEvent | undefined;
  list: () => Promise<TEvent[]> | TEvent[];
  remove: (id: string) => Promise<void> | void;
  set: (id: string, event: TEvent) => Promise<void> | void;
};

const sleep = async (delayMs: number) => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const signVoiceIntegrationWebhookBody = async (input: {
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

const createVoiceWebhookDeliveryError = (input: {
  attempt: number;
  error: unknown;
  response?: Response;
}) => {
  if (input.response) {
    const statusText = input.response.statusText?.trim();
    return `Attempt ${input.attempt} failed with webhook response ${input.response.status}${statusText ? ` ${statusText}` : ""}.`;
  }

  if (input.error instanceof Error) {
    return `Attempt ${input.attempt} failed: ${input.error.message}`;
  }

  return `Attempt ${input.attempt} failed: ${String(input.error)}`;
};

export const deliverVoiceIntegrationEvent = async (input: {
  event: StoredVoiceIntegrationEvent;
  webhook: VoiceIntegrationWebhookConfig;
}): Promise<StoredVoiceIntegrationEvent> => {
  const previousAttempts = input.event.deliveryAttempts ?? 0;
  const matchesConfiguredTypes =
    input.webhook.eventTypes === undefined
      ? true
      : input.webhook.eventTypes.includes(input.event.type);

  if (!matchesConfiguredTypes) {
    return {
      ...input.event,
      deliveryAttempts: 0,
      deliveryError: undefined,
      deliveryStatus: "skipped",
    };
  }

  const fetchImpl = input.webhook.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return {
      ...input.event,
      deliveredTo: input.webhook.url,
      deliveryAttempts: 0,
      deliveryError:
        "Webhook delivery failed: fetch is not available in this runtime.",
      deliveryStatus: "failed",
    };
  }

  const maxRetries = Math.max(0, input.webhook.retries ?? 0);
  const backoffMs = Math.max(0, input.webhook.backoffMs ?? 250);
  const timeoutMs = Math.max(0, input.webhook.timeoutMs ?? 10_000);
  const body = JSON.stringify({
    createdAt: input.event.createdAt,
    id: input.event.id,
    payload: input.event.payload,
    type: input.event.type,
  });

  let lastError = "Webhook delivery failed.";
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...input.webhook.headers,
      };

      if (input.webhook.signingSecret) {
        const timestamp = String(Date.now());
        headers["x-absolutejs-timestamp"] = timestamp;
        headers["x-absolutejs-signature"] =
          await signVoiceIntegrationWebhookBody({
            body,
            secret: input.webhook.signingSecret,
            timestamp,
          });
      }

      controller = timeoutMs > 0 ? new AbortController() : undefined;
      const activeController = controller;
      timeout =
        activeController && timeoutMs > 0
          ? setTimeout(() => activeController.abort(), timeoutMs)
          : undefined;

      const response = await fetchImpl(input.webhook.url, {
        body,
        headers,
        method: "POST",
        signal: controller?.signal,
      });

      if (response.ok) {
        if (timeout) {
          clearTimeout(timeout);
        }

        return {
          ...input.event,
          deliveredAt: Date.now(),
          deliveredTo: input.webhook.url,
          deliveryAttempts: previousAttempts + attempt,
          deliveryError: undefined,
          deliveryStatus: "delivered",
        };
      }

      lastError = createVoiceWebhookDeliveryError({
        attempt,
        error: new Error(`HTTP ${response.status}`),
        response,
      });
    } catch (error) {
      lastError = createVoiceWebhookDeliveryError({
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
    ...input.event,
    deliveredTo: input.webhook.url,
    deliveryAttempts: previousAttempts + maxRetries + 1,
    deliveryError: lastError,
    deliveryStatus: "failed",
  };
};

const ensureTaskHistory = (
  task: VoiceOpsTask,
  entry: Omit<VoiceOpsTaskHistoryEntry, "at"> & { at?: number },
): VoiceOpsTask => ({
  ...task,
  history: [
    ...(task.history ?? []),
    {
      ...entry,
      at: entry.at ?? Date.now(),
    },
  ],
  updatedAt: Date.now(),
});

export const withVoiceOpsTaskId = <
  TTask extends Omit<VoiceOpsTask, "id"> = Omit<VoiceOpsTask, "id">,
>(
  id: string,
  task: TTask,
): TTask & { id: string } => ({
  ...task,
  id,
});

export const withVoiceIntegrationEventId = <
  TEvent extends Omit<VoiceIntegrationEvent, "id"> = Omit<
    VoiceIntegrationEvent,
    "id"
  >,
>(
  id: string,
  event: TEvent,
): TEvent & { id: string } => ({
  ...event,
  id,
});

export const buildVoiceOpsTaskFromReview = (
  review: StoredVoiceCallReviewArtifact,
): StoredVoiceOpsTask | null => {
  const createdAt = review.generatedAt ?? Date.now();
  const common = {
    createdAt,
    history: [
      {
        actor: "system",
        at: createdAt,
        detail: review.postCall?.summary,
        type: "created" as const,
      },
    ],
    id: `${review.id}:ops`,
    intakeId: review.id,
    outcome: review.summary.outcome,
    recommendedAction:
      review.postCall?.recommendedAction ??
      "Review the voice artifact and decide the next operator action.",
    reviewId: review.id,
    status: "open" as const,
    target: review.postCall?.target,
    updatedAt: createdAt,
  };

  switch (review.summary.outcome) {
    case "voicemail":
      return {
        ...common,
        description:
          review.postCall?.summary ??
          "Caller reached voicemail and needs a callback follow-up.",
        kind: "callback",
        title: review.postCall?.target
          ? `Call back voicemail from ${review.postCall.target}`
          : "Call back voicemail lead",
      };
    case "no-answer":
      return {
        ...common,
        description:
          review.postCall?.summary ??
          "Live contact was not established and should be retried.",
        kind: "callback",
        title: "Retry no-answer call",
      };
    case "escalated":
      return {
        ...common,
        description:
          review.postCall?.summary ??
          "The automated path escalated this call for human review.",
        kind: "escalation",
        title: "Review escalated call",
      };
    case "transferred":
      return {
        ...common,
        description:
          review.postCall?.summary ??
          "The call was transferred and should be verified downstream.",
        kind: "transfer-check",
        title: review.postCall?.target
          ? `Verify transfer to ${review.postCall.target}`
          : "Verify call transfer",
      };
    case "failed":
      return {
        ...common,
        description:
          review.postCall?.summary ??
          "The call failed and needs operator review before retry.",
        kind: "retry-review",
        title: "Inspect failed call before retry",
      };
    default:
      return null;
  }
};

const DEFAULT_VOICE_OPS_TASK_POLICIES: VoiceOpsDispositionTaskPolicies = {
  escalated: {
    dueInMs: 10 * 60_000,
    name: "escalation-rapid-response",
    priority: "urgent",
  },
  failed: {
    dueInMs: 15 * 60_000,
    name: "failed-call-review",
    priority: "high",
  },
  "no-answer": {
    dueInMs: 2 * 60 * 60_000,
    name: "no-answer-retry",
    priority: "normal",
  },
  transferred: {
    dueInMs: 20 * 60_000,
    name: "transfer-verification",
    priority: "normal",
  },
  voicemail: {
    dueInMs: 30 * 60_000,
    name: "voicemail-callback",
    priority: "high",
  },
};

export const resolveVoiceOpsTaskPolicy = (input: {
  disposition?: VoiceCallDisposition;
  policies?: VoiceOpsDispositionTaskPolicies;
}) => {
  const disposition = input.disposition;
  if (!disposition) {
    return undefined;
  }

  const defaultPolicy = DEFAULT_VOICE_OPS_TASK_POLICIES[disposition];
  const customPolicy = input.policies?.[disposition];
  if (!defaultPolicy && !customPolicy) {
    return undefined;
  }

  return {
    ...defaultPolicy,
    ...customPolicy,
  } satisfies VoiceOpsTaskPolicy;
};

export const isVoiceOpsTaskOverdue = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
  } = {},
) =>
  typeof task.dueAt === "number" &&
  task.status !== "done" &&
  task.dueAt <= (input.at ?? Date.now());

export const hasVoiceOpsTaskSLABreach = (task: StoredVoiceOpsTask) =>
  typeof task.slaBreachedAt === "number";

export const resolveVoiceOpsTaskAgeBucket = (
  task: StoredVoiceOpsTask,
  input: VoiceOpsTaskAnalyticsOptions = {},
): VoiceOpsTaskAgeBucket => {
  const at = input.at ?? Date.now();
  const freshMs = Math.max(0, input.agingMs ?? 30 * 60_000);
  const staleMs = Math.max(freshMs, input.staleMs ?? 4 * 60 * 60_000);
  const dueSoonMs = Math.max(0, input.dueSoonMs ?? 15 * 60_000);
  const ageMs = Math.max(0, at - task.createdAt);

  if (isVoiceOpsTaskOverdue(task, { at })) {
    return ageMs >= staleMs ? "stale" : "overdue";
  }

  if (
    typeof task.dueAt === "number" &&
    task.status !== "done" &&
    task.dueAt - at <= dueSoonMs
  ) {
    return "due-soon";
  }

  if (ageMs >= staleMs) {
    return "stale";
  }

  if (ageMs >= freshMs) {
    return "aging";
  }

  return "fresh";
};

export const applyVoiceOpsTaskPolicy = (
  task: StoredVoiceOpsTask,
  policy: VoiceOpsTaskPolicy,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask => {
  const at = input.at ?? Date.now();
  const updatedTask = {
    ...task,
    assignee: policy.assignee ?? task.assignee,
    dueAt:
      typeof policy.dueInMs === "number"
        ? at + Math.max(0, policy.dueInMs)
        : task.dueAt,
    policyName: policy.name ?? task.policyName,
    priority: policy.priority ?? task.priority,
    queue: policy.queue ?? task.queue,
    recommendedAction: policy.recommendedAction ?? task.recommendedAction,
    target: policy.target ?? task.target,
    title: policy.title ?? task.title,
  };

  return ensureTaskHistory(updatedTask, {
    actor: input.actor ?? "system",
    at,
    detail:
      input.detail ??
      (policy.name
        ? `Applied ops policy ${policy.name}`
        : "Applied ops task policy"),
    type: "policy-applied",
  });
};

export const matchesVoiceOpsTaskAssignmentRule = (
  task: StoredVoiceOpsTask,
  rule: VoiceOpsTaskAssignmentRule,
) => {
  const when = rule.when;
  if (!when) {
    return true;
  }

  if (when.assignee !== undefined && task.assignee !== when.assignee) {
    return false;
  }
  if (when.kind !== undefined && task.kind !== when.kind) {
    return false;
  }
  if (when.outcome !== undefined && task.outcome !== when.outcome) {
    return false;
  }
  if (when.policyName !== undefined && task.policyName !== when.policyName) {
    return false;
  }
  if (when.priority !== undefined && task.priority !== when.priority) {
    return false;
  }
  if (when.queue !== undefined && task.queue !== when.queue) {
    return false;
  }
  if (when.status !== undefined && task.status !== when.status) {
    return false;
  }

  return true;
};

export const resolveVoiceOpsTaskAssignment = (input: {
  rules?: VoiceOpsTaskAssignmentRules;
  task: StoredVoiceOpsTask;
}) =>
  input.rules?.find((rule) =>
    matchesVoiceOpsTaskAssignmentRule(input.task, rule),
  );

export const applyVoiceOpsTaskAssignmentRule = (
  task: StoredVoiceOpsTask,
  rule: VoiceOpsTaskAssignmentRule,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask => {
  const updatedTask = {
    ...task,
    assignee: rule.assign ?? task.assignee,
    priority: rule.priority ?? task.priority,
    queue: rule.queue ?? task.queue,
    recommendedAction: rule.recommendedAction ?? task.recommendedAction,
    title: rule.title ?? task.title,
  };

  return ensureTaskHistory(updatedTask, {
    actor: input.actor ?? "system",
    at: input.at,
    detail:
      input.detail ??
      rule.description ??
      (rule.name
        ? `Applied assignment rule ${rule.name}`
        : "Applied assignment rule"),
    type: "assigned",
  });
};

export const assignVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  owner: string,
  input: {
    at?: number;
    actor?: string;
  } = {},
): StoredVoiceOpsTask => {
  const normalizedOwner = owner.trim() || "ops";

  return ensureTaskHistory(
    {
      ...task,
      assignee: normalizedOwner,
    },
    {
      actor: input.actor ?? normalizedOwner,
      at: input.at,
      detail: `Assigned to ${normalizedOwner}`,
      type: "assigned",
    },
  );
};

export const startVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask =>
  ensureTaskHistory(
    {
      ...task,
      status: "in-progress",
    },
    {
      actor: input.actor ?? task.assignee ?? "ops",
      at: input.at,
      detail: input.detail ?? "Work started",
      type: "started",
    },
  );

export const claimVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  workerId: string,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
    leaseMs: number;
  } = {
    leaseMs: 30_000,
  },
): StoredVoiceOpsTask => {
  const at = input.at ?? Date.now();
  const leaseMs = Math.max(1, input.leaseMs);

  return ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: at + leaseMs,
      claimedAt: at,
      claimedBy: workerId,
      status: task.status === "done" ? task.status : "in-progress",
    },
    {
      actor: input.actor ?? workerId,
      at,
      detail: input.detail ?? `Claimed by ${workerId}`,
      type: "claimed",
    },
  );
};

export const heartbeatVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  workerId: string,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
    leaseMs: number;
  } = {
    leaseMs: 30_000,
  },
): StoredVoiceOpsTask => {
  if (task.claimedBy && task.claimedBy !== workerId) {
    throw new Error(
      `Cannot heartbeat task ${task.id}: claimed by ${task.claimedBy}, not ${workerId}.`,
    );
  }

  const at = input.at ?? Date.now();
  const leaseMs = Math.max(1, input.leaseMs);

  return ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: at + leaseMs,
      claimedAt: task.claimedAt ?? at,
      claimedBy: workerId,
    },
    {
      actor: input.actor ?? workerId,
      at,
      detail: input.detail ?? `Heartbeat from ${workerId}`,
      type: "heartbeat",
    },
  );
};

export const failVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
    error?: string;
  } = {},
): StoredVoiceOpsTask => {
  const at = input.at ?? Date.now();
  const detail = input.detail ?? input.error ?? "Task processing failed";

  return ensureTaskHistory(
    {
      ...task,
      lastProcessedAt: at,
      processingAttempts: (task.processingAttempts ?? 0) + 1,
      processingError: input.error ?? detail,
      status: task.status === "done" ? task.status : "open",
    },
    {
      actor: input.actor ?? task.claimedBy ?? task.assignee ?? "ops",
      at,
      detail,
      type: "failed",
    },
  );
};

export const deadLetterVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask => {
  const at = input.at ?? Date.now();

  return ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: undefined,
      claimedAt: undefined,
      claimedBy: undefined,
      deadLetteredAt: at,
      lastProcessedAt: at,
      status: "open",
    },
    {
      actor: input.actor ?? task.assignee ?? "ops",
      at,
      detail: input.detail ?? "Task moved to dead-letter queue",
      type: "dead-lettered",
    },
  );
};

export const markVoiceOpsTaskSLABreached = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask => {
  const at = input.at ?? Date.now();
  if (hasVoiceOpsTaskSLABreach(task)) {
    return task;
  }

  return ensureTaskHistory(
    {
      ...task,
      slaBreachedAt: at,
    },
    {
      actor: input.actor ?? "system",
      at,
      detail: input.detail ?? "Task breached its SLA",
      type: "sla-breached",
    },
  );
};

export const completeVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask =>
  ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: undefined,
      claimedAt: undefined,
      claimedBy: undefined,
      lastProcessedAt: input.at ?? Date.now(),
      processingError: undefined,
      status: "done",
    },
    {
      actor: input.actor ?? task.assignee ?? "ops",
      at: input.at,
      detail: input.detail ?? "Marked done",
      type: "completed",
    },
  );

export const reopenVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask =>
  ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: undefined,
      claimedAt: undefined,
      claimedBy: undefined,
      deadLetteredAt: undefined,
      processingError: undefined,
      status: "open",
    },
    {
      actor: input.actor ?? task.assignee ?? "ops",
      at: input.at,
      detail: input.detail ?? "Task reopened",
      type: "reopened",
    },
  );

export const requeueVoiceOpsTask = (
  task: StoredVoiceOpsTask,
  input: {
    at?: number;
    actor?: string;
    detail?: string;
  } = {},
): StoredVoiceOpsTask =>
  ensureTaskHistory(
    {
      ...task,
      claimExpiresAt: undefined,
      claimedAt: undefined,
      claimedBy: undefined,
      processingError: undefined,
      status: "open",
    },
    {
      actor: input.actor ?? task.claimedBy ?? task.assignee ?? "ops",
      at: input.at,
      detail: input.detail ?? "Task requeued",
      type: "requeued",
    },
  );

export const listVoiceOpsTasks = (tasks: StoredVoiceOpsTask[]) =>
  [...tasks].sort((left, right) => right.createdAt - left.createdAt);

export const summarizeVoiceOpsTasks = (
  tasks: StoredVoiceOpsTask[],
): VoiceOpsTaskSummary => {
  const summary = {
    byClaimedBy: new Map<string, number>(),
    byKind: new Map<VoiceOpsTaskKind, number>(),
    byOutcome: new Map<string, number>(),
    byPriority: new Map<VoiceOpsTaskPriority, number>(),
    byQueue: new Map<string, number>(),
    claimed: 0,
    done: 0,
    inProgress: 0,
    open: 0,
    overdue: 0,
    topAssignees: new Map<string, number>(),
    topQueues: new Map<string, number>(),
    topTargets: new Map<string, number>(),
    total: tasks.length,
  };

  for (const task of tasks) {
    if (task.status === "open") {
      summary.open += 1;
    } else if (task.status === "in-progress") {
      summary.inProgress += 1;
    } else if (task.status === "done") {
      summary.done += 1;
    }

    if (
      task.claimedBy &&
      (!task.claimExpiresAt || task.claimExpiresAt > Date.now())
    ) {
      summary.claimed += 1;
      summary.byClaimedBy.set(
        task.claimedBy,
        (summary.byClaimedBy.get(task.claimedBy) ?? 0) + 1,
      );
    }

    summary.byKind.set(task.kind, (summary.byKind.get(task.kind) ?? 0) + 1);

    if (task.outcome) {
      summary.byOutcome.set(
        task.outcome,
        (summary.byOutcome.get(task.outcome) ?? 0) + 1,
      );
    }

    if (task.target) {
      summary.topTargets.set(
        task.target,
        (summary.topTargets.get(task.target) ?? 0) + 1,
      );
    }

    if (task.assignee) {
      summary.topAssignees.set(
        task.assignee,
        (summary.topAssignees.get(task.assignee) ?? 0) + 1,
      );
    }

    if (task.priority) {
      summary.byPriority.set(
        task.priority,
        (summary.byPriority.get(task.priority) ?? 0) + 1,
      );
    }

    if (task.queue) {
      summary.byQueue.set(
        task.queue,
        (summary.byQueue.get(task.queue) ?? 0) + 1,
      );
      summary.topQueues.set(
        task.queue,
        (summary.topQueues.get(task.queue) ?? 0) + 1,
      );
    }

    if (isVoiceOpsTaskOverdue(task)) {
      summary.overdue += 1;
    }
  }

  return {
    byClaimedBy: [...summary.byClaimedBy.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    byKind: [...summary.byKind.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    byOutcome: [...summary.byOutcome.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    byPriority: [...summary.byPriority.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    byQueue: [...summary.byQueue.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    claimed: summary.claimed,
    done: summary.done,
    inProgress: summary.inProgress,
    open: summary.open,
    overdue: summary.overdue,
    topAssignees: [...summary.topAssignees.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    topQueues: [...summary.topQueues.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    topTargets: [...summary.topTargets.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    total: summary.total,
  };
};

export const summarizeVoiceOpsTaskAnalytics = (
  tasks: StoredVoiceOpsTask[],
  input: VoiceOpsTaskAnalyticsOptions = {},
): VoiceOpsTaskAnalyticsSummary => {
  const at = input.at ?? Date.now();
  const agingBuckets = new Map<VoiceOpsTaskAgeBucket, number>();
  const assignees = new Map<
    string,
    {
      claimed: number;
      completed: number;
      completionMsTotal: number;
      completionSamples: number;
      inProgress: number;
      open: number;
      overdue: number;
      total: number;
    }
  >();
  const workers = new Map<
    string,
    {
      activeClaims: number;
      completed: number;
      failed: number;
      heartbeats: number;
      requeued: number;
      totalClaims: number;
    }
  >();
  let totalCompleted = 0;
  let totalOverdue = 0;

  for (const task of tasks) {
    const bucket = resolveVoiceOpsTaskAgeBucket(task, { ...input, at });
    agingBuckets.set(bucket, (agingBuckets.get(bucket) ?? 0) + 1);

    if (task.assignee) {
      const assignee = assignees.get(task.assignee) ?? {
        claimed: 0,
        completed: 0,
        completionMsTotal: 0,
        completionSamples: 0,
        inProgress: 0,
        open: 0,
        overdue: 0,
        total: 0,
      };
      assignee.total += 1;
      if (task.status === "open") {
        assignee.open += 1;
      } else if (task.status === "in-progress") {
        assignee.inProgress += 1;
      } else if (task.status === "done") {
        assignee.completed += 1;
      }
      if (
        task.claimedBy &&
        (!task.claimExpiresAt || task.claimExpiresAt > at)
      ) {
        assignee.claimed += 1;
      }
      if (isVoiceOpsTaskOverdue(task, { at })) {
        assignee.overdue += 1;
      }

      const completedAt = task.history.findLast(
        (entry) => entry.type === "completed",
      )?.at;
      if (task.status === "done" && typeof completedAt === "number") {
        assignee.completionMsTotal += Math.max(0, completedAt - task.createdAt);
        assignee.completionSamples += 1;
      }
      assignees.set(task.assignee, assignee);
    }

    if (isVoiceOpsTaskOverdue(task, { at })) {
      totalOverdue += 1;
    }
    if (task.status === "done") {
      totalCompleted += 1;
    }

    for (const entry of task.history) {
      if (
        !["claimed", "heartbeat", "completed", "failed", "requeued"].includes(
          entry.type,
        )
      ) {
        continue;
      }

      const worker = workers.get(entry.actor) ?? {
        activeClaims: 0,
        completed: 0,
        failed: 0,
        heartbeats: 0,
        requeued: 0,
        totalClaims: 0,
      };

      if (entry.type === "claimed") {
        worker.totalClaims += 1;
      } else if (entry.type === "heartbeat") {
        worker.heartbeats += 1;
      } else if (entry.type === "completed") {
        worker.completed += 1;
      } else if (entry.type === "failed") {
        worker.failed += 1;
      } else if (entry.type === "requeued") {
        worker.requeued += 1;
      }

      workers.set(entry.actor, worker);
    }

    if (task.claimedBy && (!task.claimExpiresAt || task.claimExpiresAt > at)) {
      const worker = workers.get(task.claimedBy) ?? {
        activeClaims: 0,
        completed: 0,
        failed: 0,
        heartbeats: 0,
        requeued: 0,
        totalClaims: 0,
      };
      worker.activeClaims += 1;
      workers.set(task.claimedBy, worker);
    }
  }

  return {
    agingBuckets: [...agingBuckets.entries()].sort(
      (left, right) => right[1] - left[1],
    ),
    assignees: [...assignees.entries()]
      .map(([assignee, value]) => ({
        assignee,
        averageCompletionMs:
          value.completionSamples > 0
            ? value.completionMsTotal / value.completionSamples
            : undefined,
        claimed: value.claimed,
        completed: value.completed,
        inProgress: value.inProgress,
        open: value.open,
        overdue: value.overdue,
        total: value.total,
      }))
      .sort((left, right) => right.total - left.total),
    totalCompleted,
    totalOverdue,
    totalTasks: tasks.length,
    workers: [...workers.entries()]
      .map(([workerId, value]) => ({
        activeClaims: value.activeClaims,
        completed: value.completed,
        failed: value.failed,
        heartbeats: value.heartbeats,
        requeued: value.requeued,
        totalClaims: value.totalClaims,
        workerId,
      }))
      .sort((left, right) => right.totalClaims - left.totalClaims),
  };
};

export const createVoiceIntegrationEvent = <
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>(
  type: VoiceIntegrationEventType,
  payload: TPayload,
  input: {
    createdAt?: number;
    id?: string;
  } = {},
): StoredVoiceIntegrationEvent => ({
  createdAt: input.createdAt ?? Date.now(),
  id: input.id ?? crypto.randomUUID(),
  payload,
  type,
});

export const createVoiceCallCompletedEvent = (input: {
  disposition?: VoiceCallDisposition;
  session: VoiceSessionRecord;
  sessionSummary?: VoiceSessionSummary;
}): StoredVoiceIntegrationEvent =>
  createVoiceIntegrationEvent(
    "call.completed",
    {
      call: input.session.call,
      disposition: input.disposition ?? input.session.call?.disposition,
      scenarioId: input.session.scenarioId,
      sessionId: input.session.id,
      sessionSummary: input.sessionSummary,
      status: input.session.status,
      turnCount: input.session.turns.length,
    },
    {
      id: `${input.session.id}:call.completed`,
    },
  );

export const createVoiceReviewSavedEvent = (
  review: StoredVoiceCallReviewArtifact,
): StoredVoiceIntegrationEvent =>
  createVoiceIntegrationEvent(
    "review.saved",
    {
      elapsedMs: review.summary.elapsedMs,
      firstTurnLatencyMs: review.summary.firstTurnLatencyMs,
      outcome: review.summary.outcome,
      postCall: review.postCall,
      reviewId: review.id,
      title: review.title,
    },
    {
      id: `${review.id}:review.saved`,
    },
  );

export const createVoiceTaskCreatedEvent = (
  task: StoredVoiceOpsTask,
): StoredVoiceIntegrationEvent =>
  createVoiceIntegrationEvent(
    "task.created",
    {
      assignee: task.assignee,
      dueAt: task.dueAt,
      kind: task.kind,
      outcome: task.outcome,
      priority: task.priority,
      queue: task.queue,
      recommendedAction: task.recommendedAction,
      reviewId: task.reviewId,
      status: task.status,
      target: task.target,
      taskId: task.id,
      title: task.title,
    },
    {
      id: `${task.id}:task.created:${task.updatedAt}`,
    },
  );

export const createVoiceTaskUpdatedEvent = (
  task: StoredVoiceOpsTask,
): StoredVoiceIntegrationEvent =>
  createVoiceIntegrationEvent(
    "task.updated",
    {
      assignee: task.assignee,
      dueAt: task.dueAt,
      history: task.history,
      kind: task.kind,
      outcome: task.outcome,
      priority: task.priority,
      queue: task.queue,
      recommendedAction: task.recommendedAction,
      reviewId: task.reviewId,
      slaBreachedAt: task.slaBreachedAt,
      status: task.status,
      target: task.target,
      taskId: task.id,
      title: task.title,
      updatedAt: task.updatedAt,
    },
    {
      id: `${task.id}:task.updated:${task.updatedAt}`,
    },
  );

export const createVoiceTaskSLABreachedEvent = (
  task: StoredVoiceOpsTask,
): StoredVoiceIntegrationEvent =>
  createVoiceIntegrationEvent(
    "task.sla_breached",
    {
      assignee: task.assignee,
      dueAt: task.dueAt,
      kind: task.kind,
      outcome: task.outcome,
      priority: task.priority,
      queue: task.queue,
      recommendedAction: task.recommendedAction,
      reviewId: task.reviewId,
      slaBreachedAt: task.slaBreachedAt,
      status: task.status,
      target: task.target,
      taskId: task.id,
      title: task.title,
    },
    {
      id: `${task.id}:task.sla_breached:${task.slaBreachedAt ?? task.updatedAt}`,
    },
  );

export const buildVoiceOpsTaskFromSLABreach = (
  task: StoredVoiceOpsTask,
  policy: VoiceOpsSLABreachPolicy = {},
): StoredVoiceOpsTask => {
  const createdAt = task.slaBreachedAt ?? Date.now();
  const followUp = withVoiceOpsTaskId(`${task.id}:sla`, {
    assignee: policy.assignee ?? task.assignee,
    createdAt,
    description:
      policy.description ??
      `Task ${task.id} breached its SLA and needs operator follow-up.`,
    dueAt:
      typeof policy.dueInMs === "number"
        ? createdAt + Math.max(0, policy.dueInMs)
        : undefined,
    history: [
      {
        actor: "system",
        at: createdAt,
        detail:
          policy.name ??
          (task.policyName
            ? `Created from SLA breach on policy ${task.policyName}`
            : "Created from SLA breach"),
        type: "created" as const,
      },
    ],
    kind: task.kind,
    intakeId: task.intakeId,
    outcome: task.outcome,
    priority: policy.priority ?? "urgent",
    policyName: policy.name ?? `${task.policyName ?? task.kind}:sla`,
    queue: policy.queue ?? task.queue,
    recommendedAction:
      policy.recommendedAction ??
      `Review overdue task ${task.id} and decide the next operator action.`,
    reviewId: task.reviewId,
    status: "open" as const,
    target: task.target,
    title: policy.title ?? `SLA follow-up for ${task.title}`,
    updatedAt: createdAt,
  });

  return followUp;
};
