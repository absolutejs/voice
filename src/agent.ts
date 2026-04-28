import type {
	VoiceOnTurnObjectHandler,
	VoiceRouteResult,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';
import type { VoiceTraceEventStore } from './trace';
import type { VoiceToolRuntime } from './toolRuntime';
import {
	createVoiceAuditLogger,
	type VoiceAuditEventStore,
	type VoiceAuditLogger,
	type VoiceAuditOutcome
} from './audit';

export type VoiceAgentMessageRole = 'assistant' | 'system' | 'tool' | 'user';

export type VoiceAgentMessage = {
	content: string;
	metadata?: Record<string, unknown>;
	name?: string;
	role: VoiceAgentMessageRole;
	toolCallId?: string;
};

export type VoiceAgentToolCall<TArgs = Record<string, unknown>> = {
	args: TArgs;
	id?: string;
	name: string;
};

export type VoiceAgentToolResult<TResult = unknown> = {
	content?: string;
	error?: string;
	metadata?: Record<string, unknown>;
	result?: TResult;
	status: 'error' | 'ok';
	toolCallId?: string;
	toolName: string;
};

export type VoiceAgentTool<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
> = {
	description?: string;
	execute: (input: {
		api: VoiceSessionHandle<TContext, TSession, TRouteResult>;
		args: TArgs;
		context: TContext;
		session: TSession;
		turn: VoiceTurnRecord;
	}) => Promise<TToolResult> | TToolResult;
	name: string;
	parameters?: Record<string, unknown>;
	resultToMessage?: (result: TToolResult) => string;
};

export type VoiceAgentModelInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = {
	agentId: string;
	context: TContext;
	messages: VoiceAgentMessage[];
	session: TSession;
	system?: string;
	tools: Array<{
		description?: string;
		name: string;
		parameters?: Record<string, unknown>;
	}>;
	turn: VoiceTurnRecord;
};

export type VoiceAgentModelOutput<TResult = unknown> =
	VoiceRouteResult<TResult> & {
		handoff?: {
			metadata?: Record<string, unknown>;
			reason?: string;
			targetAgentId: string;
		};
		toolCalls?: VoiceAgentToolCall[];
	};

export type VoiceAgentModel<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	generate: (
		input: VoiceAgentModelInput<TContext, TSession>
	) =>
		| Promise<VoiceAgentModelOutput<TResult>>
		| VoiceAgentModelOutput<TResult>;
};

export type VoiceAgentRunResult<TResult = unknown> = VoiceRouteResult<TResult> & {
	agentId: string;
	handoff?: VoiceAgentModelOutput<TResult>['handoff'];
	messages: VoiceAgentMessage[];
	toolResults: VoiceAgentToolResult[];
};

export type VoiceAgentSquadHandoffPolicyResult<TResult = unknown> = {
	allow?: boolean;
	escalate?: VoiceRouteResult<TResult>['escalate'];
	metadata?: Record<string, unknown>;
	reason?: string;
	summary?: string;
	targetAgentId?: string;
};

export type VoiceAgent<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	id: string;
	onTurn: VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
	run: (input: {
		api: VoiceSessionHandle<TContext, TSession, TResult>;
		context: TContext;
		messages?: VoiceAgentMessage[];
		session: TSession;
		turn: VoiceTurnRecord;
	}) => Promise<VoiceAgentRunResult<TResult>>;
};

export type VoiceAgentOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	audit?: VoiceAuditEventStore | VoiceAuditLogger;
	auditModel?: string;
	auditProvider?: string;
	id: string;
	maxToolRounds?: number;
	model: VoiceAgentModel<TContext, TSession, TResult>;
	system?: string | ((input: {
		context: TContext;
		session: TSession;
		turn: VoiceTurnRecord;
	}) => Promise<string | undefined> | string | undefined);
	trace?: VoiceTraceEventStore;
	toolRuntime?: VoiceToolRuntime<TContext, TSession, TResult>;
	tools?: Array<VoiceAgentTool<TContext, TSession, Record<string, unknown>, unknown, TResult>>;
};

export type VoiceAgentSquadOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	audit?: VoiceAuditEventStore | VoiceAuditLogger;
	agents: Array<VoiceAgent<TContext, TSession, TResult>>;
	defaultAgentId: string;
	handoffPolicy?: (input: {
		context: TContext;
		fromAgentId: string;
		handoff: NonNullable<VoiceAgentModelOutput<TResult>['handoff']>;
		messages: VoiceAgentMessage[];
		session: TSession;
		targetAgent?: VoiceAgent<TContext, TSession, TResult>;
		turn: VoiceTurnRecord;
	}) =>
		| Promise<VoiceAgentSquadHandoffPolicyResult<TResult> | void>
		| VoiceAgentSquadHandoffPolicyResult<TResult>
		| void;
	id: string;
	maxHandoffsPerTurn?: number;
	onHandoff?: (input: {
		context: TContext;
		fromAgentId: string;
		reason?: string;
		session: TSession;
		targetAgentId: string;
		turn: VoiceTurnRecord;
	}) => Promise<void> | void;
	trace?: VoiceTraceEventStore;
	selectAgent?: (input: {
		context: TContext;
		session: TSession;
		turn: VoiceTurnRecord;
	}) => Promise<string | undefined> | string | undefined;
};

const normalizeText = (value: unknown) =>
	typeof value === 'string' ? value.trim() : '';

const toErrorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const createHistoryMessages = <TResult>(
	session: VoiceSessionRecord<Record<string, never>, TResult>,
	turn: VoiceTurnRecord
): VoiceAgentMessage[] => {
	const messages: VoiceAgentMessage[] = [];
	for (const previousTurn of session.turns) {
		if (previousTurn.id === turn.id) {
			continue;
		}

		if (previousTurn.text.trim()) {
			messages.push({
				content: previousTurn.text,
				role: 'user'
			});
		}

		if (previousTurn.assistantText?.trim()) {
			messages.push({
				content: previousTurn.assistantText,
				role: 'assistant'
			});
		}
	}

	messages.push({
		content: turn.text,
		role: 'user'
	});

	return messages;
};

const formatToolResult = (result: unknown): string => {
	if (typeof result === 'string') {
		return result;
	}

	if (result === undefined) {
		return '';
	}

	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
};

const appendVoiceAgentTrace = async (input: {
	agentId: string;
	event: Record<string, unknown>;
	session: VoiceSessionRecord;
	trace?: VoiceTraceEventStore;
	turn: VoiceTurnRecord;
	type: 'agent.handoff' | 'agent.model' | 'agent.result' | 'agent.tool';
}) => {
	await input.trace?.append({
		at: Date.now(),
		payload: {
			agentId: input.agentId,
			...input.event
		},
		scenarioId: input.session.scenarioId,
		sessionId: input.session.id,
		turnId: input.turn.id,
		type: input.type
	});
};

const resolveVoiceAgentAuditLogger = (
	audit: VoiceAuditEventStore | VoiceAuditLogger | undefined
) => {
	if (!audit) {
		return undefined;
	}

	return 'append' in audit ? createVoiceAuditLogger(audit) : audit;
};

const toAuditOutcome = (status: string): VoiceAuditOutcome =>
	status === 'allowed' ? 'success' : status === 'blocked' ? 'skipped' : 'error';

export const createVoiceAgentTool = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
>(
	tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult>
): VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult> => tool;

export const createVoiceAgent = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAgentOptions<TContext, TSession, TResult>
): VoiceAgent<TContext, TSession, TResult> => {
	const toolMap = new Map(options.tools?.map((tool) => [tool.name, tool]) ?? []);
	const maxToolRounds = Math.max(0, options.maxToolRounds ?? 2);
	const audit = resolveVoiceAgentAuditLogger(options.audit);

	const run: VoiceAgent<TContext, TSession, TResult>['run'] = async (input) => {
		const messages =
			input.messages ?? createHistoryMessages(input.session, input.turn);
		const toolResults: VoiceAgentToolResult[] = [];
		const system =
			typeof options.system === 'function'
				? await options.system({
						context: input.context,
						session: input.session,
						turn: input.turn
					})
				: options.system;
		let output: VoiceAgentModelOutput<TResult> = {};

		for (let round = 0; round <= maxToolRounds; round += 1) {
			const modelStartedAt = Date.now();
			try {
				output = await options.model.generate({
					agentId: options.id,
					context: input.context,
					messages,
					session: input.session,
					system,
					tools: [...toolMap.values()].map((tool) => ({
						description: tool.description,
						name: tool.name,
						parameters: tool.parameters
					})),
					turn: input.turn
				});
				await audit?.providerCall({
					actor: {
						id: options.id,
						kind: 'agent'
					},
					elapsedMs: Date.now() - modelStartedAt,
					kind: 'llm',
					model: options.auditModel,
					outcome: 'success',
					provider: options.auditProvider ?? options.id,
					sessionId: input.session.id
				});
			} catch (error) {
				await audit?.providerCall({
					actor: {
						id: options.id,
						kind: 'agent'
					},
					elapsedMs: Date.now() - modelStartedAt,
					error: toErrorMessage(error),
					kind: 'llm',
					model: options.auditModel,
					outcome: 'error',
					provider: options.auditProvider ?? options.id,
					sessionId: input.session.id
				});
				throw error;
			}
			await appendVoiceAgentTrace({
				agentId: options.id,
				event: {
					elapsedMs: Date.now() - modelStartedAt,
					messageCount: messages.length,
					round,
					toolCallCount: output.toolCalls?.length ?? 0
				},
				session: input.session,
				trace: options.trace,
				turn: input.turn,
				type: 'agent.model'
			});

			if (output.assistantText?.trim()) {
				messages.push({
					content: output.assistantText,
					metadata: output.toolCalls?.length
						? {
								toolCalls: output.toolCalls
							}
						: undefined,
					role: 'assistant'
				});
			} else if (output.toolCalls?.length) {
				messages.push({
					content: '',
					metadata: {
						toolCalls: output.toolCalls
					},
					role: 'assistant'
				});
			}

			if (!output.toolCalls?.length || round === maxToolRounds) {
				break;
			}

			for (const toolCall of output.toolCalls) {
				const tool = toolMap.get(toolCall.name);
				if (!tool) {
					const missingResult: VoiceAgentToolResult = {
						error: `Unknown voice agent tool: ${toolCall.name}`,
						status: 'error',
						toolCallId: toolCall.id,
						toolName: toolCall.name
					};
					toolResults.push(missingResult);
					await appendVoiceAgentTrace({
						agentId: options.id,
						event: {
							error: missingResult.error,
							status: 'error',
							toolCallId: toolCall.id,
							toolName: toolCall.name
						},
						session: input.session,
						trace: options.trace,
						turn: input.turn,
						type: 'agent.tool'
					});
					await audit?.toolCall({
						actor: {
							id: options.id,
							kind: 'agent'
						},
						error: missingResult.error,
						outcome: 'error',
						sessionId: input.session.id,
						toolCallId: toolCall.id,
						toolName: toolCall.name
					});
					messages.push({
						content: missingResult.error ?? '',
						name: toolCall.name,
						role: 'tool',
						toolCallId: toolCall.id
					});
					continue;
				}

				try {
					const toolStartedAt = Date.now();
					const runtimeResult = options.toolRuntime
						? await options.toolRuntime.execute({
								api: input.api,
								args: toolCall.args,
								context: input.context,
								session: input.session,
								tool,
								toolCallId: toolCall.id,
								turn: input.turn
							})
						: undefined;
					if (runtimeResult?.status === 'error') {
						throw new Error(runtimeResult.error);
					}
					const result =
						runtimeResult?.result ??
						(await tool.execute({
							api: input.api,
							args: toolCall.args,
							context: input.context,
							session: input.session,
							turn: input.turn
						}));
					const content =
						runtimeResult?.content ??
						tool.resultToMessage?.(result) ??
						formatToolResult(result);
					toolResults.push({
						content,
						metadata: runtimeResult
							? {
									attempts: runtimeResult.attempts,
									elapsedMs: runtimeResult.elapsedMs,
									idempotencyKey: runtimeResult.idempotencyKey,
									timedOut: runtimeResult.timedOut
								}
							: undefined,
						result,
						status: 'ok',
						toolCallId: toolCall.id,
						toolName: tool.name
					});
					await appendVoiceAgentTrace({
						agentId: options.id,
						event: {
							elapsedMs: Date.now() - toolStartedAt,
							runtimeElapsedMs: runtimeResult?.elapsedMs,
							attempts: runtimeResult?.attempts,
							idempotencyKey: runtimeResult?.idempotencyKey,
							status: 'ok',
							timedOut: runtimeResult?.timedOut,
							toolCallId: toolCall.id,
							toolName: tool.name
						},
						session: input.session,
						trace: options.trace,
						turn: input.turn,
						type: 'agent.tool'
					});
					await audit?.toolCall({
						actor: {
							id: options.id,
							kind: 'agent'
						},
						elapsedMs: Date.now() - toolStartedAt,
						metadata: runtimeResult
							? {
									attempts: runtimeResult.attempts,
									idempotencyKey: runtimeResult.idempotencyKey,
									timedOut: runtimeResult.timedOut
								}
							: undefined,
						outcome: 'success',
						sessionId: input.session.id,
						toolCallId: toolCall.id,
						toolName: tool.name
					});
					messages.push({
						content,
						name: tool.name,
						role: 'tool',
						toolCallId: toolCall.id
					});
				} catch (error) {
					const errorMessage = toErrorMessage(error);
					toolResults.push({
						error: errorMessage,
						status: 'error',
						toolCallId: toolCall.id,
						toolName: tool.name
					});
					await appendVoiceAgentTrace({
						agentId: options.id,
						event: {
							error: errorMessage,
							status: 'error',
							toolCallId: toolCall.id,
							toolName: tool.name
						},
						session: input.session,
						trace: options.trace,
						turn: input.turn,
						type: 'agent.tool'
					});
					await audit?.toolCall({
						actor: {
							id: options.id,
							kind: 'agent'
						},
						error: errorMessage,
						outcome: 'error',
						sessionId: input.session.id,
						toolCallId: toolCall.id,
						toolName: tool.name
					});
					messages.push({
						content: errorMessage,
						name: tool.name,
						role: 'tool',
						toolCallId: toolCall.id
					});
				}
			}
		}

		await appendVoiceAgentTrace({
			agentId: options.id,
			event: {
				complete: output.complete,
				escalated: Boolean(output.escalate),
				handoffTarget: output.handoff?.targetAgentId,
				hasAssistantText: Boolean(output.assistantText?.trim()),
				noAnswer: Boolean(output.noAnswer),
				transferred: Boolean(output.transfer),
				voicemail: Boolean(output.voicemail)
			},
			session: input.session,
			trace: options.trace,
			turn: input.turn,
			type: 'agent.result'
		});

		return {
			agentId: options.id,
			assistantText: output.assistantText,
			complete: output.complete,
			escalate: output.escalate,
			handoff: output.handoff,
			messages,
			noAnswer: output.noAnswer,
			result: output.result,
			toolResults,
			transfer: output.transfer,
			voicemail: output.voicemail
		};
	};

	return {
		id: options.id,
		onTurn: async (input) => run(input),
		run
	};
};

export const createVoiceAgentSquad = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAgentSquadOptions<TContext, TSession, TResult>
): VoiceAgent<TContext, TSession, TResult> => {
	const agents = new Map(options.agents.map((agent) => [agent.id, agent]));
	const defaultAgent = agents.get(options.defaultAgentId);
	const audit = resolveVoiceAgentAuditLogger(options.audit);
	if (!defaultAgent) {
		throw new Error(
			`createVoiceAgentSquad defaultAgentId not found: ${options.defaultAgentId}`
		);
	}

	const run: VoiceAgent<TContext, TSession, TResult>['run'] = async (input) => {
		let agentId =
			normalizeText(
				await options.selectAgent?.({
					context: input.context,
					session: input.session,
					turn: input.turn
				})
			) || options.defaultAgentId;
		let agent = agents.get(agentId) ?? defaultAgent;
		const messages = input.messages ?? createHistoryMessages(input.session, input.turn);
		const toolResults: VoiceAgentToolResult[] = [];
		const maxHandoffs = Math.max(0, options.maxHandoffsPerTurn ?? 2);
		let result = await agent.run({
			...input,
			messages
		});

		toolResults.push(...result.toolResults);

		for (let handoffCount = 0; result.handoff && handoffCount < maxHandoffs; handoffCount += 1) {
			const originalTargetAgentId = result.handoff.targetAgentId;
			const policy = await options.handoffPolicy?.({
				context: input.context,
				fromAgentId: agent.id,
				handoff: result.handoff,
				messages,
				session: input.session,
				targetAgent: agents.get(originalTargetAgentId),
				turn: input.turn
			});
			const targetAgentId =
				normalizeText(policy?.targetAgentId) || originalTargetAgentId;
			const nextAgent = agents.get(targetAgentId);
			const handoffReason =
				policy?.summary ?? policy?.reason ?? result.handoff.reason;
			const handoffMetadata = {
				...result.handoff.metadata,
				...policy?.metadata
			};
			const metadata =
				Object.keys(handoffMetadata).length > 0 ? handoffMetadata : undefined;

			if (policy?.allow === false) {
				await appendVoiceAgentTrace({
					agentId: options.id,
					event: {
						fromAgentId: agent.id,
						metadata,
						originalTargetAgentId,
						reason: handoffReason,
						status: 'blocked',
						targetAgentId
					},
					session: input.session,
					trace: options.trace,
					turn: input.turn,
					type: 'agent.handoff'
				});
				await audit?.handoff({
					actor: {
						id: options.id,
						kind: 'agent'
					},
					fromAgentId: agent.id,
					metadata,
					outcome: 'skipped',
					reason: handoffReason,
					sessionId: input.session.id,
					toAgentId: targetAgentId
				});
				return {
					...result,
					escalate: result.escalate ??
						policy.escalate ?? {
							metadata,
							reason: handoffReason ?? `Blocked handoff to ${targetAgentId}`
						},
					handoff: undefined,
					toolResults
				};
			}

			if (!nextAgent) {
				await appendVoiceAgentTrace({
					agentId: options.id,
					event: {
						fromAgentId: agent.id,
						metadata,
						originalTargetAgentId,
						reason: handoffReason,
						status: 'unknown-target',
						targetAgentId
					},
					session: input.session,
					trace: options.trace,
					turn: input.turn,
					type: 'agent.handoff'
				});
				await audit?.handoff({
					actor: {
						id: options.id,
						kind: 'agent'
					},
					fromAgentId: agent.id,
					metadata,
					outcome: 'error',
					reason: handoffReason,
					sessionId: input.session.id,
					toAgentId: targetAgentId
				});
				return {
					...result,
					escalate: result.escalate ?? {
						metadata,
						reason: `Unknown handoff target: ${targetAgentId}`
					},
					handoff: undefined,
					toolResults
				};
			}

			await options.onHandoff?.({
				context: input.context,
				fromAgentId: agent.id,
				reason: handoffReason,
				session: input.session,
				targetAgentId: nextAgent.id,
				turn: input.turn
			});
			await appendVoiceAgentTrace({
				agentId: options.id,
				event: {
					fromAgentId: agent.id,
					metadata,
					originalTargetAgentId:
						originalTargetAgentId === nextAgent.id
							? undefined
							: originalTargetAgentId,
					reason: handoffReason,
					status: 'allowed',
					targetAgentId: nextAgent.id
				},
				session: input.session,
				trace: options.trace,
				turn: input.turn,
				type: 'agent.handoff'
			});
			await audit?.handoff({
				actor: {
					id: options.id,
					kind: 'agent'
				},
				fromAgentId: agent.id,
				metadata,
				outcome: toAuditOutcome('allowed'),
				reason: handoffReason,
				sessionId: input.session.id,
				toAgentId: nextAgent.id
			});
			messages.push({
				content: handoffReason ?? `Handoff to ${nextAgent.id}`,
				metadata,
				name: nextAgent.id,
				role: 'system'
			});
			agent = nextAgent;
			agentId = nextAgent.id;
			result = await agent.run({
				...input,
				messages
			});
			toolResults.push(...result.toolResults);
		}

		if (result.handoff) {
			await appendVoiceAgentTrace({
				agentId: options.id,
				event: {
					fromAgentId: agent.id,
					metadata: result.handoff.metadata,
					reason: result.handoff.reason,
					status: 'max-exceeded',
					targetAgentId: result.handoff.targetAgentId
				},
				session: input.session,
				trace: options.trace,
				turn: input.turn,
				type: 'agent.handoff'
			});
			await audit?.handoff({
				actor: {
					id: options.id,
					kind: 'agent'
				},
				fromAgentId: agent.id,
				metadata: result.handoff.metadata,
				outcome: 'error',
				reason: result.handoff.reason,
				sessionId: input.session.id,
				toAgentId: result.handoff.targetAgentId
			});
			return {
				...result,
				escalate: result.escalate ?? {
					metadata: result.handoff.metadata,
					reason: `Max handoffs exceeded: ${maxHandoffs}`
				},
				handoff: undefined,
				toolResults
			};
		}

		return {
			...result,
			agentId,
			toolResults
		};
	};

	return {
		id: options.id,
		onTurn: async (input) => run(input),
		run
	};
};
