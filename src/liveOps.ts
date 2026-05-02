import { Elysia } from "elysia";
import { createVoiceAuditEvent, type VoiceAuditEventStore } from "./audit";
import { createVoiceTraceEvent, type VoiceTraceEventStore } from "./trace";
import type { VoiceOperationsRecord } from "./operationsRecord";
import type { VoiceOpsActionHistoryReport } from "./opsActionAuditRoutes";
import type {
  VoiceOpsRecoveryReport,
  VoiceOpsRecoveryStatus,
} from "./opsRecovery";
import type { VoiceOpsStatusReport } from "./opsStatus";

export const VOICE_LIVE_OPS_ACTIONS = [
  "assign",
  "create-task",
  "escalate",
  "force-handoff",
  "inject-instruction",
  "operator-takeover",
  "pause-assistant",
  "resume-assistant",
  "tag",
] as const;

export type VoiceLiveOpsAction = (typeof VOICE_LIVE_OPS_ACTIONS)[number];

export type VoiceLiveOpsControlStatus =
  | "assistant-paused"
  | "assistant-resumed"
  | "handoff-forced"
  | "instruction-injected"
  | "operator-takeover"
  | "recorded";

export type VoiceLiveOpsControlState = {
  assistantPaused: boolean;
  handoffTarget?: string;
  injectedInstruction?: string;
  lastAction: VoiceLiveOpsAction;
  lastUpdatedAt: number;
  operator?: string;
  operatorTakeover: boolean;
  status: VoiceLiveOpsControlStatus;
  tag?: string;
};

export type VoiceLiveOpsActionInput = {
  action: VoiceLiveOpsAction;
  assignee?: string;
  detail?: string;
  sessionId: string;
  tag?: string;
};

export type VoiceLiveOpsActionResult = {
  action: VoiceLiveOpsAction;
  control: VoiceLiveOpsControlState;
  ok: true;
  sessionId: string;
};

export type VoiceLiveOpsEvidenceInput = {
  actionHistory?: VoiceOpsActionHistoryReport;
  maxActionHistoryFailures?: number;
  maxOpsRecoveryIssues?: number;
  minActionHistoryEntries?: number;
  minInterventions?: number;
  minOperationsRecordHandoffs?: number;
  minOperationsRecordTasks?: number;
  operationsRecord?: VoiceOperationsRecord;
  opsRecovery?: VoiceOpsRecoveryReport;
  opsStatus?: VoiceOpsStatusReport;
  requireActionHistory?: boolean;
  requireOperationsRecord?: boolean;
  requireOperationsRecordAudit?: boolean;
  requireOperationsRecordHealthy?: boolean;
  requireOpsRecovery?: boolean;
  requireOpsRecoveryStatus?: VoiceOpsRecoveryStatus;
  requireOpsStatus?: boolean;
  requireOpsStatusPass?: boolean;
  requiredHistoryActions?: string[];
  requiredInterventionActions?: string[];
};

export type VoiceLiveOpsEvidenceReport = {
  actionHistoryFailed?: number;
  actionHistoryTotal?: number;
  historyActions: string[];
  interventionActions: string[];
  interventions?: number;
  issues: string[];
  ok: boolean;
  operationsRecordHandoffs?: number;
  operationsRecordStatus?: VoiceOperationsRecord["status"];
  operationsRecordTasks?: number;
  opsRecoveryIssues?: number;
  opsRecoveryStatus?: VoiceOpsRecoveryStatus;
  opsStatus?: VoiceOpsStatusReport["status"];
};

export type VoiceLiveOpsControlEvidenceInput = {
  finalControl?: VoiceLiveOpsControlState | null;
  maxFailedActions?: number;
  minSnapshots?: number;
  requireFinalAssistantPaused?: boolean;
  requireFinalOperatorTakeover?: boolean;
  requiredActions?: VoiceLiveOpsAction[];
  requiredStatuses?: VoiceLiveOpsControlStatus[];
  results?: Array<
    | (Partial<Omit<VoiceLiveOpsActionResult, "ok">> & { ok?: boolean })
    | null
    | undefined
  >;
};

export type VoiceLiveOpsControlEvidenceReport = {
  actionCount: number;
  actions: VoiceLiveOpsAction[];
  failedActions: number;
  finalControl?: VoiceLiveOpsControlState;
  finalStatus?: VoiceLiveOpsControlStatus;
  issues: string[];
  ok: boolean;
  snapshots: number;
  statuses: VoiceLiveOpsControlStatus[];
};

export type VoiceLiveOpsControlStore = {
  get: (
    sessionId: string,
  ) =>
    | Promise<VoiceLiveOpsControlState | undefined>
    | VoiceLiveOpsControlState
    | undefined;
  set: (
    sessionId: string,
    state: VoiceLiveOpsControlState,
  ) => Promise<void> | void;
};

export type VoiceLiveOpsControllerOptions = {
  audit?: VoiceAuditEventStore;
  defaultAssignee?: string;
  defaultDetail?: string;
  defaultTag?: string;
  onAction?: (
    result: VoiceLiveOpsActionResult & {
      assignee: string;
      detail: string;
      tag: string;
    },
  ) => Promise<void> | void;
  store?: VoiceLiveOpsControlStore;
  trace?: VoiceTraceEventStore;
};

export type VoiceLiveOpsRoutesOptions = VoiceLiveOpsControllerOptions & {
  controlPath?: string;
  name?: string;
  path?: string;
};

const isVoiceLiveOpsAction = (value: unknown): value is VoiceLiveOpsAction =>
  typeof value === "string" &&
  VOICE_LIVE_OPS_ACTIONS.includes(value as VoiceLiveOpsAction);

const toStringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const uniqueSorted = <Value extends string>(values: Value[]): Value[] =>
  Array.from(new Set(values)).sort();

const findMissing = <Value extends string>(
  values: Value[],
  required: Value[] | undefined,
): Value[] => {
  if (!required?.length) {
    return [];
  }
  const valueSet = new Set(values);
  return required.filter((value) => !valueSet.has(value));
};

export const evaluateVoiceLiveOpsEvidence = (
  input: VoiceLiveOpsEvidenceInput = {},
): VoiceLiveOpsEvidenceReport => {
  const issues: string[] = [];
  const actionHistory = input.actionHistory;
  const opsRecovery = input.opsRecovery;
  const opsStatus = input.opsStatus;
  const operationsRecord = input.operationsRecord;
  const historyActions = uniqueSorted(
    actionHistory?.entries.map((entry) => entry.actionId) ?? [],
  );
  const interventionActions = uniqueSorted(
    opsRecovery?.interventions.events
      .map((event) => event.action)
      .filter((action): action is string => Boolean(action)) ?? [],
  );
  const requireActionHistory = input.requireActionHistory ?? true;
  const requireOperationsRecord = input.requireOperationsRecord ?? true;
  const requireOpsRecovery = input.requireOpsRecovery ?? true;
  const requireOpsRecoveryStatus = input.requireOpsRecoveryStatus ?? "pass";
  const requireOpsStatus = input.requireOpsStatus ?? true;
  const requireOpsStatusPass = input.requireOpsStatusPass ?? true;

  if (requireActionHistory && !actionHistory) {
    issues.push("Expected live-ops action history report to be present.");
  }
  if (requireOpsRecovery && !opsRecovery) {
    issues.push("Expected ops recovery report to be present.");
  }
  if (requireOpsStatus && !opsStatus) {
    issues.push("Expected ops status report to be present.");
  }
  if (requireOperationsRecord && !operationsRecord) {
    issues.push("Expected operations record to be present.");
  }
  if (opsRecovery && opsRecovery.status !== requireOpsRecoveryStatus) {
    issues.push(
      `Expected ops recovery status ${requireOpsRecoveryStatus}, found ${opsRecovery.status}.`,
    );
  }
  if (
    opsRecovery &&
    input.maxOpsRecoveryIssues !== undefined &&
    opsRecovery.issues.length > input.maxOpsRecoveryIssues
  ) {
    issues.push(
      `Expected at most ${String(input.maxOpsRecoveryIssues)} ops recovery issue(s), found ${String(opsRecovery.issues.length)}.`,
    );
  }
  if (
    opsRecovery &&
    input.minInterventions !== undefined &&
    opsRecovery.interventions.total < input.minInterventions
  ) {
    issues.push(
      `Expected at least ${String(input.minInterventions)} live-ops intervention(s), found ${String(opsRecovery.interventions.total)}.`,
    );
  }
  for (const action of findMissing(
    interventionActions,
    input.requiredInterventionActions,
  )) {
    issues.push(`Missing live-ops intervention action: ${action}.`);
  }
  if (opsStatus && requireOpsStatusPass && opsStatus.status !== "pass") {
    issues.push(`Expected ops status pass, found ${opsStatus.status}.`);
  }
  if (
    actionHistory &&
    input.minActionHistoryEntries !== undefined &&
    actionHistory.total < input.minActionHistoryEntries
  ) {
    issues.push(
      `Expected at least ${String(input.minActionHistoryEntries)} operator action history entrie(s), found ${String(actionHistory.total)}.`,
    );
  }
  if (
    actionHistory &&
    input.maxActionHistoryFailures !== undefined &&
    actionHistory.failed > input.maxActionHistoryFailures
  ) {
    issues.push(
      `Expected at most ${String(input.maxActionHistoryFailures)} failed operator action(s), found ${String(actionHistory.failed)}.`,
    );
  }
  for (const action of findMissing(
    historyActions,
    input.requiredHistoryActions,
  )) {
    issues.push(`Missing operator action history action: ${action}.`);
  }
  if (
    operationsRecord &&
    input.requireOperationsRecordHealthy !== false &&
    operationsRecord.status === "failed"
  ) {
    issues.push("Expected operations record not to be failed.");
  }
  if (
    operationsRecord &&
    input.requireOperationsRecordAudit &&
    !operationsRecord.audit
  ) {
    issues.push("Expected operations record audit summary to be present.");
  }
  if (
    operationsRecord &&
    input.minOperationsRecordHandoffs !== undefined &&
    operationsRecord.handoffs.length < input.minOperationsRecordHandoffs
  ) {
    issues.push(
      `Expected at least ${String(input.minOperationsRecordHandoffs)} operations-record handoff(s), found ${String(operationsRecord.handoffs.length)}.`,
    );
  }
  if (
    operationsRecord &&
    input.minOperationsRecordTasks !== undefined &&
    (operationsRecord.tasks?.total ?? 0) < input.minOperationsRecordTasks
  ) {
    issues.push(
      `Expected at least ${String(input.minOperationsRecordTasks)} operations-record task(s), found ${String(operationsRecord.tasks?.total ?? 0)}.`,
    );
  }

  return {
    actionHistoryFailed: actionHistory?.failed,
    actionHistoryTotal: actionHistory?.total,
    historyActions,
    interventionActions,
    interventions: opsRecovery?.interventions.total,
    issues,
    ok: issues.length === 0,
    operationsRecordHandoffs: operationsRecord?.handoffs.length,
    operationsRecordStatus: operationsRecord?.status,
    operationsRecordTasks: operationsRecord?.tasks?.total,
    opsRecoveryIssues: opsRecovery?.issues.length,
    opsRecoveryStatus: opsRecovery?.status,
    opsStatus: opsStatus?.status,
  };
};

export const assertVoiceLiveOpsEvidence = (
  input: VoiceLiveOpsEvidenceInput = {},
): VoiceLiveOpsEvidenceReport => {
  const assertion = evaluateVoiceLiveOpsEvidence(input);
  if (!assertion.ok) {
    throw new Error(
      `Voice live-ops evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const evaluateVoiceLiveOpsControlEvidence = (
  input: VoiceLiveOpsControlEvidenceInput = {},
): VoiceLiveOpsControlEvidenceReport => {
  const issues: string[] = [];
  const results = (input.results ?? []).filter(
    (
      result,
    ): result is Partial<Omit<VoiceLiveOpsActionResult, "ok">> & {
      ok?: boolean;
    } => Boolean(result),
  );
  const controls = results
    .map((result) => result.control)
    .filter((control): control is VoiceLiveOpsControlState => Boolean(control));
  const finalControl = input.finalControl ?? controls.at(-1);
  const actions = uniqueSorted(
    results
      .map((result) => result.action)
      .filter((action): action is VoiceLiveOpsAction =>
        isVoiceLiveOpsAction(action),
      ),
  );
  const statuses = uniqueSorted(controls.map((control) => control.status));
  const failedActions = results.filter((result) => result.ok === false).length;

  if (results.length === 0) {
    issues.push("Expected live-ops control action result(s) to be present.");
  }
  if (
    input.minSnapshots !== undefined &&
    controls.length < input.minSnapshots
  ) {
    issues.push(
      `Expected at least ${String(input.minSnapshots)} live-ops control snapshot(s), found ${String(controls.length)}.`,
    );
  }
  if (
    input.maxFailedActions !== undefined &&
    failedActions > input.maxFailedActions
  ) {
    issues.push(
      `Expected at most ${String(input.maxFailedActions)} failed live-ops control action(s), found ${String(failedActions)}.`,
    );
  }
  for (const action of findMissing(actions, input.requiredActions)) {
    issues.push(`Missing live-ops control action: ${action}.`);
  }
  for (const status of findMissing(statuses, input.requiredStatuses)) {
    issues.push(`Missing live-ops control status: ${status}.`);
  }
  if (!finalControl) {
    issues.push("Expected final live-ops control state to be present.");
  } else {
    if (
      input.requireFinalAssistantPaused !== undefined &&
      finalControl.assistantPaused !== input.requireFinalAssistantPaused
    ) {
      issues.push(
        `Expected final live-ops assistantPaused ${String(input.requireFinalAssistantPaused)}, found ${String(finalControl.assistantPaused)}.`,
      );
    }
    if (
      input.requireFinalOperatorTakeover !== undefined &&
      finalControl.operatorTakeover !== input.requireFinalOperatorTakeover
    ) {
      issues.push(
        `Expected final live-ops operatorTakeover ${String(input.requireFinalOperatorTakeover)}, found ${String(finalControl.operatorTakeover)}.`,
      );
    }
  }

  return {
    actionCount: results.length,
    actions,
    failedActions,
    finalControl: finalControl ?? undefined,
    finalStatus: finalControl?.status,
    issues,
    ok: issues.length === 0,
    snapshots: controls.length,
    statuses,
  };
};

export const assertVoiceLiveOpsControlEvidence = (
  input: VoiceLiveOpsControlEvidenceInput = {},
): VoiceLiveOpsControlEvidenceReport => {
  const assertion = evaluateVoiceLiveOpsControlEvidence(input);
  if (!assertion.ok) {
    throw new Error(
      `Voice live-ops control evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const createVoiceMemoryLiveOpsControlStore =
  (): VoiceLiveOpsControlStore => {
    const states = new Map<string, VoiceLiveOpsControlState>();

    return {
      get: (sessionId) => states.get(sessionId),
      set: (sessionId, state) => {
        states.set(sessionId, state);
      },
    };
  };

export const getVoiceLiveOpsControlStatus = (
  action: VoiceLiveOpsAction,
): VoiceLiveOpsControlStatus => {
  switch (action) {
    case "force-handoff":
      return "handoff-forced";
    case "inject-instruction":
      return "instruction-injected";
    case "operator-takeover":
      return "operator-takeover";
    case "pause-assistant":
      return "assistant-paused";
    case "resume-assistant":
      return "assistant-resumed";
    default:
      return "recorded";
  }
};

export const buildVoiceLiveOpsControlState = (
  input: VoiceLiveOpsActionInput & {
    at?: number;
    previous?: VoiceLiveOpsControlState;
  },
): VoiceLiveOpsControlState => ({
  assistantPaused:
    input.action === "pause-assistant" ||
    input.action === "operator-takeover" ||
    input.action === "force-handoff"
      ? true
      : input.action === "resume-assistant"
        ? false
        : (input.previous?.assistantPaused ?? false),
  handoffTarget:
    input.action === "force-handoff"
      ? input.tag
      : input.previous?.handoffTarget,
  injectedInstruction:
    input.action === "inject-instruction"
      ? input.detail
      : input.previous?.injectedInstruction,
  lastAction: input.action,
  lastUpdatedAt: input.at ?? Date.now(),
  operator: input.assignee,
  operatorTakeover:
    input.action === "operator-takeover"
      ? true
      : input.action === "resume-assistant"
        ? false
        : (input.previous?.operatorTakeover ?? false),
  status: getVoiceLiveOpsControlStatus(input.action),
  tag: input.tag,
});

export const createVoiceLiveOpsController = (
  options: VoiceLiveOpsControllerOptions = {},
) => {
  const store = options.store ?? createVoiceMemoryLiveOpsControlStore();
  const perform = async (
    input: VoiceLiveOpsActionInput,
  ): Promise<VoiceLiveOpsActionResult> => {
    if (!input.sessionId) {
      throw new Error("Voice live ops action requires sessionId.");
    }
    if (!isVoiceLiveOpsAction(input.action)) {
      throw new Error("Voice live ops action is not supported.");
    }

    const at = Date.now();
    const assignee = input.assignee ?? options.defaultAssignee ?? "operator";
    const tag = input.tag ?? options.defaultTag ?? "live-ops";
    const detail = input.detail ?? options.defaultDetail ?? input.action;
    const previous = await store.get(input.sessionId);
    const control = buildVoiceLiveOpsControlState({
      ...input,
      assignee,
      at,
      detail,
      previous,
      tag,
    });
    await store.set(input.sessionId, control);
    const traceId = `voice-live-ops:${input.sessionId}:${input.action}:${at}`;

    await Promise.all([
      options.audit?.append(
        createVoiceAuditEvent({
          action: `voice.live_ops.${input.action}`,
          actor: {
            id: assignee,
            kind: "operator",
            name: assignee,
          },
          at,
          metadata: {
            source: "voice-live-ops",
            tag,
          },
          outcome: "success",
          payload: {
            action: input.action,
            assignee,
            control,
            detail,
            tag,
          },
          resource: {
            id: input.sessionId,
            type: "voice.session",
          },
          sessionId: input.sessionId,
          traceId,
          type: "operator.action",
        }),
      ),
      options.trace?.append(
        createVoiceTraceEvent({
          at,
          metadata: {
            source: "voice-live-ops",
            tag,
          },
          payload: {
            action: input.action,
            assignee,
            control,
            detail,
            status: "success",
            tag,
          },
          sessionId: input.sessionId,
          traceId,
          type: "operator.action",
        }),
      ),
    ]);

    const result = {
      action: input.action,
      control,
      ok: true,
      sessionId: input.sessionId,
    } satisfies VoiceLiveOpsActionResult;
    await options.onAction?.({
      ...result,
      assignee,
      detail,
      tag,
    });

    return result;
  };

  return {
    get: (sessionId: string) => store.get(sessionId),
    perform,
    store,
  };
};

const readVoiceLiveOpsActionInput = async (
  request: Request,
): Promise<VoiceLiveOpsActionInput> => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Voice live ops action requires a JSON body.");
  }
  const record = body as Record<string, unknown>;
  const action = record.action;
  const sessionId = toStringValue(record.sessionId);
  if (!sessionId || !isVoiceLiveOpsAction(action)) {
    throw new Error(
      "Voice live ops action requires valid sessionId and action.",
    );
  }

  return {
    action,
    assignee: toStringValue(record.assignee),
    detail: toStringValue(record.detail),
    sessionId,
    tag: toStringValue(record.tag),
  };
};

export const createVoiceLiveOpsRoutes = (
  options: VoiceLiveOpsRoutesOptions = {},
) => {
  const controller = createVoiceLiveOpsController(options);
  const path = options.path ?? "/api/voice/live-ops/action";
  const controlPath =
    options.controlPath ?? "/api/voice/live-ops/control/:sessionId";

  return new Elysia({
    name: options.name ?? "absolutejs-voice-live-ops",
  })
    .post(path, async ({ request, set }) => {
      try {
        return await controller.perform(
          await readVoiceLiveOpsActionInput(request),
        );
      } catch (error) {
        set.status = 400;
        return {
          error: error instanceof Error ? error.message : String(error),
          ok: false,
        };
      }
    })
    .get(controlPath, async ({ params }) => {
      const sessionId = (params as { sessionId: string }).sessionId;
      return {
        control: await controller.get(sessionId),
        ok: true,
        sessionId,
      };
    });
};
