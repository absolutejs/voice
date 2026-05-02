import { Elysia } from "elysia";
import type { VoiceAgentTool, VoiceAgentToolCall } from "./agent";
import {
  createVoiceToolIdempotencyKey,
  createVoiceToolRuntime,
  type VoiceToolRuntimeOptions,
} from "./toolRuntime";
import type {
  VoiceSessionHandle,
  VoiceSessionRecord,
  VoiceTurnRecord,
} from "./types";
import { createVoiceSessionRecord } from "./store";

export type VoiceToolContractExpectation = {
  expectedAttempts?: number;
  expectedErrorIncludes?: string;
  expectedResult?: unknown;
  expectIdempotent?: boolean;
  expectStatus?: "error" | "ok";
  expectTimedOut?: boolean;
  maxElapsedMs?: number;
};

export type VoiceToolContractCase<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs = Record<string, unknown>,
  TToolResult = unknown,
  TRouteResult = unknown,
> = {
  args: TArgs;
  context?: TContext;
  expect?: VoiceToolContractExpectation;
  id: string;
  label?: string;
  runtime?: VoiceToolRuntimeOptions<TContext, TSession, TRouteResult>;
  session?: TSession;
  toolCallId?: string;
  turn?: VoiceTurnRecord;
};

export type VoiceToolContractDefinition<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs = Record<string, unknown>,
  TToolResult = unknown,
  TRouteResult = unknown,
> = {
  cases: Array<
    VoiceToolContractCase<TContext, TSession, TArgs, TToolResult, TRouteResult>
  >;
  defaultRuntime?: VoiceToolRuntimeOptions<TContext, TSession, TRouteResult>;
  description?: string;
  id: string;
  label?: string;
  tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult>;
};

export type VoiceToolContractIssue = {
  caseId: string;
  code: string;
  message: string;
};

export type VoiceToolContractCaseReport = {
  attempts: number;
  caseId: string;
  elapsedMs: number;
  error?: string;
  issues: VoiceToolContractIssue[];
  label?: string;
  operationsRecordHref?: string;
  pass: boolean;
  sessionId: string;
  status: "error" | "ok";
  timedOut: boolean;
};

export type VoiceToolContractReport = {
  cases: VoiceToolContractCaseReport[];
  contractId: string;
  label?: string;
  issues: VoiceToolContractIssue[];
  pass: boolean;
  toolName: string;
};

export type VoiceToolContractSuiteReport = {
  checkedAt: number;
  contracts: VoiceToolContractReport[];
  failed: number;
  passed: number;
  status: "fail" | "pass";
  total: number;
};

export type VoiceToolContractAssertionInput = {
  maxFailed?: number;
  maxIssues?: number;
  maxTimedOut?: number;
  minCases?: number;
  minContracts?: number;
  requireOperationRecordHrefs?: boolean;
  requiredCaseStatuses?: Array<"error" | "ok">;
  requiredContractIds?: string[];
  requiredToolNames?: string[];
};

export type VoiceToolContractAssertionReport = {
  caseStatuses: Array<"error" | "ok">;
  cases: number;
  contractIds: string[];
  failed: number;
  issues: string[];
  issueCount: number;
  missingOperationsRecordHrefs: number;
  ok: boolean;
  passed: number;
  status: VoiceToolContractSuiteReport["status"];
  timedOut: number;
  toolNames: string[];
  total: number;
};

export type VoiceToolContractHandlerOptions = {
  contracts: VoiceToolContractDefinition[];
  operationsRecordHref?: false | string | ((sessionId: string) => string);
};

export type VoiceToolContractHTMLHandlerOptions =
  VoiceToolContractHandlerOptions & {
    headers?: HeadersInit;
    render?: (report: VoiceToolContractSuiteReport) => string | Promise<string>;
    title?: string;
  };

export type VoiceToolContractRoutesOptions =
  VoiceToolContractHTMLHandlerOptions & {
    htmlPath?: false | string;
    name?: string;
    path?: string;
  };

const createDefaultSession = (contractId: string, caseId: string) =>
  createVoiceSessionRecord(`tool-contract-${contractId}-${caseId}`);

const createDefaultTurn = (caseId: string) =>
  ({
    committedAt: Date.now(),
    id: `turn-${caseId}`,
    text: `Run tool contract case ${caseId}.`,
    transcripts: [],
  }) as VoiceTurnRecord;

const defaultApi = {} as VoiceSessionHandle<
  unknown,
  VoiceSessionRecord,
  unknown
>;

const sameJSON = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveSessionHref = (
  value: false | string | ((sessionId: string) => string) | undefined,
  sessionId: string,
) => {
  if (value === false) {
    return undefined;
  }
  const href = value ?? "/voice-operations/:sessionId";
  if (typeof href === "function") {
    return href(sessionId);
  }
  const encoded = encodeURIComponent(sessionId);
  return href.includes(":sessionId")
    ? href.replace(":sessionId", encoded)
    : `${href.replace(/\/$/, "")}/${encoded}`;
};

const evaluateExpectation = (input: {
  caseId: string;
  elapsedMs: number;
  error?: string;
  expect?: VoiceToolContractExpectation;
  status: "error" | "ok";
  attempts: number;
  result?: unknown;
  timedOut: boolean;
}): VoiceToolContractIssue[] => {
  const issues: VoiceToolContractIssue[] = [];
  const expect = input.expect;
  if (!expect) {
    return issues;
  }

  if (expect.expectStatus && input.status !== expect.expectStatus) {
    issues.push({
      caseId: input.caseId,
      code: "tool.status_mismatch",
      message: `Expected ${expect.expectStatus}, saw ${input.status}.`,
    });
  }
  if (
    typeof expect.expectedAttempts === "number" &&
    input.attempts !== expect.expectedAttempts
  ) {
    issues.push({
      caseId: input.caseId,
      code: "tool.attempt_mismatch",
      message: `Expected ${expect.expectedAttempts} attempts, saw ${input.attempts}.`,
    });
  }
  if (
    expect.expectedResult !== undefined &&
    !sameJSON(input.result, expect.expectedResult)
  ) {
    issues.push({
      caseId: input.caseId,
      code: "tool.result_mismatch",
      message: "Tool result did not match expected result.",
    });
  }
  if (
    expect.expectedErrorIncludes &&
    !input.error?.includes(expect.expectedErrorIncludes)
  ) {
    issues.push({
      caseId: input.caseId,
      code: "tool.error_mismatch",
      message: `Expected error to include ${expect.expectedErrorIncludes}.`,
    });
  }
  if (
    typeof expect.expectTimedOut === "boolean" &&
    input.timedOut !== expect.expectTimedOut
  ) {
    issues.push({
      caseId: input.caseId,
      code: "tool.timeout_mismatch",
      message: `Expected timedOut=${String(expect.expectTimedOut)}, saw ${String(input.timedOut)}.`,
    });
  }
  if (
    typeof expect.maxElapsedMs === "number" &&
    input.elapsedMs > expect.maxElapsedMs
  ) {
    issues.push({
      caseId: input.caseId,
      code: "tool.elapsed_exceeded",
      message: `Expected elapsed <= ${expect.maxElapsedMs}ms, saw ${input.elapsedMs}ms.`,
    });
  }

  return issues;
};

export const runVoiceToolContract = async <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs = Record<string, unknown>,
  TToolResult = unknown,
  TRouteResult = unknown,
>(
  definition: VoiceToolContractDefinition<
    TContext,
    TSession,
    TArgs,
    TToolResult,
    TRouteResult
  >,
  options: Pick<VoiceToolContractHandlerOptions, "operationsRecordHref"> = {},
): Promise<VoiceToolContractReport> => {
  const cases: VoiceToolContractCaseReport[] = [];
  for (const testCase of definition.cases) {
    const session =
      testCase.session ??
      (createDefaultSession(definition.id, testCase.id) as TSession);
    const turn = testCase.turn ?? createDefaultTurn(testCase.id);
    const context = testCase.context ?? ({} as TContext);
    const runtimeOptions = {
      ...definition.defaultRuntime,
      ...testCase.runtime,
    };
    const runtime = createVoiceToolRuntime<TContext, TSession, TRouteResult>(
      runtimeOptions,
    );
    const toolCall: VoiceAgentToolCall<TArgs> = {
      args: testCase.args,
      id: testCase.toolCallId ?? testCase.id,
      name: definition.tool.name,
    };
    const executeOnce = () =>
      runtime.execute({
        api: defaultApi as VoiceSessionHandle<TContext, TSession, TRouteResult>,
        args: toolCall.args,
        context,
        session,
        tool: definition.tool,
        toolCallId: toolCall.id,
        turn,
      });
    const result = await executeOnce();
    let issues = evaluateExpectation({
      attempts: result.attempts,
      caseId: testCase.id,
      elapsedMs: result.elapsedMs,
      error: result.error,
      expect: testCase.expect,
      result: result.result,
      status: result.status,
      timedOut: result.timedOut,
    });

    if (testCase.expect?.expectIdempotent) {
      const second = await executeOnce();
      if (
        second.result !== result.result &&
        !sameJSON(second.result, result.result)
      ) {
        issues.push({
          caseId: testCase.id,
          code: "tool.idempotency_result_mismatch",
          message: "Repeated idempotent execution returned a different result.",
        });
      }
      if (second.idempotencyKey !== result.idempotencyKey) {
        issues.push({
          caseId: testCase.id,
          code: "tool.idempotency_key_mismatch",
          message:
            "Repeated idempotent execution used a different idempotency key.",
        });
      }
    }

    cases.push({
      attempts: result.attempts,
      caseId: testCase.id,
      elapsedMs: result.elapsedMs,
      error: result.error,
      issues,
      label: testCase.label,
      operationsRecordHref: resolveSessionHref(
        options.operationsRecordHref,
        session.id,
      ),
      pass: issues.length === 0,
      sessionId: session.id,
      status: result.status,
      timedOut: result.timedOut,
    });
  }

  const issues = cases.flatMap((testCase) => testCase.issues);
  return {
    cases,
    contractId: definition.id,
    label: definition.label,
    issues,
    pass: issues.length === 0,
    toolName: definition.tool.name,
  };
};

export const createVoiceToolContract = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TArgs = Record<string, unknown>,
  TToolResult = unknown,
  TRouteResult = unknown,
>(
  definition: VoiceToolContractDefinition<
    TContext,
    TSession,
    TArgs,
    TToolResult,
    TRouteResult
  >,
) => ({
  assert: async () => {
    const report = await runVoiceToolContract(definition);
    if (!report.pass) {
      throw new Error(
        `Voice tool contract ${definition.id} failed: ${report.issues
          .map((issue) => issue.message)
          .join(" ")}`,
      );
    }
    return report;
  },
  definition,
  run: () => runVoiceToolContract(definition),
});

export const createVoiceToolRuntimeContractDefaults = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TRouteResult = unknown,
>(): VoiceToolRuntimeOptions<TContext, TSession, TRouteResult> => ({
  idempotencyKey: ({ args, session, toolCallId, toolName, turn }) =>
    createVoiceToolIdempotencyKey({
      args,
      sessionId: session.id,
      toolCallId,
      toolName,
      turnId: turn.id,
    }),
  idempotencyTtlMs: 60_000,
  maxRetries: 1,
  timeoutMs: 5_000,
});

export const runVoiceToolContractSuite = async (
  options: VoiceToolContractHandlerOptions,
): Promise<VoiceToolContractSuiteReport> => {
  const contracts = await Promise.all(
    options.contracts.map((contract) =>
      runVoiceToolContract(contract, options),
    ),
  );
  const passed = contracts.filter((contract) => contract.pass).length;
  const failed = contracts.length - passed;

  return {
    checkedAt: Date.now(),
    contracts,
    failed,
    passed,
    status: failed > 0 ? "fail" : "pass",
    total: contracts.length,
  };
};

export const evaluateVoiceToolContractEvidence = (
  report: VoiceToolContractSuiteReport,
  input: VoiceToolContractAssertionInput = {},
): VoiceToolContractAssertionReport => {
  const issues: string[] = [];
  const maxFailed = input.maxFailed ?? 0;
  const maxIssues = input.maxIssues ?? 0;
  const maxTimedOut = input.maxTimedOut ?? Infinity;
  const cases = report.contracts.flatMap((contract) => contract.cases);
  const contractIds = [
    ...new Set(report.contracts.map((contract) => contract.contractId)),
  ].sort();
  const toolNames = [
    ...new Set(report.contracts.map((contract) => contract.toolName)),
  ].sort();
  const caseStatuses = [
    ...new Set(cases.map((testCase) => testCase.status)),
  ].sort();
  const issueCount = report.contracts.reduce(
    (total, contract) => total + contract.issues.length,
    0,
  );
  const timedOut = cases.filter((testCase) => testCase.timedOut).length;
  const missingOperationsRecordHrefs = cases.filter(
    (testCase) => !testCase.operationsRecordHref,
  ).length;

  if (input.minContracts !== undefined && report.total < input.minContracts) {
    issues.push(
      `Expected at least ${String(input.minContracts)} tool contract(s), found ${String(report.total)}.`,
    );
  }
  if (input.minCases !== undefined && cases.length < input.minCases) {
    issues.push(
      `Expected at least ${String(input.minCases)} tool contract case(s), found ${String(cases.length)}.`,
    );
  }
  if (report.failed > maxFailed) {
    issues.push(
      `Expected at most ${String(maxFailed)} failing tool contract(s), found ${String(report.failed)}.`,
    );
  }
  if (issueCount > maxIssues) {
    issues.push(
      `Expected at most ${String(maxIssues)} tool contract issue(s), found ${String(issueCount)}.`,
    );
  }
  if (timedOut > maxTimedOut) {
    issues.push(
      `Expected at most ${String(maxTimedOut)} timed out tool contract case(s), found ${String(timedOut)}.`,
    );
  }
  if (
    (input.requireOperationRecordHrefs ?? false) &&
    missingOperationsRecordHrefs > 0
  ) {
    issues.push(
      `Expected every tool contract case to include an operations record href; ${String(missingOperationsRecordHrefs)} missing.`,
    );
  }
  for (const contractId of input.requiredContractIds ?? []) {
    if (!contractIds.includes(contractId)) {
      issues.push(`Missing tool contract: ${contractId}.`);
    }
  }
  for (const toolName of input.requiredToolNames ?? []) {
    if (!toolNames.includes(toolName)) {
      issues.push(`Missing tool contract tool: ${toolName}.`);
    }
  }
  for (const status of input.requiredCaseStatuses ?? []) {
    if (!caseStatuses.includes(status)) {
      issues.push(`Missing tool contract case status: ${status}.`);
    }
  }

  return {
    caseStatuses,
    cases: cases.length,
    contractIds,
    failed: report.failed,
    issues,
    issueCount,
    missingOperationsRecordHrefs,
    ok: issues.length === 0,
    passed: report.passed,
    status: report.status,
    timedOut,
    toolNames,
    total: report.total,
  };
};

export const assertVoiceToolContractEvidence = (
  report: VoiceToolContractSuiteReport,
  input: VoiceToolContractAssertionInput = {},
): VoiceToolContractAssertionReport => {
  const assertion = evaluateVoiceToolContractEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice tool contract evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const renderVoiceToolContractHTML = (
  report: VoiceToolContractSuiteReport,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Tool Contracts";
  const snippet = escapeHtml(`app.use(
	createVoiceToolContractRoutes({
		htmlPath: '/tool-contracts',
		path: '/api/tool-contracts',
		contracts: [
			{
				id: 'calendar-booking',
				label: 'Calendar booking contract',
				tool: calendarTool,
				cases: [
					{
						id: 'happy-path',
						args: { date: '2026-05-01', email: 'alex@example.com' },
						expect: {
							expectStatus: 'ok',
							expectIdempotent: true,
							maxElapsedMs: 750
						}
					}
				]
			}
		]
	})
);`);
  const contracts = report.contracts
    .map((contract) => {
      const cases = contract.cases
        .map(
          (testCase) => `<tr>
  <td>${testCase.operationsRecordHref ? `<a href="${escapeHtml(testCase.operationsRecordHref)}">${escapeHtml(testCase.label ?? testCase.caseId)}</a>` : escapeHtml(testCase.label ?? testCase.caseId)}</td>
  <td class="${testCase.pass ? "pass" : "fail"}">${testCase.pass ? "pass" : "fail"}</td>
  <td>${escapeHtml(testCase.status)}</td>
  <td>${escapeHtml(testCase.sessionId)}</td>
  <td>${String(testCase.attempts)}</td>
  <td>${String(testCase.elapsedMs)}ms</td>
  <td>${testCase.timedOut ? "yes" : "no"}</td>
  <td>${escapeHtml(testCase.issues.map((issue) => issue.message).join(" ") || testCase.error || "")}</td>
</tr>`,
        )
        .join("");
      return `<section class="contract ${contract.pass ? "pass" : "fail"}">
  <div class="contract-header">
    <div>
      <p class="eyebrow">${escapeHtml(contract.toolName)}</p>
      <h2>${escapeHtml(contract.label ?? contract.contractId)}</h2>
    </div>
    <strong class="${contract.pass ? "pass" : "fail"}">${contract.pass ? "Passing" : "Failing"}</strong>
  </div>
  <table>
    <thead><tr><th>Case</th><th>Status</th><th>Result</th><th>Session</th><th>Attempts</th><th>Elapsed</th><th>Timed out</th><th>Issues</th></tr></thead>
    <tbody>${cases}</tbody>
  </table>
</section>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.primitive,.contract{background:#181d22;border:1px solid #2a323a;border-radius:20px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.14),rgba(245,158,11,.12))}.primitive{background:#151b20;border-color:#5a4421}.eyebrow{color:#fbbf24;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0f1217;border:1px solid #3f3f46;border-radius:999px;padding:7px 10px}.contract-header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}h2{margin:.2rem 0 1rem}.pass{color:#86efac}.fail{color:#fca5a5}.contract.fail{border-color:rgba(248,113,113,.45)}.primitive p{color:#d8dee6;line-height:1.55}.primitive pre{background:#0f1217;border:1px solid #2a323a;border-radius:16px;color:#fef3c7;overflow:auto;padding:14px}.primitive code{color:#fef3c7}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2a323a;padding:12px;text-align:left;vertical-align:top}th{color:#a8b0b8;font-size:.82rem}@media(max-width:800px){main{padding:18px}table{display:block;overflow:auto}.contract-header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Tool Reliability</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill ${report.status === "pass" ? "pass" : "fail"}">${escapeHtml(report.status)}</span><span class="pill">${String(report.passed)} passing</span><span class="pill">${String(report.failed)} failing</span><span class="pill">${String(report.total)} contracts</span></div></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceToolContractRoutes(...)</code> certifies tool behavior</h2><p>Define deterministic tool cases for retries, idempotency, timeouts, result shape, and error handling so assistant tools fail in pre-production instead of live calls.</p><pre><code>${snippet}</code></pre></section>${contracts || '<section class="contract"><p>No tool contracts configured.</p></section>'}</main></body></html>`;
};

export const createVoiceToolContractJSONHandler =
  (options: VoiceToolContractHandlerOptions) => () =>
    runVoiceToolContractSuite(options);

export const createVoiceToolContractHTMLHandler =
  (options: VoiceToolContractHTMLHandlerOptions) => async () => {
    const report = await runVoiceToolContractSuite(options);
    const render =
      options.render ??
      ((input) => renderVoiceToolContractHTML(input, options));
    const body = await render(report);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceToolContractRoutes = (
  options: VoiceToolContractRoutesOptions,
) => {
  const path = options.path ?? "/api/tool-contracts";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-tool-contracts",
  }).get(path, createVoiceToolContractJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceToolContractHTMLHandler(options));
  }

  return routes;
};
