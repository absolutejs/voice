import { Buffer } from 'node:buffer';
import { resolveAudioConditioningConfig } from '../audioConditioning';
import { resolveLogger } from '../logger';
import { resolveVoiceRuntimePreset } from '../presets';
import { createVoiceSession } from '../session';
import {
	createVoiceCallReviewRecorder,
	type VoiceCallReviewArtifact,
	type VoiceCallReviewConfig,
	type VoiceCallReviewRecorder
} from '../testing/review';
import { resolveTurnDetectionConfig } from '../turnProfiles';
import type {
	AudioChunk,
	AudioFormat,
	CreateVoiceSessionOptions,
	STTAdapter,
	TTSAdapter,
	VoiceAudioConditioningConfig,
	VoiceCostTelemetryConfig,
	VoiceLanguageStrategy,
	VoiceLexiconEntry,
	VoiceLexiconResolver,
	VoiceLogger,
	VoiceNormalizedRouteConfig,
	VoiceOnTurnObjectHandler,
	VoicePhraseHint,
	VoicePhraseHintResolver,
	VoicePluginConfig,
	VoiceReconnectConfig,
	VoiceResolvedSTTFallbackConfig,
	VoiceRouteResult,
	VoiceRuntimePreset,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceSessionStore,
	VoiceSocket,
	VoiceSTTFallbackConfig,
	VoiceSTTLifecycle,
	VoiceTurnDetectionConfig,
	VoiceTurnRecord,
	VoiceServerMessage
} from '../types';

const TWILIO_MULAW_SAMPLE_RATE = 8_000;
const VOICE_PCM_SAMPLE_RATE = 16_000;

type TwilioMediaPayload = {
	chunk?: string;
	payload: string;
	timestamp?: string;
	track?: 'inbound' | 'outbound';
};

type TwilioConnectedMessage = {
	event: 'connected';
	protocol?: string;
	version?: string;
};

type TwilioStartMessage = {
	event: 'start';
	sequenceNumber?: string;
	start: {
		accountSid?: string;
		callSid?: string;
		customParameters?: Record<string, string>;
		mediaFormat?: {
			channels?: number;
			encoding?: string;
			sampleRate?: number;
		};
		streamSid: string;
		track?: string;
	};
	streamSid?: string;
};

type TwilioMediaMessage = {
	event: 'media';
	media: TwilioMediaPayload;
	sequenceNumber?: string;
	streamSid: string;
};

type TwilioMarkMessage = {
	event: 'mark';
	mark?: {
		name?: string;
	};
	sequenceNumber?: string;
	streamSid: string;
};

type TwilioStopMessage = {
	event: 'stop';
	sequenceNumber?: string;
	stop?: {
		accountSid?: string;
		callSid?: string;
	};
	streamSid: string;
};

export type TwilioInboundMessage =
	| TwilioConnectedMessage
	| TwilioStartMessage
	| TwilioMediaMessage
	| TwilioMarkMessage
	| TwilioStopMessage;

export type TwilioOutboundMediaMessage = {
	event: 'media';
	media: {
		payload: string;
	};
	streamSid: string;
};

export type TwilioOutboundClearMessage = {
	event: 'clear';
	streamSid: string;
};

export type TwilioOutboundMarkMessage = {
	event: 'mark';
	mark: {
		name: string;
	};
	streamSid: string;
};

export type TwilioOutboundMessage =
	| TwilioOutboundMediaMessage
	| TwilioOutboundClearMessage
	| TwilioOutboundMarkMessage;

export type TwilioMediaStreamSocket = {
	close: (code?: number, reason?: string) => void | Promise<void>;
	send: (data: string) => void | Promise<void>;
};

export type TwilioMediaStreamBridgeOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Omit<VoicePluginConfig<TContext, TSession, TResult>, 'htmx' | 'path'> & {
	clearOnInboundMedia?: boolean;
	context: TContext;
	logger?: VoiceLogger;
	onVoiceMessage?: (input: {
		callSid?: string;
		message: VoiceServerMessage<TResult>;
		sessionId: string;
		streamSid?: string;
	}) => Promise<void> | void;
	review?: {
		config?: VoiceCallReviewConfig;
		fixtureId?: string;
		onArtifact?: (artifact: VoiceCallReviewArtifact) => Promise<void> | void;
		path?: string;
		title?: string;
	};
	scenarioId?: string;
	sessionId?: string;
};

export type TwilioMediaStreamBridge = {
	close: (reason?: string) => Promise<void>;
	getSessionId: () => string | null;
	getStreamSid: () => string | null;
	handleMessage: (raw: string | TwilioInboundMessage) => Promise<void>;
};

export type TwilioVoiceResponseOptions = {
	parameters?: Record<string, string | number | boolean | undefined>;
	streamName?: string;
	streamUrl: string;
	track?: 'both_tracks' | 'inbound_track' | 'outbound_track';
};

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

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

const resolveSTTFallbackConfig = (
	config?: VoiceSTTFallbackConfig
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

const toUint8Array = (value: AudioChunk) => {
	if (value instanceof Uint8Array) {
		return value;
	}

	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}

	return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
};

const clamp16 = (value: number) =>
	Math.max(-32_768, Math.min(32_767, Math.round(value)));

const linearResample = (
	input: Int16Array,
	inputRate: number,
	outputRate: number
) => {
	if (input.length === 0) {
		return new Int16Array(0);
	}

	if (inputRate === outputRate) {
		return new Int16Array(input);
	}

	const outputLength = Math.max(
		1,
		Math.round((input.length * outputRate) / inputRate)
	);
	const output = new Int16Array(outputLength);
	const ratio = inputRate / outputRate;

	for (let index = 0; index < outputLength; index += 1) {
		const sourcePosition = index * ratio;
		const leftIndex = Math.floor(sourcePosition);
		const rightIndex = Math.min(input.length - 1, leftIndex + 1);
		const blend = sourcePosition - leftIndex;
		const left = input[Math.min(leftIndex, input.length - 1)] ?? 0;
		const right = input[rightIndex] ?? left;
		output[index] = clamp16(left + (right - left) * blend);
	}

	return output;
};

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32_635;

const encodeMulawSample = (sample: number) => {
	let value = clamp16(sample);
	let sign = 0;
	if (value < 0) {
		sign = 0x80;
		value = -value;
	}

	value = Math.min(MULAW_CLIP, value);
	value += MULAW_BIAS;

	let exponent = 7;
	for (let bit = 0x4000; (value & bit) === 0 && exponent > 0; bit >>= 1) {
		exponent -= 1;
	}

	const mantissa = (value >> (exponent + 3)) & 0x0f;
	return ~(sign | (exponent << 4) | mantissa) & 0xff;
};

const decodeMulawSample = (value: number) => {
	const normalized = (~value) & 0xff;
	const sign = normalized & 0x80;
	const exponent = (normalized >> 4) & 0x07;
	const mantissa = normalized & 0x0f;
	let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
	sample -= MULAW_BIAS;
	return sign ? -sample : sample;
};

const int16ArrayToBytes = (samples: Int16Array) => {
	const output = new Uint8Array(samples.length * 2);
	const view = new DataView(output.buffer);
	for (let index = 0; index < samples.length; index += 1) {
		view.setInt16(index * 2, samples[index] ?? 0, true);
	}
	return output;
};

const bytesToInt16Array = (bytes: Uint8Array) => {
	const sampleCount = Math.floor(bytes.byteLength / 2);
	const output = new Int16Array(sampleCount);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < sampleCount; index += 1) {
		output[index] = view.getInt16(index * 2, true);
	}
	return output;
};

export const decodeTwilioMulawBase64 = (payload: string) => {
	const bytes = Uint8Array.from(Buffer.from(payload, 'base64'));
	const samples = new Int16Array(bytes.length);
	for (let index = 0; index < bytes.length; index += 1) {
		samples[index] = decodeMulawSample(bytes[index] ?? 0);
	}
	return samples;
};

export const encodeTwilioMulawBase64 = (samples: Int16Array) => {
	const bytes = new Uint8Array(samples.length);
	for (let index = 0; index < samples.length; index += 1) {
		bytes[index] = encodeMulawSample(samples[index] ?? 0);
	}
	return Buffer.from(bytes).toString('base64');
};

export const transcodeTwilioInboundPayloadToPCM16 = (payload: string) => {
	const narrowband = decodeTwilioMulawBase64(payload);
	const wideband = linearResample(
		narrowband,
		TWILIO_MULAW_SAMPLE_RATE,
		VOICE_PCM_SAMPLE_RATE
	);
	return int16ArrayToBytes(wideband);
};

export const transcodePCMToTwilioOutboundPayload = (
	chunk: Uint8Array,
	format: AudioFormat
) => {
	if (
		format.container === 'raw' &&
		format.encoding === 'mulaw' &&
		format.channels === 1 &&
		format.sampleRateHz === TWILIO_MULAW_SAMPLE_RATE
	) {
		return Buffer.from(chunk).toString('base64');
	}

	if (format.encoding !== 'pcm_s16le') {
		throw new Error(
			`Unsupported outbound telephony audio format: ${format.container}/${format.encoding}`
		);
	}

	const pcm = bytesToInt16Array(chunk);
	const mono =
		format.channels === 1
			? pcm
			: new Int16Array(
					Array.from({ length: Math.floor(pcm.length / 2) }, (_, frameIndex) => {
						const left = pcm[frameIndex * 2] ?? 0;
						const right = pcm[frameIndex * 2 + 1] ?? 0;
						return clamp16((left + right) / 2);
					})
			  );
	const telephony = linearResample(
		mono,
		format.sampleRateHz,
		TWILIO_MULAW_SAMPLE_RATE
	);
	return encodeTwilioMulawBase64(telephony);
};

const parseTwilioMessage = (raw: string | TwilioInboundMessage) => {
	if (typeof raw !== 'string') {
		return raw;
	}

	return JSON.parse(raw) as TwilioInboundMessage;
};

const createTwilioSocketAdapter = <TResult>(
	socket: TwilioMediaStreamSocket,
	getState: () => {
		callSid: string | null;
		hasOutboundAudioSinceLastInbound: boolean;
		onVoiceMessage?: (input: {
			callSid?: string;
			message: VoiceServerMessage<TResult>;
			sessionId: string;
			streamSid?: string;
		}) => Promise<void> | void;
		reviewRecorder?: VoiceCallReviewRecorder;
		sessionId: string | null;
		streamSid: string | null;
	}
) => ({
	close: async (code?: number, reason?: string) => {
		await Promise.resolve(socket.close(code, reason));
	},
	send: async (data: string | Uint8Array | ArrayBuffer) => {
		if (typeof data !== 'string') {
			return;
		}

		const state = getState();
		const message = JSON.parse(data) as VoiceServerMessage<TResult>;
		state.reviewRecorder?.recordVoiceMessage(message);
		await Promise.resolve(
			state.onVoiceMessage?.({
				callSid: state.callSid ?? undefined,
				message,
				sessionId: state.sessionId ?? '',
				streamSid: state.streamSid ?? undefined
			})
		);

		if (!state.streamSid) {
			return;
		}

		if (message.type === 'audio') {
			const payload = transcodePCMToTwilioOutboundPayload(
				Uint8Array.from(Buffer.from(message.chunkBase64, 'base64')),
				message.format
			);
			state.hasOutboundAudioSinceLastInbound = true;
			state.reviewRecorder?.recordTwilioOutbound({
				bytes: payload.length,
				event: 'media',
				track: 'outbound'
			});
			await Promise.resolve(
				socket.send(
					JSON.stringify({
						event: 'media',
						media: {
							payload
						},
						streamSid: state.streamSid
					} satisfies TwilioOutboundMediaMessage)
				)
			);
			return;
		}

		if (message.type === 'assistant' && message.turnId) {
			state.reviewRecorder?.recordTwilioOutbound({
				event: 'mark',
				name: `assistant:${message.turnId}`
			});
			await Promise.resolve(
				socket.send(
					JSON.stringify({
						event: 'mark',
						mark: {
							name: `assistant:${message.turnId}`
						},
						streamSid: state.streamSid
					} satisfies TwilioOutboundMarkMessage)
				)
			);
		}
	}
});

export const createTwilioVoiceResponse = (
	options: TwilioVoiceResponseOptions
) => {
	const parameters = Object.entries(options.parameters ?? {})
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(
			([name, value]) =>
				`<Parameter name="${escapeXml(name)}" value="${escapeXml(String(value))}" />`
		)
		.join('');

	return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(
		options.streamUrl
	)}"${
		options.track ? ` track="${escapeXml(options.track)}"` : ''
	}${
		options.streamName ? ` name="${escapeXml(options.streamName)}"` : ''
	}>${parameters}</Stream></Connect></Response>`;
};

export const createTwilioMediaStreamBridge = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	socket: TwilioMediaStreamSocket,
	options: TwilioMediaStreamBridgeOptions<TContext, TSession, TResult>
): TwilioMediaStreamBridge => {
	const runtimePreset = resolveVoiceRuntimePreset(options.preset);
	const turnDetection = resolveTurnDetectionConfig({
		...runtimePreset.turnDetection,
		...options.turnDetection
	});
	const audioConditioning =
		options.audioConditioning !== undefined
			? resolveAudioConditioningConfig(options.audioConditioning)
			: runtimePreset.audioConditioning;
	const logger = resolveLogger(options.logger);
	const reconnect: Required<VoiceReconnectConfig> = {
		maxAttempts: options.reconnect?.maxAttempts ?? 10,
		strategy: options.reconnect?.strategy ?? 'resume-last-turn',
		timeout: options.reconnect?.timeout ?? 30_000
	};

	const bridgeState: {
		callSid: string | null;
		hasOutboundAudioSinceLastInbound: boolean;
		onVoiceMessage?: (input: {
			callSid?: string;
			message: VoiceServerMessage<TResult>;
			sessionId: string;
			streamSid?: string;
		}) => Promise<void> | void;
		reviewRecorder?: VoiceCallReviewRecorder;
		scenarioId: string | null;
		sessionId: string | null;
		streamSid: string | null;
	} = {
		callSid: null,
		hasOutboundAudioSinceLastInbound: false,
		onVoiceMessage: options.onVoiceMessage,
		reviewRecorder:
			options.review
				? createVoiceCallReviewRecorder({
						config: options.review.config ?? {
							preset: options.preset,
							stt: {
								kind: options.stt.kind
							},
							tts: options.tts
								? {
										kind: options.tts.kind
								  }
								: undefined,
							turnDetection
						},
						fixtureId: options.review.fixtureId,
						path: options.review.path,
						title: options.review.title
				  })
				: undefined,
		scenarioId: options.scenarioId ?? null,
		sessionId: options.sessionId ?? null,
		streamSid: null
	};
	let sessionHandle:
		| VoiceSessionHandle<TContext, TSession, TResult>
		| null = null;
	let reviewArtifactDelivered = false;

	const resolveLexicon = async () => {
		if (typeof options.lexicon === 'function') {
			return normalizeLexicon(
				(await (options.lexicon as VoiceLexiconResolver<TContext>)({
					context: options.context,
					scenarioId: bridgeState.scenarioId ?? undefined,
					sessionId: bridgeState.sessionId ?? ''
				})) ?? []
			);
		}

		return normalizeLexicon(options.lexicon);
	};

	const resolvePhraseHints = async () => {
		if (typeof options.phraseHints === 'function') {
			return normalizePhraseHints(
				(await (options.phraseHints as VoicePhraseHintResolver<TContext>)({
					context: options.context,
					scenarioId: bridgeState.scenarioId ?? undefined,
					sessionId: bridgeState.sessionId ?? ''
				})) ?? []
			);
		}

		return normalizePhraseHints(options.phraseHints);
	};

	const ensureSession = async () => {
		if (sessionHandle) {
			return sessionHandle;
		}

		bridgeState.sessionId ??= `phone-${Date.now().toString(36)}`;
		const lexicon = await resolveLexicon();
		const phraseHints = await resolvePhraseHints();
		const normalizedOnTurn = normalizeOnTurn(options.onTurn);
		const route: VoiceNormalizedRouteConfig<TContext, TSession, TResult> = {
			correctTurn: options.correctTurn,
			onComplete: options.onComplete,
			onError: options.onError,
			onSession: options.onSession,
			onTurn: async (input) => {
				bridgeState.reviewRecorder?.recordVoiceMessage({
					type: 'turn',
					turn: input.turn
				});
				const result = await normalizedOnTurn(input);
				if (result?.assistantText) {
					bridgeState.reviewRecorder?.recordVoiceMessage({
						type: 'assistant',
						text: result.assistantText,
						turnId: input.turn.id
					});
				}
				return result;
			}
		};
		const voiceSocket = createTwilioSocketAdapter<TResult>(socket, () => bridgeState);

		sessionHandle = createVoiceSession({
			audioConditioning,
			context: options.context,
			costTelemetry: options.costTelemetry as
				| VoiceCostTelemetryConfig<TContext, TSession, TResult>
				| undefined,
			id: bridgeState.sessionId,
			languageStrategy: options.languageStrategy,
			lexicon,
			logger,
			phraseHints,
			reconnect,
			route,
			scenarioId: bridgeState.scenarioId ?? undefined,
			socket: voiceSocket,
			store: options.session as VoiceSessionStore<TSession>,
			stt: options.stt as STTAdapter,
			sttFallback: resolveSTTFallbackConfig(options.sttFallback),
			sttLifecycle: options.sttLifecycle ?? runtimePreset.sttLifecycle,
			tts: options.tts as TTSAdapter | undefined,
			turnDetection
		} satisfies CreateVoiceSessionOptions<TContext, TSession, TResult>);

		return sessionHandle;
	};

	return {
		close: async (reason?: string) => {
			await sessionHandle?.close(reason);
			if (
				bridgeState.reviewRecorder &&
				options.review?.onArtifact &&
				!reviewArtifactDelivered
			) {
				reviewArtifactDelivered = true;
				await Promise.resolve(
					options.review.onArtifact(bridgeState.reviewRecorder.finalize())
				);
			}
		},
		getSessionId: () => bridgeState.sessionId,
		getStreamSid: () => bridgeState.streamSid,
		handleMessage: async (raw) => {
			const message = parseTwilioMessage(raw);

			switch (message.event) {
				case 'connected':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'connected'
					});
					return;
				case 'start': {
					bridgeState.streamSid = message.start.streamSid;
					bridgeState.callSid = message.start.callSid ?? null;
					bridgeState.sessionId =
						message.start.customParameters?.sessionId?.trim() ||
						bridgeState.sessionId;
					bridgeState.scenarioId =
						message.start.customParameters?.scenarioId?.trim() ||
						bridgeState.scenarioId;
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'start',
						reason: message.start.callSid,
						text: bridgeState.sessionId ?? undefined
					});
					await ensureSession();
					return;
				}
				case 'media': {
					const activeSession = await ensureSession();
					bridgeState.reviewRecorder?.recordTwilioInbound({
						bytes: message.media.payload.length,
						event: 'media',
						track: message.media.track
					});
					if (
						options.clearOnInboundMedia !== false &&
						bridgeState.hasOutboundAudioSinceLastInbound &&
						bridgeState.streamSid
					) {
						bridgeState.reviewRecorder?.recordTwilioOutbound({
							event: 'clear'
						});
						await Promise.resolve(
							socket.send(
								JSON.stringify({
									event: 'clear',
									streamSid: bridgeState.streamSid
								} satisfies TwilioOutboundClearMessage)
							)
						);
					}
					bridgeState.hasOutboundAudioSinceLastInbound = false;
					await activeSession.receiveAudio(
						transcodeTwilioInboundPayloadToPCM16(message.media.payload)
					);
					return;
				}
				case 'mark':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'mark',
						name: message.mark?.name
					});
					return;
				case 'stop':
					bridgeState.reviewRecorder?.recordTwilioInbound({
						event: 'stop',
						reason: message.stop?.callSid
					});
					await sessionHandle?.close('twilio-stop');
					return;
			}
		}
	};
};
