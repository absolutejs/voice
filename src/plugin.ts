import { resolveAudioConditioningConfig } from './audioConditioning';
import { Elysia } from 'elysia';
import { resolve } from 'node:path';
import {
	buildVoiceHTMXResponse,
	resolveVoiceHTMXRenderers,
	resolveVoiceHTMXTargets
} from './htmx';
import { resolveLogger } from './logger';
import { resolveVoiceRuntimePreset } from './presets';
import { recordVoiceRuntimeOps } from './runtimeOps';
import { createId } from './store';
import { createVoiceSession } from './session';
import { resolveTurnDetectionConfig } from './turnProfiles';
import type {
	AudioChunk,
	VoiceClientMessage,
	VoiceLexiconEntry,
	VoiceOnTurnObjectHandler,
	VoicePhraseHint,
	VoiceResolvedSTTFallbackConfig,
	VoicePluginConfig,
	VoiceRouteResult,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';

type VoiceRuntime = {
	activeSessions: Map<
		string,
		VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>
	>;
	logger: ReturnType<typeof resolveLogger>;
	socketSessions: WeakMap<
		object,
		{
			scenarioId: string | null;
			sessionId: string;
		}
	>;
};

const resolveQueryScenario = (query: Record<string, unknown> | undefined) => {
	if (
		typeof query?.scenarioId === 'string' &&
		query.scenarioId.trim()
	) {
		return query.scenarioId.trim();
	}

	if (
		typeof query?.mode === 'string' &&
		query.mode.trim()
	) {
		return query.mode.trim();
	}

	return null;
};

const HTMX_BOOTSTRAP_DIST_CANDIDATES = [
	resolve(import.meta.dir, 'client', 'htmxBootstrap.js'),
	resolve(import.meta.dir, '..', 'dist', 'client', 'htmxBootstrap.js')
];

const HTMX_BOOTSTRAP_SOURCE_CANDIDATES = [
	resolve(import.meta.dir, 'client', 'htmxBootstrap.ts'),
	resolve(import.meta.dir, '..', 'src', 'client', 'htmxBootstrap.ts')
];

const loadHTMXBootstrap = (() => {
	let cached: Promise<string> | null = null;

	return () => {
		if (cached) {
			return cached;
		}

		cached = (async () => {
			for (const candidate of HTMX_BOOTSTRAP_DIST_CANDIDATES) {
				const asset = Bun.file(candidate);
				if (await asset.exists()) {
					return await asset.text();
				}
			}

			for (const candidate of HTMX_BOOTSTRAP_SOURCE_CANDIDATES) {
				const asset = Bun.file(candidate);
				if (!(await asset.exists())) {
					continue;
				}

				const build = await Bun.build({
					entrypoints: [candidate],
					format: 'esm',
					minify: true,
					target: 'browser'
				});

				if (!build.success || build.outputs.length === 0) {
					const log = build.logs.map((entry) => entry.message).join('\n');
					throw new Error(
						`Failed to build the voice HTMX bootstrap bundle.${log ? `\n${log}` : ''}`
					);
				}

				return await build.outputs[0]!.text();
			}

			throw new Error('Unable to locate the voice HTMX bootstrap client.');
		})();

		return cached;
	};
})();

const isArrayBufferView = (value: unknown): value is ArrayBufferView =>
	typeof value === 'object' &&
	value !== null &&
	ArrayBuffer.isView(value);

const resolveSTTFallbackConfig = (
	config?: VoicePluginConfig['sttFallback']
): VoiceResolvedSTTFallbackConfig | undefined => {
	if (!config) {
		return undefined;
	}

	return {
		adapter: config.adapter,
		completionTimeoutMs: config.completionTimeoutMs ?? 2_500,
		confidenceThreshold: config.confidenceThreshold ?? 0.6,
		maxAttemptsPerTurn: config.maxAttemptsPerTurn ?? 1,
		minTextLength: config.minTextLength ?? 2,
		replayWindowMs: config.replayWindowMs ?? 8_000,
		settleMs: config.settleMs ?? 220,
		trigger: config.trigger ?? 'empty-or-low-confidence'
	};
};

const isVoiceClientMessage = (value: unknown): value is VoiceClientMessage => {
	if (!value || typeof value !== 'object' || !('type' in value)) {
		return false;
	}

	switch (value.type) {
		case 'call_control':
			if (!('action' in value)) {
				return false;
			}

			if (
				value.action !== 'complete' &&
				value.action !== 'escalate' &&
				value.action !== 'no-answer' &&
				value.action !== 'transfer' &&
				value.action !== 'voicemail'
			) {
				return false;
			}

			return (
				(!('metadata' in value) ||
					value.metadata === undefined ||
					(value.metadata !== null && typeof value.metadata === 'object')) &&
				(!('reason' in value) ||
					value.reason === undefined ||
					typeof value.reason === 'string') &&
				(!('target' in value) ||
					value.target === undefined ||
					typeof value.target === 'string')
			);
		case 'close':
			return true;
		case 'end_turn':
			return true;
		case 'ping':
			return true;
	case 'start':
		return (
			(!('sessionId' in value) || typeof value.sessionId === 'string') &&
			(!('scenarioId' in value) || typeof value.scenarioId === 'string')
		);
		default:
			return false;
	}
};

const parseClientMessage = (raw: unknown) => {
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw) as unknown;

			return isVoiceClientMessage(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	if (isVoiceClientMessage(raw)) {
		return raw;
	}

	return null;
};

const resolveSessionId = (runtime: VoiceRuntime, ws: { data?: unknown }) => {
	const query =
		ws.data && typeof ws.data === 'object' && 'query' in ws.data
			? (ws.data.query as Record<string, unknown> | undefined)
			: undefined;
	const existing = runtime.socketSessions.get(ws as object);
	const providedSessionId =
		typeof query?.sessionId === 'string' && query.sessionId.trim()
			? query.sessionId.trim()
			: existing?.sessionId ?? createId();
	const scenarioId =
		resolveQueryScenario(query) ??
		existing?.scenarioId ??
		null;

	const resolved = {
		sessionId: providedSessionId,
		scenarioId
	};

	runtime.socketSessions.set(ws as object, resolved);

	return resolved;
};

const toAudioChunk = (raw: unknown): AudioChunk | null => {
	if (raw instanceof ArrayBuffer) {
		return raw;
	}

	if (isArrayBufferView(raw)) {
		return raw;
	}

	return null;
};

const createSocketAdapter = (ws: {
	close: (code?: number, reason?: string) => void;
	send: (data: string | Uint8Array | ArrayBuffer) => unknown;
}) => ({
	close: async (code?: number, reason?: string) => {
		ws.close(code, reason);
	},
	send: async (data: string | Uint8Array | ArrayBuffer) => {
		ws.send(data);
	}
});

const normalizeOnTurn = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	handler: VoicePluginConfig<TContext, TSession, TResult>['onTurn']
): VoiceOnTurnObjectHandler<TContext, TSession, TResult> => {
	if (handler.length > 1) {
		const directHandler = handler as (
			session: TSession,
			turn: VoiceTurnRecord,
			api: VoiceSessionHandle<TContext, TSession, TResult>,
			context: TContext
		) =>
			| Promise<VoiceRouteResult<TResult> | void>
			| VoiceRouteResult<TResult>
			| void;

		return async ({ context, session, turn, api }) =>
			directHandler(session, turn, api, context);
	}

	return handler as VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
};

const resolveSessionOptions = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	config: VoicePluginConfig<TContext, TSession, TResult>
) => {
	const preset = resolveVoiceRuntimePreset(config.preset);

		return {
	audioConditioning:
				config.audioConditioning !== undefined
					? resolveAudioConditioningConfig(config.audioConditioning)
					: preset.audioConditioning,
		costTelemetry: config.costTelemetry,
		sttFallback: resolveSTTFallbackConfig(config.sttFallback),
		logger: config.logger,
		reconnect: {
			maxAttempts: config.reconnect?.maxAttempts ?? 10,
			strategy: config.reconnect?.strategy ?? 'resume-last-turn',
			timeout: config.reconnect?.timeout ?? 30_000
		},
		sttLifecycle: config.sttLifecycle ?? preset.sttLifecycle,
		turnDetection: resolveTurnDetectionConfig({
			...preset.turnDetection,
			...config.turnDetection
		})
	};
};

const normalizePhraseHints = (hints: VoicePhraseHint[] | void | undefined) =>
	(hints ?? [])
		.map((hint) => ({
			...hint,
			aliases: hint.aliases?.filter(
				(value): value is string =>
					typeof value === 'string' && value.trim().length > 0
			),
			text: hint.text.trim()
		}))
		.filter((hint) => hint.text.length > 0);

const normalizeLexicon = (entries: VoiceLexiconEntry[] | void | undefined) =>
	(entries ?? [])
		.map((entry) => ({
			...entry,
			aliases: entry.aliases?.filter(
				(value): value is string =>
					typeof value === 'string' && value.trim().length > 0
			),
			language:
				typeof entry.language === 'string' && entry.language.trim().length > 0
					? entry.language.trim()
					: undefined,
			pronunciation:
				typeof entry.pronunciation === 'string' &&
				entry.pronunciation.trim().length > 0
					? entry.pronunciation.trim()
					: undefined,
			text: entry.text.trim()
		}))
		.filter((entry) => entry.text.length > 0);

const resolvePhraseHints = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	config: VoicePluginConfig<TContext, TSession, TResult>,
	input: {
		context: TContext;
		scenarioId?: string;
		sessionId: string;
	}
) => {
	if (!config.phraseHints) {
		return [] as VoicePhraseHint[];
	}

	if (typeof config.phraseHints === 'function') {
		return normalizePhraseHints(await config.phraseHints(input));
	}

	return normalizePhraseHints(config.phraseHints);
};

const resolveLexicon = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	config: VoicePluginConfig<TContext, TSession, TResult>,
	input: {
		context: TContext;
		scenarioId?: string;
		sessionId: string;
	}
) => {
	if (!config.lexicon) {
		return [] as VoiceLexiconEntry[];
	}

	if (typeof config.lexicon === 'function') {
		return normalizeLexicon(await config.lexicon(input));
	}

	return normalizeLexicon(config.lexicon);
};

export const voice = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	config: VoicePluginConfig<TContext, TSession, TResult>
) => {
	const runtime: VoiceRuntime = {
		activeSessions: new Map(),
		logger: resolveLogger(config.logger),
		socketSessions: new WeakMap()
	};
	const onTurn = normalizeOnTurn(config.onTurn);
	const sessionOptions = resolveSessionOptions(config);

	const htmxOptions =
		config.htmx && typeof config.htmx === 'object' ? config.htmx : undefined;
	const htmxRoute = htmxOptions?.route ?? `${config.path}/htmx/session`;
	const htmxBootstrapRoute =
		htmxOptions?.bootstrapRoute ?? `${config.path}/htmx/bootstrap.js`;
	const htmxRenderers = resolveVoiceHTMXRenderers<TSession, TResult>(
		config.htmx && config.htmx !== true ? config.htmx : undefined
	);
	const htmxTargets = resolveVoiceHTMXTargets(htmxOptions?.targets);
	const createManagedSession = async (
		ws: { data?: unknown; close: (code?: number, reason?: string) => void; send: (data: string | Uint8Array | ArrayBuffer) => unknown },
		sessionId: string,
		scenarioId?: string
	) => {
		const context = ws.data as TContext;
		const phraseHints = await resolvePhraseHints(config, {
			context,
			scenarioId,
			sessionId
		});
		const lexicon = await resolveLexicon(config, {
			context,
			scenarioId,
			sessionId
		});

		return createVoiceSession<TContext, TSession, TResult>({
			audioConditioning: sessionOptions.audioConditioning,
			context,
			id: sessionId,
			handoff: config.handoff,
			languageStrategy: config.languageStrategy,
			lexicon,
			logger: sessionOptions.logger,
			phraseHints,
			reconnect: sessionOptions.reconnect,
			route: {
				correctTurn: config.correctTurn,
				onCallEnd: async (input) => {
					let hookError: unknown;

					try {
						await config.onCallEnd?.(input);
					} catch (error) {
						hookError = error;
					}

					try {
						await recordVoiceRuntimeOps({
							api: input.api,
							config: config.ops,
							context: input.context,
							disposition: input.disposition,
							metadata: input.metadata,
							reason: input.reason,
							session: input.session,
							target: input.target
						});
					} finally {
						if (hookError) {
							throw hookError;
						}
					}
				},
				onCallStart: config.onCallStart,
				onComplete: config.onComplete,
				onEscalation: config.onEscalation,
				onError: config.onError,
				onNoAnswer: config.onNoAnswer,
				onSession: config.onSession,
				onTransfer: config.onTransfer,
				onTurn,
				onVoicemail: config.onVoicemail
			},
			scenarioId,
			socket: createSocketAdapter(ws),
			store: config.session,
			trace: config.trace,
			stt: config.stt,
			sttFallback: sessionOptions.sttFallback,
			sttLifecycle: sessionOptions.sttLifecycle,
			tts: config.tts,
			turnDetection: sessionOptions.turnDetection
		});
	};

	const htmxRoutes = () => {
		if (!config.htmx) {
			return new Elysia();
		}

		return new Elysia()
			.get(htmxRoute, async ({ query }) => {
				const sessionId =
					typeof query.sessionId === 'string' && query.sessionId.trim()
						? query.sessionId.trim()
						: undefined;
				const session = sessionId
					? await config.session.get(sessionId)
					: undefined;
				const result = session?.turns
					.toReversed()
					.find((turn) => turn.result !== undefined)?.result as
					| TResult
					| undefined;
				const turns = (session?.turns as Array<
					VoiceTurnRecord<TResult>
				> | undefined) ?? [];

				return new Response(
					buildVoiceHTMXResponse<TSession, TResult>(
						{
							assistantTexts:
								session?.turns.flatMap((turn) =>
									turn.assistantText ? [turn.assistantText] : []
								) ?? [],
							partial: session?.currentTurn.partialText ?? '',
							result,
							session,
							sessionId,
							status: session?.status ?? 'idle',
							turnCount: turns.length,
							turns
						},
						htmxRenderers,
						htmxTargets
					),
					{
						headers: { 'Content-Type': 'text/html; charset=utf-8' }
					}
				);
			})
			.get(htmxBootstrapRoute, async () =>
				new Response(await loadHTMXBootstrap(), {
					headers: {
						'Content-Type': 'application/javascript; charset=utf-8'
					}
				})
			);
	};

	return new Elysia({ name: 'absolutejs-voice' })
		.ws(config.path, {
			close: async (ws, code, reason) => {
				const socketState = runtime.socketSessions.get(ws as object);
				if (!socketState) {
					return;
				}

				const session = runtime.activeSessions.get(socketState.sessionId);
				runtime.activeSessions.delete(socketState.sessionId);

				if (session) {
					await session.disconnect({
						code,
						reason,
						recoverable: true,
						type: 'close'
					});
				}
			},
			message: async (ws, raw) => {
				const sessionState = resolveSessionId(runtime, ws);
				const current = runtime.activeSessions.get(sessionState.sessionId);
				const message = parseClientMessage(raw);

				if (message) {
					if (message.type === 'ping') {
						ws.send(JSON.stringify({ type: 'pong' }));
					}

					if (message.type === 'end_turn' && current) {
						await current.commitTurn('manual');
					}

					if (message.type === 'close' && current) {
						await current.close(message.reason);
						runtime.activeSessions.delete(sessionState.sessionId);
					}

					if (message.type === 'call_control' && current) {
						if (message.action === 'transfer') {
							if (message.target) {
								await current.transfer({
									metadata: message.metadata,
									reason: message.reason,
									target: message.target
								});
							} else {
								ws.send(
									JSON.stringify({
										message: 'call_control transfer requires target',
										recoverable: true,
										type: 'error'
									})
								);
							}
						}

						if (message.action === 'escalate') {
							await current.escalate({
								metadata: message.metadata,
								reason: message.reason ?? 'client-requested-escalation'
							});
						}

						if (message.action === 'voicemail') {
							await current.markVoicemail({
								metadata: message.metadata
							});
						}

						if (message.action === 'no-answer') {
							await current.markNoAnswer({
								metadata: message.metadata
							});
						}

						if (message.action === 'complete') {
							await current.complete();
						}
					}

					if (
						message.type === 'start' &&
						message.sessionId &&
						message.sessionId !== sessionState.sessionId
					) {
						const currentSession = runtime.activeSessions.get(
							sessionState.sessionId
						);

						if (currentSession) {
							await currentSession.close('session-switch');
							runtime.activeSessions.delete(sessionState.sessionId);
						}

						sessionState.sessionId = message.sessionId;
						runtime.socketSessions.set(ws as object, {
							...sessionState,
							sessionId: message.sessionId,
							scenarioId: sessionState.scenarioId
						});
					}

					if (message.type === 'start' && message.scenarioId) {
						sessionState.scenarioId = message.scenarioId;
						runtime.socketSessions.set(ws as object, {
							...sessionState,
							scenarioId: message.scenarioId
						});
					}

					return;
				}

				const audio = toAudioChunk(raw);
				if (!audio) {
					return;
				}

				const session =
					current ??
					(await createManagedSession(
						ws,
						sessionState.sessionId,
						sessionState.scenarioId ?? undefined
					));

				if (!current) {
					runtime.activeSessions.set(
						sessionState.sessionId,
						session as VoiceSessionHandle<
							unknown,
							VoiceSessionRecord,
							unknown
						>
					);
					await session.connect(createSocketAdapter(ws));
				}

				await session.receiveAudio(audio);
			},
			open: async (ws) => {
				const sessionState = resolveSessionId(runtime, ws);
				const existing = runtime.activeSessions.get(sessionState.sessionId);

				if (existing) {
					await existing.close('superseded');
					runtime.activeSessions.delete(sessionState.sessionId);
				}

				const session = await createManagedSession(
					ws,
					sessionState.sessionId,
					sessionState.scenarioId ?? undefined
				);

				runtime.activeSessions.set(
					sessionState.sessionId,
					session as VoiceSessionHandle<
						unknown,
						VoiceSessionRecord,
						unknown
					>
				);
				await session.connect(createSocketAdapter(ws));
			}
		})
		.use(htmxRoutes());
};
