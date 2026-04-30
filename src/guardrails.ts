import { Elysia } from 'elysia';
import type { VoiceAgentTool } from './agent';
import type { VoiceTraceEventStore } from './trace';
import type {
	VoiceOnTurnObjectHandler,
	VoiceRouteResult,
	VoiceSessionRecord
} from './types';
import type { VoiceAssistantGuardrails } from './assistant';

export type VoiceGuardrailStage =
	| 'assistant-output'
	| 'handoff'
	| 'model-input'
	| 'tool-input'
	| 'tool-output'
	| 'transcript';

export type VoiceGuardrailSeverity = 'block' | 'warn';

export type VoiceGuardrailStatus = 'blocked' | 'pass' | 'warn';

export type VoiceGuardrailRule = {
	action?: VoiceGuardrailSeverity;
	description?: string;
	id: string;
	label?: string;
	match:
		| RegExp
		| string
		| ((input: VoiceGuardrailEvaluationInput) => boolean | Promise<boolean>);
	redactWith?: string;
	stages?: VoiceGuardrailStage[];
};

export type VoiceGuardrailEvaluationInput = {
	content?: unknown;
	metadata?: Record<string, unknown>;
	sessionId?: string;
	stage: VoiceGuardrailStage;
	turnId?: string;
};

export type VoiceGuardrailFinding = {
	action: VoiceGuardrailSeverity;
	description?: string;
	label: string;
	ruleId: string;
	stage: VoiceGuardrailStage;
};

export type VoiceGuardrailDecision = {
	allowed: boolean;
	checkedAt: number;
	content?: unknown;
	findings: VoiceGuardrailFinding[];
	redactedContent?: unknown;
	sessionId?: string;
	stage: VoiceGuardrailStage;
	status: VoiceGuardrailStatus;
	turnId?: string;
};

export type VoiceGuardrailPolicy = {
	defaultAction?: VoiceGuardrailSeverity;
	id: string;
	label?: string;
	rules: VoiceGuardrailRule[];
};

export type VoiceGuardrailReport = {
	checkedAt: number;
	decisions: VoiceGuardrailDecision[];
	failed: number;
	policies: Array<{
		id: string;
		label?: string;
		rules: number;
	}>;
	status: 'fail' | 'pass' | 'warn';
	summary: {
		blocked: number;
		passed: number;
		warned: number;
	};
	total: number;
};

export type VoiceGuardrailRoutesOptions = {
	headers?: HeadersInit;
	name?: string;
	path?: string;
	policies?: VoiceGuardrailPolicy[];
	source?:
		| ((
				input: VoiceGuardrailEvaluationInput
		  ) =>
				| Promise<VoiceGuardrailDecision | VoiceGuardrailReport>
				| VoiceGuardrailDecision
				| VoiceGuardrailReport)
		| VoiceGuardrailDecision
		| VoiceGuardrailReport;
	trace?: VoiceTraceEventStore;
};

export type VoiceGuardrailRuntimeBlockInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Parameters<VoiceOnTurnObjectHandler<TContext, TSession, TResult>>[0] & {
	decision: VoiceGuardrailDecision;
	stage: VoiceGuardrailStage;
};

export type VoiceGuardrailRuntimeOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	blockResult?: (
		input: VoiceGuardrailRuntimeBlockInput<TContext, TSession, TResult>
	) => Promise<VoiceRouteResult<TResult>> | VoiceRouteResult<TResult>;
	name?: string;
	policies: VoiceGuardrailPolicy[];
	trace?: VoiceTraceEventStore;
};

export type VoiceGuardrailRuntime<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	assistantGuardrails: VoiceAssistantGuardrails<TContext, TSession, TResult>;
	evaluate: (input: VoiceGuardrailEvaluationInput) => Promise<VoiceGuardrailDecision>;
	wrapTool: <TArgs extends Record<string, unknown>, TToolResult>(
		tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TResult>
	) => VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TResult>;
	wrapTools: (
		tools: Array<
			VoiceAgentTool<
				TContext,
				TSession,
				Record<string, unknown>,
				unknown,
				TResult
			>
		>
	) => Array<
		VoiceAgentTool<
			TContext,
			TSession,
			Record<string, unknown>,
			unknown,
			TResult
		>
	>;
};

const stringifyContent = (value: unknown) =>
	typeof value === 'string' ? value : JSON.stringify(value) ?? '';

const appliesToStage = (
	rule: VoiceGuardrailRule,
	stage: VoiceGuardrailStage
) => !rule.stages || rule.stages.length === 0 || rule.stages.includes(stage);

const matchesRule = async (
	rule: VoiceGuardrailRule,
	input: VoiceGuardrailEvaluationInput
) => {
	if (!appliesToStage(rule, input.stage)) {
		return false;
	}
	if (typeof rule.match === 'function') {
		return rule.match(input);
	}
	const content = stringifyContent(input.content);
	return typeof rule.match === 'string'
		? content.toLowerCase().includes(rule.match.toLowerCase())
		: rule.match.test(content);
};

const applyRedactions = (
	content: unknown,
	rules: VoiceGuardrailRule[],
	findings: VoiceGuardrailFinding[]
) => {
	if (typeof content !== 'string') {
		return content;
	}

	return findings.reduce((value, finding) => {
		const rule = rules.find((candidate) => candidate.id === finding.ruleId);
		if (!rule || !rule.redactWith) {
			return value;
		}
		if (typeof rule.match === 'string') {
			return value.replaceAll(rule.match, rule.redactWith);
		}
		if (rule.match instanceof RegExp) {
			return value.replace(rule.match, rule.redactWith);
		}
		return value;
	}, content);
};

export const evaluateVoiceGuardrailPolicy = async (
	policy: VoiceGuardrailPolicy,
	input: VoiceGuardrailEvaluationInput
): Promise<VoiceGuardrailDecision> => {
	const findings: VoiceGuardrailFinding[] = [];

	for (const rule of policy.rules) {
		if (!(await matchesRule(rule, input))) {
			continue;
		}
		findings.push({
			action: rule.action ?? policy.defaultAction ?? 'block',
			description: rule.description,
			label: rule.label ?? rule.id,
			ruleId: rule.id,
			stage: input.stage
		});
	}

	const blocked = findings.some((finding) => finding.action === 'block');
	const status: VoiceGuardrailStatus = blocked
		? 'blocked'
		: findings.length > 0
			? 'warn'
			: 'pass';

	return {
		allowed: !blocked,
		checkedAt: Date.now(),
		content: input.content,
		findings,
		redactedContent: applyRedactions(input.content, policy.rules, findings),
		sessionId: input.sessionId,
		stage: input.stage,
		status,
		turnId: input.turnId
	};
};

export const buildVoiceGuardrailReport = (
	input: {
		decisions: VoiceGuardrailDecision[];
		policies?: VoiceGuardrailPolicy[];
	} = { decisions: [] }
): VoiceGuardrailReport => {
	const blocked = input.decisions.filter(
		(decision) => decision.status === 'blocked'
	).length;
	const warned = input.decisions.filter(
		(decision) => decision.status === 'warn'
	).length;
	const passed = input.decisions.filter(
		(decision) => decision.status === 'pass'
	).length;
	const status = blocked > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';

	return {
		checkedAt: Date.now(),
		decisions: input.decisions,
		failed: blocked,
		policies: (input.policies ?? []).map((policy) => ({
			id: policy.id,
			label: policy.label,
			rules: policy.rules.length
		})),
		status,
		summary: {
			blocked,
			passed,
			warned
		},
		total: input.decisions.length
	};
};

export const createVoiceGuardrailPolicy = (
	policy: VoiceGuardrailPolicy
): VoiceGuardrailPolicy => policy;

const appendGuardrailTrace = async (
	trace: VoiceTraceEventStore | undefined,
	decision: VoiceGuardrailDecision,
	metadata?: Record<string, unknown>
) => {
	await trace?.append({
		at: decision.checkedAt,
		payload: {
			allowed: decision.allowed,
			findingCount: decision.findings.length,
			findings: decision.findings,
			metadata,
			redactedContent: decision.redactedContent,
			stage: decision.stage,
			status: decision.status
		},
		sessionId: decision.sessionId ?? 'guardrail-check',
		turnId: decision.turnId,
		type: 'assistant.guardrail'
	});
};

const defaultGuardrailBlockResult = <TResult>(
	reason: string
): VoiceRouteResult<TResult> => ({
	assistantText:
		'I cannot safely complete that in the automated flow. I am routing this to a human specialist.',
	escalate: {
		metadata: {
			guardrail: true
		},
		reason
	}
});

export const createVoiceGuardrailRuntime = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceGuardrailRuntimeOptions<TContext, TSession, TResult>
): VoiceGuardrailRuntime<TContext, TSession, TResult> => {
	const evaluate = async (input: VoiceGuardrailEvaluationInput) => {
		const decisions = await Promise.all(
			options.policies.map((policy) => evaluateVoiceGuardrailPolicy(policy, input))
		);
		await Promise.all(
			decisions.map((decision) =>
				appendGuardrailTrace(options.trace, decision, input.metadata)
			)
		);
		return decisions.find((decision) => !decision.allowed) ?? decisions[0]!;
	};
	const blockResult = async (
		input: VoiceGuardrailRuntimeBlockInput<TContext, TSession, TResult>
	) =>
		options.blockResult?.(input) ??
		defaultGuardrailBlockResult<TResult>(
			`guardrail-blocked-${input.stage}`
		);

	const assistantGuardrails: VoiceAssistantGuardrails<
		TContext,
		TSession,
		TResult
	> = {
		beforeTurn: async (input) => {
			const transcriptDecision = await evaluate({
				content: input.turn.text,
				metadata: {
					runtime: options.name,
					surface: 'live-transcript'
				},
				sessionId: input.session.id,
				stage: 'transcript',
				turnId: input.turn.id
			});
			if (!transcriptDecision.allowed) {
				return blockResult({
					...input,
					decision: transcriptDecision,
					stage: 'transcript'
				});
			}

			const modelInputDecision = await evaluate({
				content: JSON.stringify({
					scenarioId: input.session.scenarioId,
					turn: input.turn.text
				}),
				metadata: {
					runtime: options.name,
					surface: 'live-model-input'
				},
				sessionId: input.session.id,
				stage: 'model-input',
				turnId: input.turn.id
			});
			if (!modelInputDecision.allowed) {
				return blockResult({
					...input,
					decision: modelInputDecision,
					stage: 'model-input'
				});
			}

			return undefined;
		},
		afterTurn: async (input) => {
			if (!input.result.assistantText) {
				return undefined;
			}

			const decision = await evaluate({
				content: input.result.assistantText,
				metadata: {
					runtime: options.name,
					surface: 'live-assistant-output'
				},
				sessionId: input.session.id,
				stage: 'assistant-output',
				turnId: input.turn.id
			});
			if (!decision.allowed) {
				return blockResult({
					...input,
					decision,
					stage: 'assistant-output'
				});
			}
			if (
				typeof decision.redactedContent === 'string' &&
				decision.redactedContent !== input.result.assistantText
			) {
				return {
					...input.result,
					assistantText: decision.redactedContent
				};
			}

			return undefined;
		}
	};

	const wrapTool = <TArgs extends Record<string, unknown>, TToolResult>(
		tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TResult>
	): VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TResult> => ({
		...tool,
		execute: async (input) => {
			const inputDecision = await evaluate({
				content: JSON.stringify({
					args: input.args,
					toolName: tool.name
				}),
				metadata: {
					runtime: options.name,
					surface: 'live-tool-input',
					toolName: tool.name
				},
				sessionId: input.session.id,
				stage: 'tool-input',
				turnId: input.turn.id
			});
			if (!inputDecision.allowed) {
				throw new Error(`Guardrail blocked tool input for ${tool.name}.`);
			}

			const result = await tool.execute(input);
			const outputDecision = await evaluate({
				content: JSON.stringify({
					result,
					toolName: tool.name
				}),
				metadata: {
					runtime: options.name,
					surface: 'live-tool-output',
					toolName: tool.name
				},
				sessionId: input.session.id,
				stage: 'tool-output',
				turnId: input.turn.id
			});
			if (!outputDecision.allowed) {
				throw new Error(`Guardrail blocked tool output for ${tool.name}.`);
			}

			return result;
		}
	});

	return {
		assistantGuardrails,
		evaluate,
		wrapTool,
		wrapTools: (tools) => tools.map((tool) => wrapTool(tool))
	};
};

export const voiceGuardrailPolicyPresets = {
	supportSafeDefaults: createVoiceGuardrailPolicy({
		id: 'support-safe-defaults',
		label: 'Support safe defaults',
		rules: [
			{
				description:
					'Blocks final legal, medical, or financial advice claims that should route to a human or qualified professional.',
				id: 'regulated-advice',
				label: 'Regulated advice',
				match:
					/\b(legal advice|medical advice|financial advice|diagnose|prescribe|guaranteed refund|guaranteed approval)\b/i,
				stages: ['assistant-output']
			},
			{
				description:
					'Warns when payment-card-like data appears in transcripts or tool payloads.',
				action: 'warn',
				id: 'payment-card-like-data',
				label: 'Payment card-like data',
				match: /\b(?:\d[ -]*?){13,19}\b/,
				redactWith: '[redacted-card]',
				stages: ['transcript', 'tool-input', 'tool-output']
			}
		]
	})
};

export const renderVoiceGuardrailMarkdown = (
	report: VoiceGuardrailReport
) => {
	const lines = [
		'# Voice Guardrail Report',
		'',
		`Status: ${report.status}`,
		`Checked: ${new Date(report.checkedAt).toISOString()}`,
		`Decisions: ${report.total}`,
		`Blocked: ${report.summary.blocked}`,
		`Warned: ${report.summary.warned}`,
		'',
		'## Decisions',
		...(report.decisions.length > 0
			? report.decisions.map(
					(decision) =>
						`- ${decision.status}: ${decision.stage}${decision.sessionId ? ` session=${decision.sessionId}` : ''} findings=${decision.findings.length}`
				)
			: ['- none'])
	];

	return `${lines.join('\n')}\n`;
};

const isGuardrailReport = (
	value: VoiceGuardrailDecision | VoiceGuardrailReport
): value is VoiceGuardrailReport => 'decisions' in value && 'summary' in value;

const normalizeGuardrailRouteInput = async (request: Request) => {
	if (request.method === 'POST') {
		return (await request.json().catch(() => ({}))) as VoiceGuardrailEvaluationInput;
	}
	const url = new URL(request.url);
	return {
		content: url.searchParams.get('content') ?? '',
		sessionId: url.searchParams.get('sessionId') ?? undefined,
		stage:
			(url.searchParams.get('stage') as VoiceGuardrailStage | null) ??
			'assistant-output',
		turnId: url.searchParams.get('turnId') ?? undefined
	};
};

const resolveGuardrailReport = async (
	options: VoiceGuardrailRoutesOptions,
	input: VoiceGuardrailEvaluationInput
) => {
	if (options.source !== undefined) {
		const value =
			typeof options.source === 'function'
				? await options.source(input)
				: options.source;
		return isGuardrailReport(value)
			? value
			: buildVoiceGuardrailReport({ decisions: [value] });
	}

	const decisions = await Promise.all(
		(options.policies ?? []).map((policy) =>
			evaluateVoiceGuardrailPolicy(policy, input)
		)
	);
	return buildVoiceGuardrailReport({
		decisions,
		policies: options.policies
	});
};

export const createVoiceGuardrailRoutes = (
	options: VoiceGuardrailRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice/guardrails';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-guardrails'
	});

	routes.all(path, async ({ request }) => {
		const input = await normalizeGuardrailRouteInput(request);
		const report = await resolveGuardrailReport(options, input);

		if (options.trace) {
			await Promise.all(
				report.decisions.map((decision) =>
					options.trace!.append({
						at: decision.checkedAt,
						payload: {
							allowed: decision.allowed,
							findings: decision.findings,
							stage: decision.stage,
							status: decision.status
						},
						sessionId: decision.sessionId ?? 'guardrail-check',
						turnId: decision.turnId,
						type: 'assistant.guardrail'
					})
				)
			);
		}

		return Response.json(report, { headers: options.headers });
	});

	routes.all(`${path}.md`, async ({ request }) => {
		const input = await normalizeGuardrailRouteInput(request);
		const report = await resolveGuardrailReport(options, input);
		return new Response(renderVoiceGuardrailMarkdown(report), {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				...options.headers
			}
		});
	});

	return routes;
};
