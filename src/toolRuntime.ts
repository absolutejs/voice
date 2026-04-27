import type {
	VoiceAgentTool,
	VoiceAgentToolResult,
	VoiceAgentToolCall
} from './agent';
import type {
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';
import type { VoiceTraceEventStore } from './trace';

export type VoiceToolRetryDelay =
	| number
	| ((input: { attempt: number; error: unknown; toolName: string }) => number);

export type VoiceToolRuntimeOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TRouteResult = unknown
> = {
	idempotencyKey?: (input: {
		args: unknown;
		context: TContext;
		session: TSession;
		toolCallId?: string;
		toolName: string;
		turn: VoiceTurnRecord;
	}) => string | undefined;
	idempotencyTtlMs?: number;
	maxRetries?: number;
	retryDelayMs?: VoiceToolRetryDelay;
	timeoutMs?: number;
	trace?: VoiceTraceEventStore;
};

export type VoiceToolRuntimeExecuteInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TArgs = Record<string, unknown>,
	TToolResult = unknown,
	TRouteResult = unknown
> = {
	api: VoiceSessionHandle<TContext, TSession, TRouteResult>;
	args: TArgs;
	context: TContext;
	session: TSession;
	tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult>;
	toolCallId?: string;
	turn: VoiceTurnRecord;
};

export type VoiceToolRuntimeResult<TToolResult = unknown> =
	VoiceAgentToolResult<TToolResult> & {
		attempts: number;
		elapsedMs: number;
		idempotencyKey?: string;
		timedOut: boolean;
	};

export type VoiceToolRuntime<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TRouteResult = unknown
> = {
	execute: <TArgs = Record<string, unknown>, TToolResult = unknown>(
		input: VoiceToolRuntimeExecuteInput<
			TContext,
			TSession,
			TArgs,
			TToolResult,
			TRouteResult
		>
	) => Promise<VoiceToolRuntimeResult<TToolResult>>;
	wrapTool: <TArgs = Record<string, unknown>, TToolResult = unknown>(
		tool: VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult>
	) => VoiceAgentTool<TContext, TSession, TArgs, TToolResult, TRouteResult>;
};

const toErrorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

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

const withTimeout = async <TResult>(
	promise: Promise<TResult>,
	timeoutMs: number | undefined
) => {
	if (!timeoutMs || timeoutMs <= 0) {
		return promise;
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<TResult>((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error(`Voice tool timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			})
		]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
};

const resolveRetryDelay = (
	retryDelayMs: VoiceToolRetryDelay | undefined,
	input: { attempt: number; error: unknown; toolName: string }
) =>
	typeof retryDelayMs === 'function'
		? retryDelayMs(input)
		: (retryDelayMs ?? 0);

export const createVoiceToolRuntime = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TRouteResult = unknown
>(
	options: VoiceToolRuntimeOptions<TContext, TSession, TRouteResult> = {}
): VoiceToolRuntime<TContext, TSession, TRouteResult> => {
	const inFlight = new Map<string, Promise<VoiceToolRuntimeResult<unknown>>>();
	const completed = new Map<
		string,
		{ expiresAt: number; result: VoiceToolRuntimeResult<unknown> }
	>();

	const execute: VoiceToolRuntime<TContext, TSession, TRouteResult>['execute'] =
		async (input) => {
			const idempotencyKey = options.idempotencyKey?.({
				args: input.args,
				context: input.context,
				session: input.session,
				toolCallId: input.toolCallId,
				toolName: input.tool.name,
				turn: input.turn
			});

			if (idempotencyKey) {
				const cached = completed.get(idempotencyKey);
				if (cached && cached.expiresAt > Date.now()) {
					return cached.result as VoiceToolRuntimeResult<never>;
				}
				if (cached) {
					completed.delete(idempotencyKey);
				}
				const existing = inFlight.get(idempotencyKey);
				if (existing) {
					return (await existing) as VoiceToolRuntimeResult<never>;
				}
			}

			const runPromise = (async () => {
				const startedAt = Date.now();
				const maxRetries = Math.max(0, options.maxRetries ?? 0);
				let attempts = 0;
				let lastError: unknown;
				let timedOut = false;

				for (let retry = 0; retry <= maxRetries; retry += 1) {
					attempts = retry + 1;
					try {
						const result = await withTimeout(
							Promise.resolve(
								input.tool.execute({
									api: input.api,
									args: input.args,
									context: input.context,
									session: input.session,
									turn: input.turn
								})
							),
							options.timeoutMs
						);
						const elapsedMs = Date.now() - startedAt;
						const content =
							input.tool.resultToMessage?.(result) ?? formatToolResult(result);
						const runtimeResult: VoiceToolRuntimeResult<typeof result> = {
							attempts,
							content,
							elapsedMs,
							idempotencyKey,
							result,
							status: 'ok',
							timedOut,
							toolCallId: input.toolCallId,
							toolName: input.tool.name
						};
						await options.trace?.append({
							at: Date.now(),
							payload: {
								attempts,
								elapsedMs,
								idempotencyKey,
								status: 'ok',
								toolCallId: input.toolCallId,
								toolName: input.tool.name
							},
							scenarioId: input.session.scenarioId,
							sessionId: input.session.id,
							turnId: input.turn.id,
							type: 'agent.tool'
						});
						return runtimeResult;
					} catch (error) {
						lastError = error;
						timedOut ||= toErrorMessage(error).includes('timed out');
						if (retry < maxRetries) {
							const delay = resolveRetryDelay(options.retryDelayMs, {
								attempt: attempts,
								error,
								toolName: input.tool.name
							});
							if (delay > 0) {
								await sleep(delay);
							}
						}
					}
				}

				const elapsedMs = Date.now() - startedAt;
				const runtimeResult: VoiceToolRuntimeResult = {
					attempts,
					elapsedMs,
					error: toErrorMessage(lastError),
					idempotencyKey,
					status: 'error',
					timedOut,
					toolCallId: input.toolCallId,
					toolName: input.tool.name
				};
				await options.trace?.append({
					at: Date.now(),
					payload: {
						attempts,
						elapsedMs,
						error: runtimeResult.error,
						idempotencyKey,
						status: 'error',
						timedOut,
						toolCallId: input.toolCallId,
						toolName: input.tool.name
					},
					scenarioId: input.session.scenarioId,
					sessionId: input.session.id,
					turnId: input.turn.id,
					type: 'agent.tool'
				});
				return runtimeResult;
			})();

			if (idempotencyKey) {
				inFlight.set(idempotencyKey, runPromise);
				runPromise.then((result) => {
					if (options.idempotencyTtlMs && options.idempotencyTtlMs > 0) {
						completed.set(idempotencyKey, {
							expiresAt: Date.now() + options.idempotencyTtlMs,
							result
						});
					}
				}).finally(() => {
					inFlight.delete(idempotencyKey);
				});
			}

			return (await runPromise) as VoiceToolRuntimeResult<never>;
		};

	return {
		execute,
		wrapTool: (tool) => ({
			...tool,
			execute: async (input) => {
				const result = await execute({
					...input,
					tool
				});
				if (result.status === 'error') {
					throw new Error(result.error);
				}
				return result.result as never;
			}
		})
	};
};

export const createVoiceToolIdempotencyKey = (input: {
	args: unknown;
	sessionId: string;
	toolCallId?: string;
	toolName: string;
	turnId: string;
}) => {
	const args =
		typeof input.args === 'string'
			? input.args
			: JSON.stringify(input.args ?? null);
	return [
		input.sessionId,
		input.turnId,
		input.toolCallId ?? 'no-call-id',
		input.toolName,
		args
	].join(':');
};
