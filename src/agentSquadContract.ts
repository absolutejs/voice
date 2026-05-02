import type {
  VoiceAgent,
  VoiceAgentRunResult,
  VoiceAgentSquadHandoffStatus,
} from "./agent";
import { createVoiceSessionRecord } from "./store";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  VoiceRouteResult,
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnRecord,
} from "./types";

export type VoiceAgentSquadContractOutcome =
  | "assistant"
  | "complete"
  | "escalate"
  | "no-answer"
  | "transfer"
  | "voicemail";

export type VoiceAgentSquadHandoffExpectation = {
  fromAgentId?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  reasonIncludes?: string[];
  status?: VoiceAgentSquadHandoffStatus;
  summary?: string;
  summaryIncludes?: string[];
  targetAgentId?: string;
};

export type VoiceAgentSquadTurnExpectation<TResult = unknown> = {
  assistantIncludes?: string[];
  finalAgentId?: string;
  handoffs?: VoiceAgentSquadHandoffExpectation[];
  outcome?: VoiceAgentSquadContractOutcome;
  result?: (input: {
    result: TResult | undefined;
    routeResult: VoiceRouteResult<TResult>;
  }) => VoiceAgentSquadContractIssue[];
  transferTarget?: string;
};

export type VoiceAgentSquadContractTurn<TResult = unknown> = {
  expect?: VoiceAgentSquadTurnExpectation<TResult>;
  id?: string;
  text: string;
};

export type VoiceAgentSquadContractDefinition<TResult = unknown> = {
  description?: string;
  id: string;
  label?: string;
  scenarioId?: string;
  turns: Array<VoiceAgentSquadContractTurn<TResult>>;
};

export type VoiceAgentSquadContractIssue = {
  code: string;
  message: string;
  turnId?: string;
};

export type VoiceAgentSquadContractTurnReport<TResult = unknown> = {
  agentId: string;
  handoffs: VoiceAgentSquadHandoffExpectation[];
  issues: VoiceAgentSquadContractIssue[];
  outcome?: VoiceAgentSquadContractOutcome;
  pass: boolean;
  result: VoiceAgentRunResult<TResult>;
  turnId: string;
};

export type VoiceAgentSquadContractReport<TResult = unknown> = {
  contractId: string;
  issues: VoiceAgentSquadContractIssue[];
  pass: boolean;
  scenarioId?: string;
  sessionId: string;
  turns: Array<VoiceAgentSquadContractTurnReport<TResult>>;
};

export type VoiceAgentSquadContractRunOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  api?: VoiceSessionHandle<TContext, TSession, TResult>;
  context: TContext;
  contract: VoiceAgentSquadContractDefinition<TResult>;
  session?: TSession;
  squad: VoiceAgent<TContext, TSession, TResult>;
  trace?: VoiceTraceEventStore;
};

export type VoiceAgentSquadContractAssertionInput = {
  maxBlockedHandoffs?: number;
  maxFailed?: number;
  maxIssues?: number;
  minContracts?: number;
  minHandoffs?: number;
  requiredContractIds?: string[];
  requiredFinalAgentIds?: string[];
  requiredHandoffStatuses?: VoiceAgentSquadHandoffStatus[];
  requiredHandoffTargets?: string[];
  requiredScenarioIds?: string[];
};

export type VoiceAgentSquadContractAssertionReport = {
  blockedHandoffs: number;
  contractIds: string[];
  failed: number;
  finalAgentIds: string[];
  handoffStatuses: VoiceAgentSquadHandoffStatus[];
  handoffTargets: string[];
  handoffs: number;
  issues: string[];
  issueCount: number;
  ok: boolean;
  passed: number;
  scenarioIds: string[];
  total: number;
};

const normalizeIncludes = (value: string) => value.trim().toLowerCase();

const resolveOutcome = <TResult>(
  result: VoiceRouteResult<TResult>,
): VoiceAgentSquadContractOutcome | undefined => {
  if (result.complete) return "complete";
  if (result.transfer) return "transfer";
  if (result.escalate) return "escalate";
  if (result.voicemail) return "voicemail";
  if (result.noAnswer) return "no-answer";
  if (result.assistantText?.trim()) return "assistant";
  return undefined;
};

const getPayloadString = (
  event: StoredVoiceTraceEvent,
  key: string,
): string | undefined => {
  const value = event.payload[key];
  return typeof value === "string" ? value : undefined;
};

const getPayloadRecord = (
  event: StoredVoiceTraceEvent,
  key: string,
): Record<string, unknown> | undefined => {
  const value = event.payload[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

const toHandoffExpectation = (
  event: StoredVoiceTraceEvent,
): VoiceAgentSquadHandoffExpectation => ({
  fromAgentId: getPayloadString(event, "fromAgentId"),
  metadata: getPayloadRecord(event, "metadata"),
  reason: getPayloadString(event, "reason"),
  status: getPayloadString(event, "status") as
    | VoiceAgentSquadHandoffStatus
    | undefined,
  summary: getPayloadString(event, "summary"),
  targetAgentId: getPayloadString(event, "targetAgentId"),
});

const createContractApi = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  session: TSession,
): VoiceSessionHandle<TContext, TSession, TResult> =>
  ({
    close: async () => {},
    commitTurn: async () => {},
    complete: async () => {},
    connect: async () => {},
    disconnect: async () => {},
    escalate: async () => {},
    fail: async () => {},
    id: session.id,
    markNoAnswer: async () => {},
    markVoicemail: async () => {},
    receiveAudio: async () => {},
    snapshot: async () => session,
    transfer: async () => {},
  }) as VoiceSessionHandle<TContext, TSession, TResult>;

const createContractTurn = <TResult>(
  turn: VoiceAgentSquadContractTurn<TResult>,
  index: number,
): VoiceTurnRecord<TResult> => ({
  committedAt: Date.now(),
  id: turn.id ?? `turn-${index + 1}`,
  text: turn.text,
  transcripts: [],
});

const appendIssue = (
  issues: VoiceAgentSquadContractIssue[],
  issue: VoiceAgentSquadContractIssue,
  turnId: string,
) => {
  issues.push({
    ...issue,
    turnId: issue.turnId ?? turnId,
  });
};

const assertIncludes = (input: {
  actual?: string[];
  code: string;
  expected?: string[];
  handoffIndex: number;
  issues: VoiceAgentSquadContractIssue[];
  label: string;
  turnId: string;
}) => {
  const actual = normalizeIncludes(input.actual?.join(" ") ?? "");
  for (const expected of input.expected ?? []) {
    if (!actual.includes(normalizeIncludes(expected))) {
      appendIssue(
        input.issues,
        {
          code: input.code,
          message: `Expected handoff ${input.handoffIndex + 1} ${input.label} to include: ${expected}`,
        },
        input.turnId,
      );
    }
  }
};

const assertMetadata = (input: {
  actual?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  handoffIndex: number;
  issues: VoiceAgentSquadContractIssue[];
  turnId: string;
}) => {
  for (const [key, expectedValue] of Object.entries(input.expected ?? {})) {
    const actualValue = input.actual?.[key];
    if (actualValue !== expectedValue) {
      appendIssue(
        input.issues,
        {
          code: "agent_squad.handoff_metadata_mismatch",
          message: `Expected handoff ${input.handoffIndex + 1} metadata ${key} ${String(expectedValue)}, saw ${String(actualValue ?? "none")}.`,
        },
        input.turnId,
      );
    }
  }
};

export const runVoiceAgentSquadContract = async <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceAgentSquadContractRunOptions<TContext, TSession, TResult>,
): Promise<VoiceAgentSquadContractReport<TResult>> => {
  const session =
    options.session ??
    createVoiceSessionRecord<TSession>(
      `agent-squad-contract-${options.contract.id}`,
      options.contract.scenarioId ?? options.contract.id,
    );
  const api =
    options.api ?? createContractApi<TContext, TSession, TResult>(session);
  const turnReports: Array<VoiceAgentSquadContractTurnReport<TResult>> = [];
  const issues: VoiceAgentSquadContractIssue[] = [];

  for (const [index, contractTurn] of options.contract.turns.entries()) {
    const turn = createContractTurn(contractTurn, index);
    const result = await options.squad.run({
      api,
      context: options.context,
      session,
      turn,
    });
    const handoffEvents =
      (await options.trace?.list({
        sessionId: session.id,
        turnId: turn.id,
        type: "agent.handoff",
      })) ?? [];
    const handoffs = handoffEvents.map(toHandoffExpectation);
    const turnIssues: VoiceAgentSquadContractIssue[] = [];
    const expected = contractTurn.expect;
    const outcome = resolveOutcome(result);

    if (expected?.finalAgentId && result.agentId !== expected.finalAgentId) {
      appendIssue(
        turnIssues,
        {
          code: "agent_squad.final_agent_mismatch",
          message: `Expected final agent ${expected.finalAgentId}, saw ${result.agentId}.`,
        },
        turn.id,
      );
    }

    if (expected?.outcome && outcome !== expected.outcome) {
      appendIssue(
        turnIssues,
        {
          code: "agent_squad.outcome_mismatch",
          message: `Expected outcome ${expected.outcome}, saw ${outcome ?? "none"}.`,
        },
        turn.id,
      );
    }

    if (
      expected?.transferTarget &&
      result.transfer?.target !== expected.transferTarget
    ) {
      appendIssue(
        turnIssues,
        {
          code: "agent_squad.transfer_target_mismatch",
          message: `Expected transfer target ${expected.transferTarget}, saw ${result.transfer?.target ?? "none"}.`,
        },
        turn.id,
      );
    }

    const assistantText = normalizeIncludes(result.assistantText ?? "");
    for (const expectedText of expected?.assistantIncludes ?? []) {
      if (!assistantText.includes(normalizeIncludes(expectedText))) {
        appendIssue(
          turnIssues,
          {
            code: "agent_squad.assistant_text_missing",
            message: `Expected assistant text to include: ${expectedText}`,
          },
          turn.id,
        );
      }
    }

    for (const [handoffIndex, expectedHandoff] of (
      expected?.handoffs ?? []
    ).entries()) {
      const actual = handoffs[handoffIndex];
      if (!actual) {
        appendIssue(
          turnIssues,
          {
            code: "agent_squad.handoff_missing",
            message: `Expected handoff ${handoffIndex + 1}, but no trace event was recorded.`,
          },
          turn.id,
        );
        continue;
      }

      for (const key of ["fromAgentId", "status", "targetAgentId"] as const) {
        if (expectedHandoff[key] && actual[key] !== expectedHandoff[key]) {
          appendIssue(
            turnIssues,
            {
              code: "agent_squad.handoff_mismatch",
              message: `Expected handoff ${handoffIndex + 1} ${key} ${expectedHandoff[key]}, saw ${actual[key] ?? "none"}.`,
            },
            turn.id,
          );
        }
      }
      for (const key of ["reason", "summary"] as const) {
        if (expectedHandoff[key] && actual[key] !== expectedHandoff[key]) {
          appendIssue(
            turnIssues,
            {
              code: `agent_squad.handoff_${key}_mismatch`,
              message: `Expected handoff ${handoffIndex + 1} ${key} ${expectedHandoff[key]}, saw ${actual[key] ?? "none"}.`,
            },
            turn.id,
          );
        }
      }
      assertIncludes({
        actual: actual.reason ? [actual.reason] : undefined,
        code: "agent_squad.handoff_reason_missing",
        expected: expectedHandoff.reasonIncludes,
        handoffIndex,
        issues: turnIssues,
        label: "reason",
        turnId: turn.id,
      });
      assertIncludes({
        actual: actual.summary ? [actual.summary] : undefined,
        code: "agent_squad.handoff_summary_missing",
        expected: expectedHandoff.summaryIncludes,
        handoffIndex,
        issues: turnIssues,
        label: "summary",
        turnId: turn.id,
      });
      assertMetadata({
        actual: actual.metadata,
        expected: expectedHandoff.metadata,
        handoffIndex,
        issues: turnIssues,
        turnId: turn.id,
      });
    }

    for (const issue of expected?.result?.({
      result: result.result,
      routeResult: result,
    }) ?? []) {
      appendIssue(turnIssues, issue, turn.id);
    }

    issues.push(...turnIssues);
    turnReports.push({
      agentId: result.agentId,
      handoffs,
      issues: turnIssues,
      outcome,
      pass: turnIssues.length === 0,
      result,
      turnId: turn.id,
    });
    session.turns.push({
      ...turn,
      assistantText: result.assistantText,
      result: result.result,
    });
  }

  return {
    contractId: options.contract.id,
    issues,
    pass: issues.length === 0,
    scenarioId: options.contract.scenarioId,
    sessionId: session.id,
    turns: turnReports,
  };
};

export const assertVoiceAgentSquadContract = async <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceAgentSquadContractRunOptions<TContext, TSession, TResult>,
): Promise<VoiceAgentSquadContractReport<TResult>> => {
  const report = await runVoiceAgentSquadContract(options);
  if (!report.pass) {
    throw new Error(
      `Voice agent squad contract ${report.contractId} failed: ${report.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  return report;
};

export const evaluateVoiceAgentSquadContractEvidence = (
  reports: readonly VoiceAgentSquadContractReport[],
  input: VoiceAgentSquadContractAssertionInput = {},
): VoiceAgentSquadContractAssertionReport => {
  const issues: string[] = [];
  const maxFailed = input.maxFailed ?? 0;
  const maxIssues = input.maxIssues ?? 0;
  const maxBlockedHandoffs = input.maxBlockedHandoffs ?? Infinity;
  const allHandoffs = reports.flatMap((report) =>
    report.turns.flatMap((turn) => turn.handoffs),
  );
  const contractIds = [
    ...new Set(reports.map((report) => report.contractId)),
  ].sort();
  const scenarioIds = [
    ...new Set(
      reports
        .map((report) => report.scenarioId)
        .filter((scenarioId): scenarioId is string => Boolean(scenarioId)),
    ),
  ].sort();
  const finalAgentIds = [
    ...new Set(
      reports.flatMap((report) => report.turns.map((turn) => turn.agentId)),
    ),
  ].sort();
  const handoffTargets = [
    ...new Set(
      allHandoffs
        .map((handoff) => handoff.targetAgentId)
        .filter((target): target is string => Boolean(target)),
    ),
  ].sort();
  const handoffStatuses = [
    ...new Set(
      allHandoffs
        .map((handoff) => handoff.status)
        .filter(
          (status): status is VoiceAgentSquadHandoffStatus =>
            status !== undefined,
        ),
    ),
  ].sort();
  const failed = reports.filter((report) => !report.pass).length;
  const issueCount = reports.reduce(
    (total, report) => total + report.issues.length,
    0,
  );
  const blockedHandoffs = allHandoffs.filter(
    (handoff) => handoff.status === "blocked",
  ).length;

  if (input.minContracts !== undefined && reports.length < input.minContracts) {
    issues.push(
      `Expected at least ${String(input.minContracts)} agent squad contract(s), found ${String(reports.length)}.`,
    );
  }
  if (failed > maxFailed) {
    issues.push(
      `Expected at most ${String(maxFailed)} failing agent squad contract(s), found ${String(failed)}.`,
    );
  }
  if (issueCount > maxIssues) {
    issues.push(
      `Expected at most ${String(maxIssues)} agent squad contract issue(s), found ${String(issueCount)}.`,
    );
  }
  if (
    input.minHandoffs !== undefined &&
    allHandoffs.length < input.minHandoffs
  ) {
    issues.push(
      `Expected at least ${String(input.minHandoffs)} agent squad handoff(s), found ${String(allHandoffs.length)}.`,
    );
  }
  if (blockedHandoffs > maxBlockedHandoffs) {
    issues.push(
      `Expected at most ${String(maxBlockedHandoffs)} blocked agent squad handoff(s), found ${String(blockedHandoffs)}.`,
    );
  }
  for (const contractId of input.requiredContractIds ?? []) {
    if (!contractIds.includes(contractId)) {
      issues.push(`Missing agent squad contract: ${contractId}.`);
    }
  }
  for (const scenarioId of input.requiredScenarioIds ?? []) {
    if (!scenarioIds.includes(scenarioId)) {
      issues.push(`Missing agent squad scenario: ${scenarioId}.`);
    }
  }
  for (const agentId of input.requiredFinalAgentIds ?? []) {
    if (!finalAgentIds.includes(agentId)) {
      issues.push(`Missing final agent: ${agentId}.`);
    }
  }
  for (const target of input.requiredHandoffTargets ?? []) {
    if (!handoffTargets.includes(target)) {
      issues.push(`Missing agent squad handoff target: ${target}.`);
    }
  }
  for (const status of input.requiredHandoffStatuses ?? []) {
    if (!handoffStatuses.includes(status)) {
      issues.push(`Missing agent squad handoff status: ${status}.`);
    }
  }

  return {
    blockedHandoffs,
    contractIds,
    failed,
    finalAgentIds,
    handoffStatuses,
    handoffTargets,
    handoffs: allHandoffs.length,
    issues,
    issueCount,
    ok: issues.length === 0,
    passed: reports.length - failed,
    scenarioIds,
    total: reports.length,
  };
};

export const assertVoiceAgentSquadContractEvidence = (
  reports: readonly VoiceAgentSquadContractReport[],
  input: VoiceAgentSquadContractAssertionInput = {},
): VoiceAgentSquadContractAssertionReport => {
  const report = evaluateVoiceAgentSquadContractEvidence(reports, input);
  if (!report.ok) {
    throw new Error(
      `Voice agent squad contract evidence assertion failed: ${report.issues.join(" ")}`,
    );
  }
  return report;
};
