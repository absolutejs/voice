import type {
	VoiceAgentTool,
	VoiceAgentToolCall
} from './agent';
import {
	createVoiceToolIdempotencyKey,
	createVoiceToolRuntime,
	type VoiceToolRuntimeOptions
} from './toolRuntime';
import type {
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';
import { createVoiceSessionRecord } from './store';

export type VoiceToolContractExpectation = {
	expectedAttempts?: number;
	expectedErrorIncludes?: string;
	expectedResult?: unknown;
	expectIdempotent?: boolean;
	expectStatus?: 'error' | 'ok';
	expectTimedOut?: boolean;
	maxElapsedMs?: number;
};

export type VoiceToolContractCase<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
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
	TRouteResult = unknown
> = {
	cases: Array<
		VoiceToolContractCase<
			TContext,
			TSession,
			TArgs,
			TToolResult,
			TRouteResult
		>
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
	pass: boolean;
	status: 'error' | 'ok';
	timedOut: boolean;
};

export type VoiceToolContractReport = {
	cases: VoiceToolContractCaseReport[];
	contractId: string;
	issues: VoiceToolContractIssue[];
	pass: boolean;
	toolName: string;
};

const createDefaultSession = (contractId: string, caseId: string) =>
	createVoiceSessionRecord(`tool-contract-${contractId}-${caseId}`);

const createDefaultTurn = (caseId: string) =>
	({
		committedAt: Date.now(),
		id: `turn-${caseId}`,
		text: `Run tool contract case ${caseId}.`,
		transcripts: []
	}) as VoiceTurnRecord;

const defaultApi = {} as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

const sameJSON = (left: unknown, right: unknown) =>
	JSON.stringify(left) === JSON.stringify(right);

const evaluateExpectation = (input: {
	caseId: string;
	elapsedMs: number;
	error?: string;
	expect?: VoiceToolContractExpectation;
	status: 'error' | 'ok';
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
			code: 'tool.status_mismatch',
			message: `Expected ${expect.expectStatus}, saw ${input.status}.`
		});
	}
	if (
		typeof expect.expectedAttempts === 'number' &&
		input.attempts !== expect.expectedAttempts
	) {
		issues.push({
			caseId: input.caseId,
			code: 'tool.attempt_mismatch',
			message: `Expected ${expect.expectedAttempts} attempts, saw ${input.attempts}.`
		});
	}
	if (
		expect.expectedResult !== undefined &&
		!sameJSON(input.result, expect.expectedResult)
	) {
		issues.push({
			caseId: input.caseId,
			code: 'tool.result_mismatch',
			message: 'Tool result did not match expected result.'
		});
	}
	if (
		expect.expectedErrorIncludes &&
		!input.error?.includes(expect.expectedErrorIncludes)
	) {
		issues.push({
			caseId: input.caseId,
			code: 'tool.error_mismatch',
			message: `Expected error to include ${expect.expectedErrorIncludes}.`
		});
	}
	if (
		typeof expect.expectTimedOut === 'boolean' &&
		input.timedOut !== expect.expectTimedOut
	) {
		issues.push({
			caseId: input.caseId,
			code: 'tool.timeout_mismatch',
			message: `Expected timedOut=${String(expect.expectTimedOut)}, saw ${String(input.timedOut)}.`
		});
	}
	if (
		typeof expect.maxElapsedMs === 'number' &&
		input.elapsedMs > expect.maxElapsedMs
	) {
		issues.push({
			caseId: input.caseId,
			code: 'tool.elapsed_exceeded',
			message: `Expected elapsed <= ${expect.maxElapsedMs}ms, saw ${input.elapsedMs}ms.`
		});
	}

	return issues;
};

export const runVoiceToolContract = async <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
>(
	definition: VoiceToolContractDefinition<
		TContext,
		TSession,
		TArgs,
		TToolResult,
		TRouteResult
	>
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
			...testCase.runtime
		};
		const runtime = createVoiceToolRuntime<TContext, TSession, TRouteResult>(
			runtimeOptions
		);
		const toolCall: VoiceAgentToolCall<TArgs> = {
			args: testCase.args,
			id: testCase.toolCallId ?? testCase.id,
			name: definition.tool.name
		};
		const executeOnce = () =>
			runtime.execute({
				api: defaultApi as VoiceSessionHandle<TContext, TSession, TRouteResult>,
				args: toolCall.args,
				context,
				session,
				tool: definition.tool,
				toolCallId: toolCall.id,
				turn
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
			timedOut: result.timedOut
		});

		if (testCase.expect?.expectIdempotent) {
			const second = await executeOnce();
			if (second.result !== result.result && !sameJSON(second.result, result.result)) {
				issues.push({
					caseId: testCase.id,
					code: 'tool.idempotency_result_mismatch',
					message: 'Repeated idempotent execution returned a different result.'
				});
			}
			if (second.idempotencyKey !== result.idempotencyKey) {
				issues.push({
					caseId: testCase.id,
					code: 'tool.idempotency_key_mismatch',
					message: 'Repeated idempotent execution used a different idempotency key.'
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
			pass: issues.length === 0,
			status: result.status,
			timedOut: result.timedOut
		});
	}

	const issues = cases.flatMap((testCase) => testCase.issues);
	return {
		cases,
		contractId: definition.id,
		issues,
		pass: issues.length === 0,
		toolName: definition.tool.name
	};
};

export const createVoiceToolContract = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
>(
	definition: VoiceToolContractDefinition<
		TContext,
		TSession,
		TArgs,
		TToolResult,
		TRouteResult
	>
) => ({
	assert: async () => {
		const report = await runVoiceToolContract(definition);
		if (!report.pass) {
			throw new Error(
				`Voice tool contract ${definition.id} failed: ${report.issues
					.map((issue) => issue.message)
					.join(' ')}`
			);
		}
		return report;
	},
	definition,
	run: () => runVoiceToolContract(definition)
});

export const createVoiceToolRuntimeContractDefaults = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TRouteResult = unknown
>(): VoiceToolRuntimeOptions<TContext, TSession, TRouteResult> => ({
	idempotencyKey: ({ args, session, toolCallId, toolName, turn }) =>
		createVoiceToolIdempotencyKey({
			args,
			sessionId: session.id,
			toolCallId,
			toolName,
			turnId: turn.id
		}),
	idempotencyTtlMs: 60_000,
	maxRetries: 1,
	timeoutMs: 5_000
});
