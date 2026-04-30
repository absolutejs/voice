import type {
	AudioChunk,
	AudioFormat,
	RealtimeAdapter,
	RealtimeAdapterOpenOptions,
	RealtimeSessionEventMap,
	Transcript,
	VoiceLanguageStrategy,
	VoiceLexiconEntry,
	VoicePhraseHint
} from './types';

export type OpenAIRealtimeModel =
	| 'gpt-realtime'
	| 'gpt-realtime-mini'
	| 'gpt-4o-realtime-preview'
	| 'gpt-4o-mini-realtime-preview'
	| (string & {});

export type OpenAIRealtimeVoice =
	| 'alloy'
	| 'ash'
	| 'ballad'
	| 'cedar'
	| 'coral'
	| 'echo'
	| 'marin'
	| 'sage'
	| 'shimmer'
	| 'verse'
	| { id: string }
	| (string & {});

export type OpenAIRealtimeTranscriptionModel =
	| 'gpt-4o-mini-transcribe'
	| 'gpt-4o-transcribe'
	| 'whisper-1'
	| (string & {});

export type OpenAIRealtimeNoiseReduction = 'near_field' | 'far_field';

export type OpenAIRealtimeResponseMode = 'audio' | 'text';

export type OpenAIRealtimeAdapterOptions = {
	apiKey: string;
	autoCommitSilenceMs?: number;
	baseUrl?: string;
	emitResponseTranscripts?: boolean;
	inputTranscriptionLanguage?: string;
	inputTranscriptionModel?: OpenAIRealtimeTranscriptionModel | null;
	inputTranscriptionPrompt?: string;
	instructions?: string;
	maxOutputTokens?: number | 'inf';
	model?: OpenAIRealtimeModel;
	noiseReduction?: OpenAIRealtimeNoiseReduction;
	responseMode?: OpenAIRealtimeResponseMode;
	speed?: number;
	temperature?: number;
	voice?: OpenAIRealtimeVoice;
	webSocket?: typeof WebSocket;
};

type OpenAIRealtimeOpenOptions = RealtimeAdapterOpenOptions & {
	languageStrategy?: VoiceLanguageStrategy;
	lexicon?: VoiceLexiconEntry[];
	phraseHints?: VoicePhraseHint[];
};

type ListenerMap = {
	[K in keyof RealtimeSessionEventMap]: Set<
		(payload: RealtimeSessionEventMap[K]) => void | Promise<void>
	>;
};

type OpenAIRealtimeError = {
	code?: string;
	event_id?: string;
	message?: string;
	param?: string;
	type?: string;
};

type OpenAIServerEvent = {
	type?: string;
	[key: string]: unknown;
};

type OpenAIClientEvent = {
	event_id?: string;
	type: string;
	[key: string]: unknown;
};

const DEFAULT_AUTO_COMMIT_SILENCE_MS = 450;
const DEFAULT_BASE_URL = 'wss://api.openai.com/v1/realtime';
const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_VOICE: OpenAIRealtimeVoice = 'marin';

const OPENAI_PCM24_FORMAT: AudioFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 24_000
};

const createListenerMap = (): ListenerMap => ({
	audio: new Set(),
	close: new Set(),
	endOfTurn: new Set(),
	error: new Set(),
	final: new Set(),
	partial: new Set()
});

const emit = async <K extends keyof RealtimeSessionEventMap>(
	listeners: ListenerMap,
	event: K,
	payload: RealtimeSessionEventMap[K]
) => {
	for (const listener of listeners[event]) {
		await listener(payload);
	}
};

const compact = (value: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined)
	);

const resolveErrorMessage = (error: unknown): string => {
	if (typeof error === 'string' && error.trim()) {
		return error;
	}

	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (error && typeof error === 'object') {
		const record = error as Record<string, unknown>;
		for (const key of ['message', 'reason', 'description', 'detail']) {
			const candidate = record[key];
			if (typeof candidate === 'string' && candidate.trim()) {
				return candidate;
			}
		}

		if ('error' in record) {
			return resolveErrorMessage(record.error);
		}

		try {
			return JSON.stringify(error);
		} catch {}
	}

	return 'OpenAI realtime error';
};

const toUint8Array = (value: AudioChunk) =>
	value instanceof ArrayBuffer
		? new Uint8Array(value)
		: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

const toBase64 = (value: AudioChunk) =>
	Buffer.from(toUint8Array(value)).toString('base64');

const textTranscript = (text: string): Transcript => ({
	id: `openai-realtime-text-${crypto.randomUUID()}`,
	isFinal: true,
	text,
	vendor: 'openai'
});

const audioTranscript = (
	itemId: string,
	text: string,
	isFinal: boolean
): Transcript => ({
	id: itemId,
	isFinal,
	text,
	vendor: 'openai'
});

const assertPCM24Mono = (format: AudioFormat) => {
	if (
		format.container !== 'raw' ||
		format.encoding !== 'pcm_s16le' ||
		format.sampleRateHz !== 24_000 ||
		format.channels !== 1
	) {
		throw new Error(
			'OpenAI Realtime requires raw pcm_s16le audio at 24kHz mono.'
		);
	}
};

const resolveTranscriptionLanguage = (
	options: OpenAIRealtimeAdapterOptions,
	openOptions: OpenAIRealtimeOpenOptions
) => {
	if (options.inputTranscriptionLanguage?.trim()) {
		return options.inputTranscriptionLanguage.trim();
	}

	if (openOptions.languageStrategy?.mode !== 'fixed') {
		return undefined;
	}

	const language = openOptions.languageStrategy.primaryLanguage.trim();
	return language.length > 0 ? language : undefined;
};

const phraseHintPrompt = (options: OpenAIRealtimeOpenOptions) => {
	const terms = (options.phraseHints ?? []).flatMap((hint) => [
		hint.text,
		...(hint.aliases ?? [])
	]);
	const unique = terms.filter((value, index) => terms.indexOf(value) === index);
	return unique.length
		? `Prioritize accurate recovery of these phrases when heard: ${unique.join(', ')}.`
		: undefined;
};

const lexiconPrompt = (options: OpenAIRealtimeOpenOptions) => {
	const entries = (options.lexicon ?? []).flatMap((entry) => {
		const details = [
			entry.text,
			entry.pronunciation ? `pronounced ${entry.pronunciation}` : undefined,
			entry.aliases?.length
				? `may also sound like ${entry.aliases.join(', ')}`
				: undefined,
			entry.language ? `language ${entry.language}` : undefined
		].filter((value): value is string => !!value);
		return details.length ? [details.join(' - ')] : [];
	});

	return entries.length
		? `Use this pronunciation lexicon when transcribing: ${entries.join('; ')}.`
		: undefined;
};

const withOpenPrompts = (
	options: OpenAIRealtimeAdapterOptions,
	openOptions: OpenAIRealtimeOpenOptions
) => {
	const phraseHints = phraseHintPrompt(openOptions);
	const lexicon = lexiconPrompt(openOptions);

	if (!phraseHints && !lexicon) {
		return options;
	}

	return {
		...options,
		inputTranscriptionPrompt: [
			options.inputTranscriptionPrompt,
			phraseHints,
			lexicon
		]
			.filter((value): value is string => !!value?.trim())
			.join('\n\n')
	};
};

const sessionUpdateEvent = (
	options: OpenAIRealtimeAdapterOptions,
	openOptions: OpenAIRealtimeOpenOptions
): OpenAIClientEvent => {
	const responseMode = options.responseMode ?? 'audio';
	const language = resolveTranscriptionLanguage(options, openOptions);
	const transcription =
		options.inputTranscriptionModel === null
			? null
			: compact({
					language,
					model:
						options.inputTranscriptionModel ??
						DEFAULT_TRANSCRIPTION_MODEL,
					prompt: options.inputTranscriptionPrompt
			  });

	return {
		event_id: `session-update-${crypto.randomUUID()}`,
		session: compact({
			audio: {
				input: compact({
					format: {
						rate: 24_000,
						type: 'audio/pcm'
					},
					noise_reduction: options.noiseReduction
						? { type: options.noiseReduction }
						: undefined,
					transcription,
					turn_detection: null
				}),
				output:
					responseMode === 'audio'
						? compact({
								format: {
									rate: 24_000,
									type: 'audio/pcm'
								},
								speed: options.speed,
								voice: options.voice ?? DEFAULT_VOICE
						  })
						: undefined
			},
			instructions: options.instructions,
			max_output_tokens: options.maxOutputTokens,
			output_modalities: [responseMode],
			temperature: options.temperature,
			type: 'realtime'
		}),
		type: 'session.update'
	};
};

const responseCreateEvent = (
	options: OpenAIRealtimeAdapterOptions
): OpenAIClientEvent => {
	const responseMode = options.responseMode ?? 'audio';

	return {
		response: compact({
			audio:
				responseMode === 'audio'
					? {
							output: compact({
								format: {
									rate: 24_000,
									type: 'audio/pcm'
								},
								voice: options.voice ?? DEFAULT_VOICE
							})
					  }
					: undefined,
			conversation: 'auto',
			max_output_tokens: options.maxOutputTokens,
			output_modalities: [responseMode]
		}),
		type: 'response.create'
	};
};

export const createOpenAIRealtimeAdapter = (
	options: OpenAIRealtimeAdapterOptions
): RealtimeAdapter => {
	const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
	const Socket = options.webSocket ?? globalThis.WebSocket;

	return {
		kind: 'realtime',
		open: (openOptions) => {
			assertPCM24Mono(openOptions.format);

			const runtimeOptions = openOptions as OpenAIRealtimeOpenOptions;
			const runtimeConfig = withOpenPrompts(options, runtimeOptions);
			const model = runtimeConfig.model ?? DEFAULT_MODEL;
			const listeners = createListenerMap();
			const socket = new Socket(
				`${baseUrl.replace(/\/$/, '')}?model=${encodeURIComponent(model)}`,
				{
					headers: {
						Authorization: `Bearer ${runtimeConfig.apiKey}`
					}
				} as never
			);
			const primaryUpdate = sessionUpdateEvent(runtimeConfig, runtimeOptions);
			const pendingMessages: string[] = [];
			const partials = new Map<string, string>();
			const finals = new Set<string>();
			const autoCommitSilenceMs =
				runtimeConfig.autoCommitSilenceMs ??
				DEFAULT_AUTO_COMMIT_SILENCE_MS;
			let audioCommitTimer: ReturnType<typeof setTimeout> | undefined;
			let closeEmitted = false;
			let closed = false;
			let pendingAudio = false;
			let ready = false;
			let readyTimeout: ReturnType<typeof setTimeout> | undefined;
			let socketOpen = false;
			let resolveReady!: () => void;
			let rejectReady!: (error: Error) => void;
			const readyPromise = new Promise<void>((resolve, reject) => {
				resolveReady = resolve;
				rejectReady = reject;
			});

			const clearReadyTimeout = () => {
				if (readyTimeout) {
					clearTimeout(readyTimeout);
					readyTimeout = undefined;
				}
			};
			const markReady = () => {
				if (ready || closed) {
					return;
				}

				ready = true;
				clearReadyTimeout();
				resolveReady();
			};
			const failReady = (error: Error) => {
				if (ready || closed) {
					return;
				}

				clearReadyTimeout();
				rejectReady(error);
			};
			const sendRaw = (payload: OpenAIClientEvent) => {
				const serialized = JSON.stringify(payload);
				if (!socketOpen) {
					pendingMessages.push(serialized);
					return;
				}

				socket.send(serialized);
			};
			const flush = () => {
				for (const message of pendingMessages.splice(0)) {
					socket.send(message);
				}
			};
			const emitClose = async (
				code?: number,
				reason?: string,
				recoverable = false
			) => {
				if (closeEmitted) {
					return;
				}

				closeEmitted = true;
				await emit(listeners, 'close', {
					code,
					reason,
					recoverable,
					type: 'close'
				});
			};
			const commitAudio = async () => {
				if (closed || !pendingAudio) {
					return;
				}

				pendingAudio = false;
				sendRaw({ type: 'input_audio_buffer.commit' });
				sendRaw(responseCreateEvent(runtimeConfig));
			};
			const resetAudioTimer = () => {
				if (audioCommitTimer) {
					clearTimeout(audioCommitTimer);
				}

				audioCommitTimer = setTimeout(() => {
					void commitAudio();
				}, autoCommitSilenceMs);
			};

			socket.addEventListener(
				'open',
				() => {
					socketOpen = true;
					sendRaw(primaryUpdate);
					flush();
					readyTimeout = setTimeout(() => {
						failReady(
							new Error('OpenAI realtime session did not become ready.')
						);
					}, 8_000);
				},
				{ once: true }
			);

			socket.addEventListener('message', (event) => {
				try {
					const payload = JSON.parse(String(event.data)) as OpenAIServerEvent;
					const shouldEmitResponseTranscripts =
						runtimeConfig.emitResponseTranscripts === true;

					switch (payload.type) {
						case 'session.created':
						case 'session.updated':
							markReady();
							return;
						case 'conversation.item.input_audio_transcription.delta': {
							const itemId =
								typeof payload.item_id === 'string'
									? payload.item_id
									: undefined;
							const delta =
								typeof payload.delta === 'string'
									? payload.delta
									: undefined;
							if (!itemId || !delta) {
								return;
							}

							const text = `${partials.get(itemId) ?? ''}${delta}`;
							partials.set(itemId, text);
							void emit(listeners, 'partial', {
								receivedAt: Date.now(),
								transcript: audioTranscript(itemId, text, false),
								type: 'partial'
							});
							return;
						}
						case 'conversation.item.input_audio_transcription.completed': {
							const itemId =
								typeof payload.item_id === 'string'
									? payload.item_id
									: undefined;
							const transcript =
								typeof payload.transcript === 'string'
									? payload.transcript
									: undefined;
							if (!itemId || !transcript || finals.has(itemId)) {
								return;
							}

							finals.add(itemId);
							partials.set(itemId, transcript);
							void emit(listeners, 'final', {
								receivedAt: Date.now(),
								transcript: audioTranscript(itemId, transcript, true),
								type: 'final'
							});
							void emit(listeners, 'endOfTurn', {
								receivedAt: Date.now(),
								reason: 'vendor',
								type: 'endOfTurn'
							});
							return;
						}
						case 'conversation.item.input_audio_transcription.failed': {
							const error =
								payload.error && typeof payload.error === 'object'
									? (payload.error as OpenAIRealtimeError)
									: undefined;
							void emit(listeners, 'error', {
								code: error?.code,
								error: new Error(resolveErrorMessage(error ?? payload)),
								recoverable: true,
								type: 'error'
							});
							return;
						}
						case 'response.audio.delta':
						case 'response.output_audio.delta': {
							const delta =
								typeof payload.delta === 'string'
									? payload.delta
									: undefined;
							if (!delta) {
								return;
							}

							void emit(listeners, 'audio', {
								chunk: Buffer.from(delta, 'base64'),
								format: OPENAI_PCM24_FORMAT,
								receivedAt: Date.now(),
								type: 'audio'
							});
							return;
						}
						case 'response.audio_transcript.delta':
						case 'response.output_audio_transcript.delta':
						case 'response.output_text.delta': {
							if (!shouldEmitResponseTranscripts) {
								return;
							}

							const delta =
								typeof payload.delta === 'string'
									? payload.delta
									: undefined;
							if (!delta) {
								return;
							}

							void emit(listeners, 'partial', {
								receivedAt: Date.now(),
								transcript: textTranscript(delta),
								type: 'partial'
							});
							return;
						}
						case 'response.audio_transcript.done':
						case 'response.output_audio_transcript.done':
						case 'response.output_text.done': {
							if (!shouldEmitResponseTranscripts) {
								return;
							}

							const transcript =
								typeof payload.transcript === 'string'
									? payload.transcript
									: undefined;
							if (!transcript) {
								return;
							}

							void emit(listeners, 'final', {
								receivedAt: Date.now(),
								transcript: textTranscript(transcript),
								type: 'final'
							});
							void emit(listeners, 'endOfTurn', {
								receivedAt: Date.now(),
								reason: 'vendor',
								type: 'endOfTurn'
							});
							return;
						}
						case 'error': {
							const error =
								payload.error && typeof payload.error === 'object'
									? (payload.error as OpenAIRealtimeError)
									: {};
							const message = resolveErrorMessage(error);
							void emit(listeners, 'error', {
								code: error.code,
								error: new Error(message),
								recoverable: true,
								type: 'error'
							});
							if (!ready && error.event_id === primaryUpdate.event_id) {
								failReady(new Error(message));
							}
							return;
						}
						default:
							return;
					}
				} catch (error) {
					void emit(listeners, 'error', {
						error: new Error(resolveErrorMessage(error)),
						recoverable: true,
						type: 'error'
					});
				}
			});

			socket.addEventListener('error', (event) => {
				const error = new Error(resolveErrorMessage(event));
				failReady(error);
				void emit(listeners, 'error', {
					error,
					recoverable: false,
					type: 'error'
				});
			});

			socket.addEventListener('close', (event) => {
				socketOpen = false;
				clearReadyTimeout();
				if (!ready) {
					failReady(new Error('OpenAI realtime session closed before ready.'));
				}
				void emitClose(event.code, event.reason || undefined, event.code !== 1000);
			});

			if (openOptions.signal) {
				if (openOptions.signal.aborted) {
					closed = true;
					socket.close(1000, 'aborted');
				} else {
					openOptions.signal.addEventListener(
						'abort',
						() => {
							if (!closed) {
								closed = true;
								socket.close(1000, 'aborted');
							}
						},
						{ once: true }
					);
				}
			}

			return {
				close: async (reason?: string) => {
					if (closed) {
						return;
					}

					closed = true;
					clearReadyTimeout();
					if (audioCommitTimer) {
						clearTimeout(audioCommitTimer);
						audioCommitTimer = undefined;
					}
					await commitAudio().catch(() => {});
					socket.close(1000, reason);
					await emitClose(1000, reason, false);
				},
				on: (event, handler) => {
					listeners[event].add(handler as never);
					return () => {
						listeners[event].delete(handler as never);
					};
				},
				send: async (input: AudioChunk | string) => {
					await readyPromise;
					if (closed) {
						return;
					}

					if (typeof input === 'string') {
						const text = input.trim();
						if (!text) {
							return;
						}

						await emit(listeners, 'final', {
							receivedAt: Date.now(),
							transcript: textTranscript(text),
							type: 'final'
						});
						await emit(listeners, 'endOfTurn', {
							receivedAt: Date.now(),
							reason: 'manual',
							type: 'endOfTurn'
						});
						sendRaw({
							item: {
								content: [{ text, type: 'input_text' }],
								role: 'user',
								type: 'message'
							},
							type: 'conversation.item.create'
						});
						sendRaw(responseCreateEvent(runtimeConfig));
						return;
					}

					sendRaw({
						audio: toBase64(input),
						type: 'input_audio_buffer.append'
					});
					pendingAudio = true;
					resetAudioTimer();
				}
			};
		}
	};
};
