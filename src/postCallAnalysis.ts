import { Elysia } from "elysia";
import type {
  StoredVoiceIntegrationEvent,
  StoredVoiceOpsTask,
  VoiceIntegrationEventStore,
  VoiceOpsTaskKind,
  VoiceOpsTaskStore,
} from "./ops";
import type {
  StoredVoiceCallReviewArtifact,
  VoiceCallReviewStore,
} from "./testing/review";

export type VoicePostCallAnalysisStatus = "fail" | "pass" | "warn";

export type VoicePostCallAnalysisFieldRequirement = {
  label?: string;
  path: string;
  required?: boolean;
};

export type VoicePostCallAnalysisFieldResult = {
  label: string;
  ok: boolean;
  path: string;
  required: boolean;
  value?: unknown;
};

export type VoicePostCallAnalysisIssueCode =
  | "voice.post_call_analysis.integration_failed"
  | "voice.post_call_analysis.integration_missing"
  | "voice.post_call_analysis.required_field_missing"
  | "voice.post_call_analysis.required_task_missing"
  | "voice.post_call_analysis.review_failed"
  | "voice.post_call_analysis.review_missing";

export type VoicePostCallAnalysisIssue = {
  code: VoicePostCallAnalysisIssueCode;
  detail?: string;
  label: string;
  severity: Exclude<VoicePostCallAnalysisStatus, "pass">;
};

export type VoicePostCallAnalysisReport = {
  checkedAt: number;
  fields: VoicePostCallAnalysisFieldResult[];
  integrationEvents: StoredVoiceIntegrationEvent[];
  issues: VoicePostCallAnalysisIssue[];
  operationRecordHref?: string;
  review?: StoredVoiceCallReviewArtifact;
  reviewId?: string;
  sessionId?: string;
  status: VoicePostCallAnalysisStatus;
  summary: {
    deliveredIntegrationEvents: number;
    failedIntegrationEvents: number;
    fields: number;
    missingRequiredFields: number;
    missingRequiredTasks: number;
    requiredFields: number;
    requiredTaskKinds: number;
    tasks: number;
  };
  tasks: StoredVoiceOpsTask[];
};

export type VoicePostCallAnalysisOptions = {
  at?: number;
  extractedFields?: Record<string, unknown>;
  fields?: VoicePostCallAnalysisFieldRequirement[];
  integrationEvents?:
    | StoredVoiceIntegrationEvent[]
    | VoiceIntegrationEventStore;
  operationRecordBasePath?: string;
  requireDeliveredIntegrationEvent?: boolean;
  requiredTaskKinds?: VoiceOpsTaskKind[];
  review?: StoredVoiceCallReviewArtifact;
  reviewId?: string;
  reviews?: StoredVoiceCallReviewArtifact[] | VoiceCallReviewStore;
  sessionId?: string;
  tasks?: StoredVoiceOpsTask[] | VoiceOpsTaskStore;
};

export type VoicePostCallAnalysisRoutesOptions =
  VoicePostCallAnalysisOptions & {
    headers?: HeadersInit;
    name?: string;
    path?: string;
    source?:
      | ((input: {
          reviewId?: string;
          sessionId?: string;
        }) =>
          | Promise<VoicePostCallAnalysisOptions | VoicePostCallAnalysisReport>
          | VoicePostCallAnalysisOptions
          | VoicePostCallAnalysisReport)
      | VoicePostCallAnalysisOptions
      | VoicePostCallAnalysisReport;
  };

const isStore = <T>(
  value: unknown,
): value is { list: () => T[] | Promise<T[]> } =>
  Boolean(value) &&
  typeof value === "object" &&
  value !== null &&
  "list" in value;

const asArray = async <T>(
  value: T[] | { list: () => T[] | Promise<T[]> } | undefined,
) =>
  Array.isArray(value) ? value : isStore<T>(value) ? await value.list() : [];

const getPathValue = (source: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
};

const hasValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
};

const matchesReview = (reviewId: string | undefined, id: string | undefined) =>
  Boolean(reviewId && id && (id === reviewId || id.startsWith(`${reviewId}:`)));

const matchesSession = (
  sessionId: string | undefined,
  event: StoredVoiceIntegrationEvent,
) => {
  const payloadSessionId = event.payload.sessionId;
  return Boolean(
    sessionId &&
    (event.id === sessionId ||
      event.id.startsWith(`${sessionId}:`) ||
      payloadSessionId === sessionId),
  );
};

const matchesIntegrationEvent = (input: {
  event: StoredVoiceIntegrationEvent;
  reviewId?: string;
  sessionId?: string;
}) => {
  const payloadReviewId = input.event.payload.reviewId;
  return (
    matchesReview(input.reviewId, input.event.id) ||
    payloadReviewId === input.reviewId ||
    matchesSession(input.sessionId, input.event)
  );
};

const normalizeOperationRecordHref = (
  basePath: string | undefined,
  sessionId: string | undefined,
) => {
  if (!basePath || !sessionId) {
    return undefined;
  }
  return basePath.includes(":sessionId")
    ? basePath.replace(":sessionId", encodeURIComponent(sessionId))
    : `${basePath.replace(/\/$/, "")}/${encodeURIComponent(sessionId)}`;
};

const isPostCallAnalysisReport = (
  value: VoicePostCallAnalysisOptions | VoicePostCallAnalysisReport,
): value is VoicePostCallAnalysisReport =>
  "status" in value && "summary" in value && Array.isArray(value.issues);

export const buildVoicePostCallAnalysisReport = async (
  options: VoicePostCallAnalysisOptions = {},
): Promise<VoicePostCallAnalysisReport> => {
  const reviews = await asArray(options.reviews);
  const review =
    options.review ??
    reviews.find((candidate) =>
      options.reviewId
        ? candidate.id === options.reviewId
        : options.sessionId
          ? candidate.id.startsWith(`${options.sessionId}:`)
          : false,
    );
  const reviewId = options.reviewId ?? review?.id;
  const sessionId =
    options.sessionId ??
    (reviewId?.endsWith(":review")
      ? reviewId.slice(0, -":review".length)
      : undefined);
  const allTasks = await asArray(options.tasks);
  const tasks = allTasks.filter((task) =>
    reviewId
      ? task.reviewId === reviewId ||
        task.intakeId === reviewId ||
        matchesReview(reviewId, task.id)
      : false,
  );
  const allIntegrationEvents = await asArray(options.integrationEvents);
  const integrationEvents = allIntegrationEvents.filter((event) =>
    matchesIntegrationEvent({ event, reviewId, sessionId }),
  );
  const fieldSource = {
    extractedFields: options.extractedFields ?? {},
    review,
  };
  const fields = (options.fields ?? []).map((field) => {
    const value =
      getPathValue(fieldSource.extractedFields, field.path) ??
      getPathValue(fieldSource, field.path);
    const required = field.required !== false;
    return {
      label: field.label ?? field.path,
      ok: !required || hasValue(value),
      path: field.path,
      required,
      value,
    } satisfies VoicePostCallAnalysisFieldResult;
  });
  const requiredTaskKinds = options.requiredTaskKinds ?? [];
  const missingTaskKinds = requiredTaskKinds.filter(
    (kind) => !tasks.some((task) => task.kind === kind),
  );
  const deliveredIntegrationEvents = integrationEvents.filter(
    (event) => event.deliveryStatus === "delivered",
  ).length;
  const failedIntegrationEvents = integrationEvents.filter(
    (event) => event.deliveryStatus === "failed",
  ).length;
  const issues: VoicePostCallAnalysisIssue[] = [];

  if (!review) {
    issues.push({
      code: "voice.post_call_analysis.review_missing",
      label: "Review missing",
      severity: "fail",
    });
  } else if (review.summary.pass === false) {
    issues.push({
      code: "voice.post_call_analysis.review_failed",
      detail: review.errors.join("; ") || review.summary.outcome,
      label: "Review failed",
      severity: "fail",
    });
  }

  for (const field of fields) {
    if (field.required && !field.ok) {
      issues.push({
        code: "voice.post_call_analysis.required_field_missing",
        detail: field.path,
        label: `Missing ${field.label}`,
        severity: "fail",
      });
    }
  }

  for (const kind of missingTaskKinds) {
    issues.push({
      code: "voice.post_call_analysis.required_task_missing",
      detail: kind,
      label: `Missing ${kind} task`,
      severity: "fail",
    });
  }

  if (
    options.requireDeliveredIntegrationEvent &&
    deliveredIntegrationEvents === 0
  ) {
    issues.push({
      code: "voice.post_call_analysis.integration_missing",
      label: "Delivered integration event missing",
      severity: "fail",
    });
  }

  if (failedIntegrationEvents > 0) {
    issues.push({
      code: "voice.post_call_analysis.integration_failed",
      detail: `${failedIntegrationEvents} failed integration event(s)`,
      label: "Integration delivery failed",
      severity: "warn",
    });
  }

  const status: VoicePostCallAnalysisStatus = issues.some(
    (issue) => issue.severity === "fail",
  )
    ? "fail"
    : issues.length > 0
      ? "warn"
      : "pass";

  return {
    checkedAt: options.at ?? Date.now(),
    fields,
    integrationEvents,
    issues,
    operationRecordHref: normalizeOperationRecordHref(
      options.operationRecordBasePath,
      sessionId,
    ),
    review,
    reviewId,
    sessionId,
    status,
    summary: {
      deliveredIntegrationEvents,
      failedIntegrationEvents,
      fields: fields.length,
      missingRequiredFields: fields.filter(
        (field) => field.required && !field.ok,
      ).length,
      missingRequiredTasks: missingTaskKinds.length,
      requiredFields: fields.filter((field) => field.required).length,
      requiredTaskKinds: requiredTaskKinds.length,
      tasks: tasks.length,
    },
    tasks,
  };
};

export const renderVoicePostCallAnalysisMarkdown = (
  report: VoicePostCallAnalysisReport,
) => {
  const lines = [
    "# Voice Post-Call Analysis",
    "",
    `Status: ${report.status}`,
    `Checked: ${new Date(report.checkedAt).toISOString()}`,
    report.reviewId ? `Review: ${report.reviewId}` : undefined,
    report.sessionId ? `Session: ${report.sessionId}` : undefined,
    report.operationRecordHref
      ? `Operations record: ${report.operationRecordHref}`
      : undefined,
    "",
    "## Summary",
    `- Fields: ${report.summary.fields}`,
    `- Missing required fields: ${report.summary.missingRequiredFields}`,
    `- Tasks: ${report.summary.tasks}`,
    `- Missing required tasks: ${report.summary.missingRequiredTasks}`,
    `- Delivered integration events: ${report.summary.deliveredIntegrationEvents}`,
    `- Failed integration events: ${report.summary.failedIntegrationEvents}`,
    "",
    "## Issues",
    ...(report.issues.length
      ? report.issues.map(
          (issue) =>
            `- ${issue.severity}: ${issue.code} - ${issue.label}${issue.detail ? ` (${issue.detail})` : ""}`,
        )
      : ["- none"]),
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
};

const resolvePostCallAnalysisReport = async (
  options: VoicePostCallAnalysisRoutesOptions,
  input: { reviewId?: string; sessionId?: string },
) => {
  const source =
    options.source === undefined
      ? options
      : typeof options.source === "function"
        ? await options.source(input)
        : options.source;
  const merged = {
    ...options,
    ...source,
    reviewId: input.reviewId ?? source.reviewId ?? options.reviewId,
    sessionId: input.sessionId ?? source.sessionId ?? options.sessionId,
  };

  return isPostCallAnalysisReport(merged)
    ? merged
    : buildVoicePostCallAnalysisReport(merged);
};

export const createVoicePostCallAnalysisRoutes = (
  options: VoicePostCallAnalysisRoutesOptions = {},
) => {
  const path = options.path ?? "/api/voice/post-call-analysis";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-post-call-analysis",
  });

  routes.get(path, async ({ query }) => {
    const report = await resolvePostCallAnalysisReport(options, {
      reviewId: typeof query.reviewId === "string" ? query.reviewId : undefined,
      sessionId:
        typeof query.sessionId === "string" ? query.sessionId : undefined,
    });
    return Response.json(report, { headers: options.headers });
  });

  routes.get(`${path}.md`, async ({ query }) => {
    const report = await resolvePostCallAnalysisReport(options, {
      reviewId: typeof query.reviewId === "string" ? query.reviewId : undefined,
      sessionId:
        typeof query.sessionId === "string" ? query.sessionId : undefined,
    });
    return new Response(renderVoicePostCallAnalysisMarkdown(report), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        ...options.headers,
      },
    });
  });

  return routes;
};
