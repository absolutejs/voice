import type { VoiceScenarioEvalDefinition } from "./evalRoutes";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  VoiceOnTurnHandler,
  VoiceOnTurnObjectHandler,
  VoiceRouteResult,
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnRecord,
} from "./types";

export type VoiceWorkflowOutcome =
  | "complete"
  | "transfer"
  | "escalate"
  | "voicemail"
  | "no-answer";

export type VoiceWorkflowContractFieldMatch =
  | "boolean"
  | "non-empty"
  | "number"
  | "string"
  | "truthy";

export type VoiceWorkflowContractField = {
  aliases?: string[];
  label?: string;
  match?: VoiceWorkflowContractFieldMatch;
  path: string;
  required?: boolean;
};

export type VoiceWorkflowContractDefinition<TResult = unknown> = {
  description?: string;
  fields?: VoiceWorkflowContractField[];
  forbiddenHandoffActions?: string[];
  id: string;
  label?: string;
  maxProviderErrors?: number;
  maxSessionErrors?: number;
  minSessions?: number;
  minTurns?: number;
  outcome?: VoiceWorkflowOutcome;
  requiredAssistantIncludes?: string[];
  requiredDisposition?: string;
  requiredHandoffActions?: string[];
  requiredLifecycleTypes?: string[];
  requiredTranscriptIncludes?: string[];
  scenarioId?: string;
  validate?: (input: {
    result: TResult | undefined;
    routeResult: VoiceRouteResult<TResult>;
  }) => VoiceWorkflowContractValidationIssue[];
};

export type VoiceWorkflowContractPresetName =
  | "appointment-booking"
  | "lead-qualification"
  | "support-triage"
  | "transfer-handoff"
  | "voicemail-callback";

export type VoiceWorkflowContractPresetOptions<TResult = unknown> = Partial<
  Omit<VoiceWorkflowContractDefinition<TResult>, "fields" | "id">
> & {
  fields?: VoiceWorkflowContractField[];
  id?: string;
};

export type VoiceWorkflowContractValidationIssue = {
  code: string;
  field?: string;
  message: string;
};

export type VoiceWorkflowContractValidation = {
  contractId: string;
  issues: VoiceWorkflowContractValidationIssue[];
  missingFields: string[];
  outcome?: VoiceWorkflowOutcome;
  pass: boolean;
  requiredFields: string[];
};

export type VoiceWorkflowContract<TResult = unknown> = {
  assertRouteResult: (routeResult: VoiceRouteResult<TResult>) => void;
  definition: VoiceWorkflowContractDefinition<TResult>;
  toScenarioEval: (
    overrides?: Partial<VoiceScenarioEvalDefinition>,
  ) => VoiceScenarioEvalDefinition;
  validateRouteResult: (
    routeResult: VoiceRouteResult<TResult>,
  ) => VoiceWorkflowContractValidation;
};

export type VoiceWorkflowContractTracePayload = {
  contractId: string;
  issues: VoiceWorkflowContractValidationIssue[];
  missingFields: string[];
  outcome?: VoiceWorkflowOutcome;
  requiredFields: string[];
  status: "pass" | "fail";
};

const getObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getPathValue = (value: unknown, path: string): unknown => {
  let current = value;
  for (const part of path.split(".").filter(Boolean)) {
    const record = getObject(current);
    if (!record || !(part in record)) {
      return undefined;
    }
    current = record[part];
  }
  return current;
};

const hasValue = (value: unknown, match: VoiceWorkflowContractFieldMatch) => {
  switch (match) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "truthy":
      return Boolean(value);
    case "non-empty":
    default:
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === "string"
          ? value.trim().length > 0
          : value !== undefined && value !== null;
  }
};

const resolveOutcome = <TResult>(
  routeResult: VoiceRouteResult<TResult>,
): VoiceWorkflowOutcome | undefined => {
  if (routeResult.complete) return "complete";
  if (routeResult.transfer) return "transfer";
  if (routeResult.escalate) return "escalate";
  if (routeResult.voicemail) return "voicemail";
  if (routeResult.noAnswer) return "no-answer";
  return undefined;
};

export const validateVoiceWorkflowRouteResult = <TResult = unknown>(
  definition: VoiceWorkflowContractDefinition<TResult>,
  routeResult: VoiceRouteResult<TResult>,
): VoiceWorkflowContractValidation => {
  const issues: VoiceWorkflowContractValidationIssue[] = [];
  const requiredFields = (definition.fields ?? [])
    .filter((field) => field.required !== false)
    .map((field) => field.path);
  const missingFields: string[] = [];
  const outcome = resolveOutcome(routeResult);

  if (definition.outcome && outcome !== definition.outcome) {
    issues.push({
      code: "workflow.outcome_mismatch",
      message: `Expected workflow outcome ${definition.outcome}, saw ${outcome ?? "none"}.`,
    });
  }

  for (const field of definition.fields ?? []) {
    if (field.required === false) continue;
    const paths = [field.path, ...(field.aliases ?? [])];
    const present = paths.some((path) =>
      hasValue(
        getPathValue(routeResult.result, path),
        field.match ?? "non-empty",
      ),
    );
    if (!present) {
      missingFields.push(field.path);
      issues.push({
        code: "workflow.missing_field",
        field: field.path,
        message: `Missing required workflow field: ${field.label ?? field.path}.`,
      });
    }
  }

  issues.push(
    ...(definition.validate?.({
      result: routeResult.result,
      routeResult,
    }) ?? []),
  );

  return {
    contractId: definition.id,
    issues,
    missingFields,
    outcome,
    pass: issues.length === 0,
    requiredFields,
  };
};

export const createVoiceWorkflowScenario = <TResult = unknown>(
  definition: VoiceWorkflowContractDefinition<TResult>,
  overrides: Partial<VoiceScenarioEvalDefinition> = {},
): VoiceScenarioEvalDefinition => ({
  description: definition.description,
  forbiddenHandoffActions: definition.forbiddenHandoffActions,
  id: definition.id,
  label: definition.label,
  maxProviderErrors: definition.maxProviderErrors,
  maxSessionErrors: definition.maxSessionErrors,
  minSessions: definition.minSessions,
  minTurns: definition.minTurns,
  requiredAssistantIncludes: definition.requiredAssistantIncludes,
  requiredDisposition: definition.requiredDisposition,
  requiredHandoffActions: definition.requiredHandoffActions,
  requiredLifecycleTypes: definition.requiredLifecycleTypes,
  requiredTranscriptIncludes: definition.requiredTranscriptIncludes,
  requiredWorkflowContracts: [definition.id],
  scenarioId: definition.scenarioId,
  ...overrides,
});

export const createVoiceWorkflowContract = <TResult = unknown>(
  definition: VoiceWorkflowContractDefinition<TResult>,
): VoiceWorkflowContract<TResult> => ({
  assertRouteResult: (routeResult) => {
    const validation = validateVoiceWorkflowRouteResult(
      definition,
      routeResult,
    );
    if (!validation.pass) {
      throw new Error(
        `Voice workflow contract ${definition.id} failed: ${validation.issues
          .map((issue) => issue.message)
          .join(" ")}`,
      );
    }
  },
  definition,
  toScenarioEval: (overrides) =>
    createVoiceWorkflowScenario(definition, overrides),
  validateRouteResult: (routeResult) =>
    validateVoiceWorkflowRouteResult(definition, routeResult),
});

const presetDefinitions = {
  "appointment-booking": {
    description:
      "Appointment booking should complete with enough identity, appointment, and follow-up details to act on.",
    fields: [
      {
        aliases: ["name", "customer.name"],
        label: "Caller name",
        path: "caller.name",
      },
      {
        aliases: ["phone", "customer.phone"],
        label: "Caller phone",
        path: "caller.phone",
      },
      {
        aliases: ["appointment.start", "appointment.time", "scheduledAt"],
        label: "Appointment time",
        path: "appointment.startsAt",
      },
      {
        aliases: ["summary", "assistantSummary"],
        label: "Summary",
        path: "appointment.summary",
      },
    ],
    id: "appointment-booking",
    label: "Appointment booking",
    outcome: "complete",
    requiredDisposition: "completed",
  },
  "lead-qualification": {
    description:
      "Lead qualification should complete with contact, need, qualification, and next-step fields.",
    fields: [
      {
        aliases: ["name", "lead.name"],
        label: "Lead name",
        path: "contact.name",
      },
      {
        aliases: ["email", "lead.email"],
        label: "Lead email",
        path: "contact.email",
      },
      {
        aliases: ["need", "pain", "summary"],
        label: "Need",
        path: "qualification.need",
      },
      {
        aliases: ["qualified", "qualification.qualified"],
        label: "Qualified",
        match: "boolean",
        path: "qualification.isQualified",
      },
      {
        aliases: ["nextStep", "followUp"],
        label: "Next step",
        path: "qualification.nextStep",
      },
    ],
    id: "lead-qualification",
    label: "Lead qualification",
    outcome: "complete",
    requiredDisposition: "completed",
  },
  "support-triage": {
    description:
      "Support triage should capture identity, issue summary, severity, and the operational follow-up.",
    fields: [
      {
        aliases: ["name", "customer.name"],
        label: "Customer name",
        path: "customer.name",
      },
      {
        aliases: ["issue", "summary", "assistantSummary"],
        label: "Issue summary",
        path: "issue.summary",
      },
      {
        aliases: ["priority", "severity"],
        label: "Severity",
        path: "issue.severity",
      },
      {
        aliases: ["nextStep", "task.title"],
        label: "Next step",
        path: "resolution.nextStep",
      },
    ],
    id: "support-triage",
    label: "Support triage",
    outcome: "complete",
    requiredDisposition: "completed",
  },
  "transfer-handoff": {
    description:
      "Transfer handoff should produce a routed transfer plus handoff evidence.",
    fields: [
      {
        aliases: ["target", "callTarget"],
        label: "Transfer target",
        path: "transfer.target",
      },
      {
        aliases: ["reason", "callReason"],
        label: "Transfer reason",
        path: "transfer.reason",
      },
      {
        aliases: ["summary", "assistantSummary"],
        label: "Transfer summary",
        path: "transfer.summary",
      },
    ],
    id: "transfer-handoff",
    label: "Transfer handoff",
    outcome: "transfer",
    requiredDisposition: "transferred",
    requiredHandoffActions: ["transfer"],
  },
  "voicemail-callback": {
    description:
      "Voicemail callback should preserve enough caller and callback context for follow-up.",
    fields: [
      {
        aliases: ["name", "caller.name"],
        label: "Caller name",
        path: "voicemail.callerName",
      },
      {
        aliases: ["phone", "caller.phone"],
        label: "Callback phone",
        path: "voicemail.callbackPhone",
      },
      {
        aliases: ["message", "summary", "assistantSummary"],
        label: "Voicemail summary",
        path: "voicemail.summary",
      },
    ],
    id: "voicemail-callback",
    label: "Voicemail callback",
    outcome: "voicemail",
    requiredDisposition: "voicemail",
    requiredHandoffActions: ["voicemail"],
  },
} satisfies Record<
  VoiceWorkflowContractPresetName,
  VoiceWorkflowContractDefinition<unknown>
>;

export const createVoiceWorkflowContractPreset = <TResult = unknown>(
  name: VoiceWorkflowContractPresetName,
  options: VoiceWorkflowContractPresetOptions<TResult> = {},
): VoiceWorkflowContract<TResult> => {
  const preset = presetDefinitions[name];
  return createVoiceWorkflowContract<TResult>({
    ...(preset as VoiceWorkflowContractDefinition<TResult>),
    ...options,
    fields: options.fields ?? (preset.fields as VoiceWorkflowContractField[]),
    id: options.id ?? preset.id,
  });
};

export const recordVoiceWorkflowContractTrace = async (input: {
  at?: number;
  contractId?: string;
  scenarioId?: string;
  sessionId: string;
  store: VoiceTraceEventStore;
  traceId?: string;
  turnId?: string;
  validation: VoiceWorkflowContractValidation;
}): Promise<StoredVoiceTraceEvent<VoiceWorkflowContractTracePayload>> =>
  input.store.append({
    at: input.at ?? Date.now(),
    payload: {
      contractId: input.contractId ?? input.validation.contractId,
      issues: input.validation.issues,
      missingFields: input.validation.missingFields,
      outcome: input.validation.outcome,
      requiredFields: input.validation.requiredFields,
      status: input.validation.pass ? "pass" : "fail",
    },
    scenarioId: input.scenarioId,
    sessionId: input.sessionId,
    traceId: input.traceId,
    turnId: input.turnId,
    type: "workflow.contract",
  }) as Promise<StoredVoiceTraceEvent<VoiceWorkflowContractTracePayload>>;

export const createVoiceWorkflowContractHandler = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(input: {
  contract?:
    | VoiceWorkflowContract<TResult>
    | VoiceWorkflowContractDefinition<TResult>;
  handler: VoiceOnTurnHandler<TContext, TSession, TResult>;
  resolveContract?: (args: {
    context: TContext;
    result: VoiceRouteResult<TResult>;
    session: TSession;
    turn: VoiceTurnRecord;
  }) =>
    | VoiceWorkflowContract<TResult>
    | VoiceWorkflowContractDefinition<TResult>
    | undefined;
  store?: VoiceTraceEventStore;
}): VoiceOnTurnHandler<TContext, TSession, TResult> => {
  return async (session, turn, api, context) => {
    const legacyHandler = input.handler as (
      session: TSession,
      turn: VoiceTurnRecord,
      api: VoiceSessionHandle<TContext, TSession, TResult>,
      context: TContext,
    ) =>
      | Promise<VoiceRouteResult<TResult> | void>
      | VoiceRouteResult<TResult>
      | void;
    const objectHandler = input.handler as VoiceOnTurnObjectHandler<
      TContext,
      TSession,
      TResult
    >;
    const result =
      input.handler.length >= 4
        ? await legacyHandler(session, turn, api, context)
        : await objectHandler({ api, context, session, turn });
    if (!result) return result;

    const resolved =
      input.resolveContract?.({ context, result, session, turn }) ??
      input.contract;
    if (!resolved) return result;

    const contract =
      "validateRouteResult" in resolved
        ? resolved
        : createVoiceWorkflowContract(resolved);
    const validation = contract.validateRouteResult(result);
    if (input.store) {
      await recordVoiceWorkflowContractTrace({
        scenarioId: session.scenarioId,
        sessionId: session.id,
        store: input.store,
        turnId: turn.id,
        validation,
      });
    }
    return result;
  };
};
