import { expect, test } from 'bun:test';
import { createVoiceMemoryStore } from '../src/memoryStore';
import { createVoiceSession } from '../src/session';
import type {
	AudioChunk,
	STTAdapter,
	STTAdapterOpenOptions,
	STTAdapterSession,
	STTSessionEventMap,
	TTSAdapter,
	TTSAdapterSession,
	TTSSessionEventMap,
	VoiceSocket
} from '../src/types';

const withDeferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	let settled = false;

	const promise = new Promise<T>((innerResolve, innerReject) => {
		resolve = (value) => {
			settled = true;
			innerResolve(value);
		};
		reject = (error) => {
			settled = true;
			innerReject(error);
		};
	});

	return {
		promise,
		reject: (...args: [error: unknown]) => reject(...args),
		resolve: (...args: [value: T]) => resolve(...args),
		get settled() {
			return settled;
		}
	};
};

type ListenerMap = {
	[K in keyof STTSessionEventMap]: Array<
		(payload: STTSessionEventMap[K]) => void | Promise<void>
	>;
};

const createFakeAdapter = () => {
	let closeCalls = 0;
	let openCalls = 0;
	const openOptions: STTAdapterOpenOptions[] = [];
	let sentAudioChunks = 0;
	const sentAudio: Uint8Array[] = [];
	const sessions: Array<
		STTAdapterSession & {
			emit: <K extends keyof STTSessionEventMap>(
				event: K,
				payload: STTSessionEventMap[K]
			) => Promise<void>;
		}
	> = [];

	const adapter: STTAdapter = {
		kind: 'stt',
		open: (options) => {
			openCalls += 1;
			openOptions.push(options);

			const listeners: ListenerMap = {
				close: [],
				endOfTurn: [],
				error: [],
				final: [],
				partial: []
			};
			const session: STTAdapterSession & {
				emit: <K extends keyof STTSessionEventMap>(
					event: K,
					payload: STTSessionEventMap[K]
				) => Promise<void>;
			} = {
				close: async () => {
					closeCalls += 1;
				},
				emit: async (event, payload) => {
					for (const listener of listeners[event]) {
						await listener(payload as never);
					}
				},
				on: (event, handler) => {
					listeners[event].push(handler as never);

					return () => {
						const index = listeners[event].indexOf(handler as never);
						if (index >= 0) {
							listeners[event].splice(index, 1);
						}
					};
				},
				send: async (audio: AudioChunk) => {
					sentAudioChunks += 1;
					const bytes =
						audio instanceof ArrayBuffer
							? new Uint8Array(audio.slice(0))
							: new Uint8Array(
									audio.buffer.slice(
										audio.byteOffset,
										audio.byteOffset + audio.byteLength
									)
								);
					sentAudio.push(bytes);
				}
			};

			sessions.push(session);
			return session;
		}
	};

	return {
		adapter,
		emitCurrent: async <K extends keyof STTSessionEventMap>(
			event: K,
			payload: STTSessionEventMap[K]
		) => {
			const session = sessions.at(-1);
			if (!session) {
				throw new Error('No active fake adapter session');
			}

			await session.emit(event, payload);
		},
		emitSession: async <K extends keyof STTSessionEventMap>(
			index: number,
			event: K,
			payload: STTSessionEventMap[K]
		) => {
			const session = sessions[index];
			if (!session) {
				throw new Error(`No fake adapter session at index ${index}`);
			}

			await session.emit(event, payload);
		},
		getCloseCalls: () => closeCalls,
		getOpenCalls: () => openCalls,
		getOpenOptions: () => openOptions,
		getSentAudio: () => sentAudio,
		getSentAudioChunks: () => sentAudioChunks,
		getSessionCount: () => sessions.length
	};
};

type TTSListenerMap = {
	[K in keyof TTSSessionEventMap]: Array<
		(payload: TTSSessionEventMap[K]) => void | Promise<void>
	>;
};

const createFakeTTSAdapter = () => {
	let closeCalls = 0;
	let openCalls = 0;
	const sentTexts: string[] = [];
	const sessions: Array<
		TTSAdapterSession & {
			emit: <K extends keyof TTSSessionEventMap>(
				event: K,
				payload: TTSSessionEventMap[K]
			) => Promise<void>;
		}
	> = [];

	const adapter: TTSAdapter = {
		kind: 'tts',
		open: () => {
			openCalls += 1;

			const listeners: TTSListenerMap = {
				audio: [],
				close: [],
				error: []
			};
			const session: TTSAdapterSession & {
				emit: <K extends keyof TTSSessionEventMap>(
					event: K,
					payload: TTSSessionEventMap[K]
				) => Promise<void>;
			} = {
				close: async () => {
					closeCalls += 1;
				},
				emit: async (event, payload) => {
					for (const listener of listeners[event]) {
						await listener(payload as never);
					}
				},
				on: (event, handler) => {
					listeners[event].push(handler as never);

					return () => {
						const index = listeners[event].indexOf(handler as never);
						if (index >= 0) {
							listeners[event].splice(index, 1);
						}
					};
				},
				send: async (text) => {
					sentTexts.push(text);
					await session.emit('audio', {
						chunk: new Uint8Array([1, 2, 3, 4]),
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 16_000
						},
						receivedAt: Date.now()
					});
				}
			};

			sessions.push(session);
			return session;
		}
	};

	return {
		adapter,
		getCloseCalls: () => closeCalls,
		getOpenCalls: () => openCalls,
		getSentTexts: () => sentTexts,
		getSessionCount: () => sessions.length
	};
};

const createMockSocket = () => {
	const messages: string[] = [];

	const socket: VoiceSocket = {
		close: async () => {},
		send: async (data) => {
			messages.push(typeof data === 'string' ? data : '[binary]');
		}
	};

	return { messages, socket };
};

const createSpeechChunk = (sample: number) =>
	new Int16Array(160).fill(sample);

test('voice session commits a turn after silence and only once', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-silence-commit',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-1',
			isFinal: true,
			text: 'I am trying to see if this is working'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	const snapshot = await session.snapshot();

	expect(turnTexts).toEqual(['I am trying to see if this is working']);
	expect(snapshot.turns).toHaveLength(1);
	expect(snapshot.turns[0]?.text).toBe(
		'I am trying to see if this is working'
	);
	expect(adapter.getSentAudioChunks()).toBe(2);
	expect(
		socket.messages.some((message) => message.includes('"type":"turn"'))
	).toBe(true);
});

test('voice session ignores duplicate end-of-turn signals for the same turn', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-endofturn-duplicate',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-dup',
			isFinal: true,
			text: 'I am testing this'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});

	await Bun.sleep(40);

	expect(turnTexts).toEqual(['I am testing this']);
});

test('voice session streams assistant audio chunks when a tts adapter is configured', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const tts = createFakeTTSAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		context: {},
		id: 'session-tts-stream',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => ({
				assistantText: `You said: ${turn.text}`
			})
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		tts: tts.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-tts',
			isFinal: true,
			text: 'Read this back to me'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});
	await Bun.sleep(40);

	const messages = socket.messages.map((message) => JSON.parse(message));
	const assistantMessage = messages.find(
		(message) => message.type === 'assistant'
	);
	const audioMessage = messages.find((message) => message.type === 'audio');

	expect(tts.getOpenCalls()).toBe(1);
	expect(tts.getSessionCount()).toBe(1);
	expect(tts.getSentTexts()).toEqual(['You said: Read this back to me']);
	expect(assistantMessage).toMatchObject({
		text: 'You said: Read this back to me',
		type: 'assistant'
	});
	expect(audioMessage).toMatchObject({
		chunkBase64: 'AQIDBA==',
		turnId: expect.any(String),
		type: 'audio'
	});
});

test('voice session prewarms the tts adapter on connect', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const tts = createFakeTTSAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		context: {},
		id: 'session-tts-prewarm',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async () => {}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		tts: tts.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await Bun.sleep(0);

	expect(tts.getOpenCalls()).toBe(1);
});

test('voice session reconnect resume does not replay committed turns', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const firstSocket = createMockSocket();
	const secondSocket = createMockSocket();
	const turnTexts: string[] = [];
	let onSessionCalls = 0;

	const session = createVoiceSession({
		context: {},
		id: 'session-reconnect',
		logger: {},
		reconnect: {
			maxAttempts: 2,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onSession: async () => {
				onSessionCalls += 1;
			},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: firstSocket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(firstSocket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-1',
			isFinal: true,
			text: 'Reconnect should not duplicate prior turns'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);
	await session.disconnect({
		recoverable: true,
		type: 'close'
	});
	await session.connect(secondSocket.socket);

	const snapshot = await session.snapshot();

	expect(turnTexts).toEqual(['Reconnect should not duplicate prior turns']);
	expect(snapshot.turns).toHaveLength(1);
	expect(onSessionCalls).toBe(1);
	expect(
		secondSocket.messages.some(
			(message) =>
				message.includes('"type":"session"') &&
				message.includes('"status":"active"')
		)
	).toBe(true);
});

test('voice session dedupes committed turns across handler instances', async () => {
	const adapter = createFakeAdapter();
	const store = createVoiceMemoryStore();
	const firstSocket = createMockSocket();
	const secondSocket = createMockSocket();
	const turnTexts: string[] = [];

	const firstSession = createVoiceSession({
		context: {},
		id: 'session-cross-node-dedupe',
		logger: {},
		reconnect: {
			maxAttempts: 2,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: firstSocket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await firstSession.connect(firstSocket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'cross-node-final',
			isFinal: true,
			text: 'Persisted dedupe should block reconnect duplicates'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});
	await Bun.sleep(40);
	await firstSession.disconnect({
		recoverable: true,
		type: 'close'
	});

	const secondSession = createVoiceSession({
		context: {},
		id: 'session-cross-node-dedupe',
		logger: {},
		reconnect: {
			maxAttempts: 2,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: secondSocket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await secondSession.connect(secondSocket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'cross-node-final',
			isFinal: true,
			text: 'Persisted dedupe should block reconnect duplicates'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});
	await Bun.sleep(40);

	const snapshot = await secondSession.snapshot();

	expect(turnTexts).toEqual([
		'Persisted dedupe should block reconnect duplicates'
	]);
	expect(snapshot.turns).toHaveLength(1);
});

test('voice session waits for transcript stability before silence commit', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-stability-commit',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 50
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-a',
			isFinal: true,
			text: 'Go quietly'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(25);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-b',
			isFinal: true,
			text: 'Go quietly alone no harm will befall you'
		},
		type: 'final'
	});
	await Bun.sleep(80);

	const snapshot = await session.snapshot();

	expect(turnTexts).toEqual(['Go quietly alone no harm will befall you']);
	expect(snapshot.turns).toHaveLength(1);
	expect(snapshot.turns[0]?.text).toBe('Go quietly alone no harm will befall you');
});

test('voice session waits for transcript stability before committing vendor end-of-turn', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-vendor-stability-commit',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 60
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'vendor-final-a',
			isFinal: true,
			text: 'Go quietly'
		},
		type: 'final'
	});

	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});

	await Bun.sleep(25);

	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'vendor-final-b',
			isFinal: true,
			text: 'Go quietly alone no harm will befall you'
		},
		type: 'final'
	});

	await Bun.sleep(100);

	expect(turnTexts).toEqual(['Go quietly alone no harm will befall you']);
});

test('voice session extends vendor end-of-turn grace for pstn-like turn detection', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-vendor-pstn-grace',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 700,
			speechThreshold: 0.01,
			transcriptStabilityMs: 320
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'pstn-final-a',
			isFinal: true,
			text: 'Go quietly alone'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});

	await Bun.sleep(900);

	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'pstn-final-b',
			isFinal: true,
			text: 'No harm will befall you'
		},
		type: 'final'
	});

	await Bun.sleep(1_300);

	expect(turnTexts).toEqual(['Go quietly alone No harm will befall you']);
});

test('voice session uses fallback STT for empty-turn recovery', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-empty',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.text).toBe('Fallback transcript ready now');
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			trigger: 'empty-turn',
			minTextLength: 2,
			settleMs: 40
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	const emitted = withDeferred<void>();

	await session.connect(socket.socket);
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));

	void (async () => {
		await Bun.sleep(20);
		await fallbackAdapter.emitSession(
			0,
			'final',
			{
				receivedAt: Date.now(),
				transcript: {
					id: 'fallback-final',
					isFinal: true,
					text: 'Fallback transcript ready now'
				},
				type: 'final'
			}
		);
		emitted.resolve();
	})();

	await session.commitTurn('manual');
	await emitted.promise;
	await Bun.sleep(40);

	const snapshot = await session.snapshot();

	expect(snapshot.turns).toHaveLength(1);
	expect(snapshot.turns[0]?.text).toBe('Fallback transcript ready now');
	expect(fallbackAdapter.getOpenCalls()).toBe(1);
	expect(primaryAdapter.getSentAudioChunks()).toBeGreaterThan(0);
});

test('voice session prefers fallback transcript on low-confidence candidate', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-confidence',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.text).toBe('I am trying to book a demo call');
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			confidenceThreshold: 0.7,
			replayWindowMs: 8_000,
			settleMs: 40,
			trigger: 'low-confidence'
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	const emitted = withDeferred<void>();

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.2,
			id: 'primary-low',
			isFinal: true,
			text: 'I am trying to'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));

	void (async () => {
		await Bun.sleep(20);
		await fallbackAdapter.emitCurrent('final', {
			receivedAt: Date.now(),
			transcript: {
				confidence: 0.93,
				id: 'fallback-strong',
				isFinal: true,
				text: 'I am trying to book a demo call'
			},
			type: 'final'
		});
		emitted.resolve();
	})();

	await session.commitTurn('manual');
	await emitted.promise;
	await Bun.sleep(40);

	const snapshot = await session.snapshot();

	expect(snapshot.turns).toHaveLength(1);
	expect(snapshot.turns[0]?.text).toBe('I am trying to book a demo call');
});

test('voice session stores primary-turn quality metrics', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-primary-quality',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
				expect(turn.quality).toBeDefined();
				expect(turn.quality?.source).toBe('primary');
				expect(turn.quality?.fallbackUsed).toBe(false);
				expect(turn.quality?.selectedTranscriptCount).toBe(2);
				expect(turn.quality?.finalTranscriptCount).toBe(2);
				expect(turn.quality?.partialTranscriptCount).toBe(0);
				expect(turn.quality?.confidenceSampleCount).toBe(2);
				expect(Math.round((turn.quality?.averageConfidence ?? 0) * 100)).toBe(75);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.5,
			id: 'primary-quality-1',
			isFinal: true,
			text: 'hello'
		},
		type: 'final'
	});
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 1.0,
			id: 'primary-quality-2',
			isFinal: true,
			text: 'world'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(80);

	const snapshot = await session.snapshot();

	expect(turnTexts).toEqual(['hello world']);
	expect(snapshot.turns[0]?.quality?.source).toBe('primary');
	expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(false);
	expect(snapshot.turns[0]?.quality?.fallback).toBeUndefined();
	expect(snapshot.turns[0]?.quality?.selectedTranscriptCount).toBe(2);
	expect(snapshot.turns[0]?.quality?.confidenceSampleCount).toBe(2);
	expect(snapshot.turns[0]?.quality?.finalTranscriptCount).toBe(2);
});

test('voice session stores fallback quality metadata when fallback is selected', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-quality-selected',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.quality?.source).toBe('fallback');
				expect(turn.quality?.fallbackUsed).toBe(true);
				expect(turn.quality?.selectedTranscriptCount).toBe(1);
				expect(turn.quality?.finalTranscriptCount).toBe(1);
				expect(turn.quality?.partialTranscriptCount).toBe(0);
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			confidenceThreshold: 0.9,
			trigger: 'low-confidence',
			settleMs: 40
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	const emitted = withDeferred<void>();

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.2,
			id: 'primary-low',
			isFinal: true,
			text: 'hello'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));

	void (async () => {
		await Bun.sleep(20);
		await fallbackAdapter.emitSession(
			0,
			'final',
			{
				receivedAt: Date.now(),
				transcript: {
					confidence: 0.95,
					id: 'fallback-strong',
					isFinal: true,
					text: 'hello fallback response'
				},
				type: 'final'
			}
		);
		emitted.resolve();
	})();

	await session.commitTurn('manual');
	await emitted.promise;
	await Bun.sleep(40);

	const snapshot = await session.snapshot();

	expect(snapshot.turns[0]?.text).toBe('hello fallback response');
	expect(snapshot.turns[0]?.quality?.source).toBe('fallback');
	expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(true);
	expect(snapshot.turns[0]?.quality?.fallback?.attempted).toBe(true);
	expect(snapshot.turns[0]?.quality?.fallback?.selected).toBe(true);
	expect(snapshot.turns[0]?.quality?.fallback?.selectionReason).toBe(
		'word-count-margin'
	);
	expect(snapshot.turns[0]?.quality?.fallback?.primaryText).toBe('hello');
	expect(snapshot.turns[0]?.quality?.fallback?.fallbackText).toBe(
		'hello fallback response'
	);
	expect(snapshot.turns[0]?.quality?.selectedTranscriptCount).toBe(1);
	expect(snapshot.turns[0]?.quality?.finalTranscriptCount).toBe(1);
	expect(snapshot.turns[0]?.quality?.averageConfidence).toBeCloseTo(0.95);
});

test('voice session waits for delayed fallback transcripts when fallback trigger is always', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();
	const completed = withDeferred<void>();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-delayed-final',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.text).toBe('delayed fallback winner');
				expect(turn.quality?.source).toBe('fallback');
				expect(turn.quality?.fallbackUsed).toBe(true);
				completed.resolve();
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			completionTimeoutMs: 250,
			settleMs: 20,
			trigger: 'always'
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.9,
			id: 'primary-stable',
			isFinal: true,
			text: 'stable primary response'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));

	void (async () => {
		while (fallbackAdapter.getOpenCalls() === 0) {
			await Bun.sleep(5);
		}
		await Bun.sleep(80);
		await fallbackAdapter.emitSession(0, 'final', {
			receivedAt: Date.now(),
			transcript: {
				confidence: 0.99,
				id: 'fallback-delayed',
				isFinal: true,
				text: 'delayed fallback winner'
			},
			type: 'final'
		});
	})();

	await session.commitTurn('manual');
	await completed.promise;

	const snapshot = await session.snapshot();
	expect(snapshot.turns[0]?.text).toBe('delayed fallback winner');
	expect(snapshot.turns[0]?.quality?.source).toBe('fallback');
});

test('voice session prefers materially higher-confidence fallback when word counts are close', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();
	const completed = withDeferred<void>();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-confidence-wins',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.text).toBe('cleaner fallback answer today');
				expect(turn.quality?.source).toBe('fallback');
				completed.resolve();
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			completionTimeoutMs: 120,
			confidenceThreshold: 0.95,
			settleMs: 20,
			trigger: 'low-confidence'
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.32,
			id: 'primary-close-count',
			isFinal: true,
			text: 'noisy primary answer today'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));

	void (async () => {
		await Bun.sleep(20);
		await fallbackAdapter.emitSession(0, 'final', {
			receivedAt: Date.now(),
			transcript: {
				confidence: 0.96,
				id: 'fallback-close-count',
				isFinal: true,
				text: 'cleaner fallback answer today'
			},
			type: 'final'
		});
	})();

	await session.commitTurn('manual');
	await completed.promise;

	const snapshot = await session.snapshot();
	expect(snapshot.turns[0]?.text).toBe('cleaner fallback answer today');
	expect(snapshot.turns[0]?.quality?.source).toBe('fallback');
	expect(snapshot.turns[0]?.quality?.fallback?.selectionReason).toBe(
		'confidence-margin'
	);
});

test('voice session stores primary quality when fallback is configured but not selected', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();
	const completed = withDeferred<void>();

	const session = createVoiceSession({
		context: {},
		id: 'session-fallback-not-selected',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.quality?.source).toBe('primary');
				expect(turn.quality?.fallbackUsed).toBe(false);
				expect(fallbackAdapter.getOpenCalls()).toBe(0);
				completed.resolve();
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			confidenceThreshold: 0.4,
			minTextLength: 1,
			trigger: 'low-confidence'
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.8,
			id: 'primary-high',
			isFinal: true,
			text: 'stable phrase'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(80);
	await completed.promise;

	const snapshot = await session.snapshot();

	expect(snapshot.turns[0]?.quality?.source).toBe('primary');
	expect(snapshot.turns[0]?.quality?.fallbackUsed).toBe(false);
	expect(snapshot.turns[0]?.quality?.fallback).toBeUndefined();
	expect(fallbackAdapter.getOpenCalls()).toBe(0);
});

test('voice session passes phrase hints and lexicon to primary and fallback adapter opens', async () => {
	const primaryAdapter = createFakeAdapter();
	const fallbackAdapter = createFakeAdapter();
	const socket = createMockSocket();
	const lexicon = [
		{
			aliases: ['absoloot js'],
			pronunciation: 'ab-so-lute jay ess',
			text: 'AbsoluteJS'
		}
	];
	const phraseHints = [
		{
			aliases: ['absolute js'],
			text: 'AbsoluteJS'
		}
	];

	const session = createVoiceSession({
		context: {},
		id: 'session-phrase-hints',
		lexicon,
		logger: {},
		phraseHints,
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async () => {}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: primaryAdapter.adapter,
		sttFallback: {
			adapter: fallbackAdapter.adapter,
			confidenceThreshold: 0.95,
			trigger: 'always'
		},
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await primaryAdapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.4,
			id: 'primary-phrase-hints',
			isFinal: true,
			text: 'absolute'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));

	void (async () => {
		while (fallbackAdapter.getOpenCalls() === 0) {
			await Bun.sleep(5);
		}
		await fallbackAdapter.emitSession(0, 'final', {
			receivedAt: Date.now(),
			transcript: {
				confidence: 0.99,
				id: 'fallback-phrase-hints',
				isFinal: true,
				text: 'AbsoluteJS'
			},
			type: 'final'
		});
	})();

	await session.commitTurn('manual');

	expect(primaryAdapter.getOpenOptions()[0]?.lexicon).toEqual(lexicon);
	expect(primaryAdapter.getOpenOptions()[0]?.phraseHints).toEqual(phraseHints);
	expect(fallbackAdapter.getOpenOptions()[0]?.lexicon).toEqual(lexicon);
	expect(fallbackAdapter.getOpenOptions()[0]?.phraseHints).toEqual(phraseHints);
});

test('voice session applies committed-turn correction hook and stores diagnostics', async () => {
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const lexicon = [{ pronunciation: 'ab-so-lute jay ess', text: 'AbsoluteJS' }];
	const phraseHints = [{ text: 'AbsoluteJS' }];
	const completed = withDeferred<void>();

	const session = createVoiceSession({
		context: { locale: 'en-US' },
		id: 'session-correct-turn',
		lexicon,
		logger: {},
		phraseHints,
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			correctTurn: async ({ lexicon: resolvedLexicon, phraseHints: resolvedHints, text }) => {
				expect(resolvedHints[0]?.text).toBe('AbsoluteJS');
				expect(resolvedLexicon[0]?.pronunciation).toBe('ab-so-lute jay ess');
				return {
					metadata: { matchedHint: 'AbsoluteJS' },
					provider: 'test-corrector',
					reason: 'phrase-hint-normalization',
					text: text.replace('absolute js', 'AbsoluteJS')
				};
			},
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.text).toBe('please book an AbsoluteJS demo');
				expect(turn.quality?.correction?.attempted).toBe(true);
				expect(turn.quality?.correction?.changed).toBe(true);
				expect(turn.quality?.correction?.provider).toBe('test-corrector');
				expect(turn.quality?.correction?.reason).toBe(
					'phrase-hint-normalization'
				);
				completed.resolve();
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.92,
			id: 'primary-correct-turn',
			isFinal: true,
			text: 'please book an absolute js demo'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.commitTurn('manual');
	await completed.promise;

	const snapshot = await session.snapshot();
	expect(snapshot.turns[0]?.text).toBe('please book an AbsoluteJS demo');
	expect(snapshot.turns[0]?.quality?.correction?.metadata).toEqual({
		matchedHint: 'AbsoluteJS'
	});
});

test('voice session emits per-turn cost telemetry and stores cost diagnostics', async () => {
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const completed = withDeferred<void>();
	let estimatedCostUnits = 0;

	const session = createVoiceSession({
		context: {},
		costTelemetry: {
			fallbackPassCostUnit: 1.5,
			onTurnCost: async ({ estimate, turn }) => {
				estimatedCostUnits = estimate.estimatedRelativeCostUnits;
				expect(estimate.primaryAudioMs).toBeGreaterThan(0);
				expect(estimate.totalBillableAudioMs).toBe(estimate.primaryAudioMs);
				expect(turn.quality?.cost?.estimatedRelativeCostUnits).toBe(
					estimate.estimatedRelativeCostUnits
				);
			},
			primaryPassCostUnit: 1
		},
		id: 'session-cost-telemetry',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				expect(turn.quality?.cost?.primaryAudioMs).toBeGreaterThan(0);
				expect(turn.quality?.cost?.fallbackAttemptCount).toBe(0);
				completed.resolve();
			}
		},
		socket: socket.socket,
		store: createVoiceMemoryStore(),
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.95,
			id: 'primary-cost-turn',
			isFinal: true,
			text: 'cost telemetry turn'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.commitTurn('manual');
	await completed.promise;

	expect(estimatedCostUnits).toBeGreaterThan(0);
});

test('voice session preserves the best partial when later partials shrink', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-preserve-best-partial',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			profile: 'long-form',
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('partial', {
		receivedAt: Date.now(),
		transcript: {
			id: 'partial-full',
			isFinal: false,
			text: 'Go quietly alone no harm will befall you'
		},
		type: 'partial'
	});
	await adapter.emitCurrent('partial', {
		receivedAt: Date.now(),
		transcript: {
			id: 'partial-shrunk',
			isFinal: false,
			text: 'No harm will befall you'
		},
		type: 'partial'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	expect(turnTexts).toEqual(['Go quietly alone no harm will befall you']);
});

test('voice session combines timed final and partial fragments in one turn', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-combine-fragments',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			profile: 'long-form',
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			endedAtMs: 3_120,
			id: 'final-fragment',
			isFinal: true,
			startedAtMs: 1_200,
			text: 'Go quietly alone.'
		},
		type: 'final'
	});
	await adapter.emitCurrent('partial', {
		receivedAt: Date.now(),
		transcript: {
			endedAtMs: 5_145,
			id: 'partial-fragment',
			isFinal: false,
			startedAtMs: 3_865,
			text: 'No harm will befall you.'
		},
		type: 'partial'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	expect(turnTexts).toEqual(['Go quietly alone. No harm will befall you.']);
});

test('voice session conditions audio before sending it to the adapter', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();

	const session = createVoiceSession({
		audioConditioning: {
			enabled: true,
			maxGain: 4,
			noiseGateAttenuation: 0,
			noiseGateThreshold: 0.002,
			targetLevel: 0.1
		},
		context: {},
		id: 'session-audio-conditioning',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async () => {}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			profile: 'balanced',
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	const source = createSpeechChunk(1_200);
	await session.receiveAudio(source);

	const sent = adapter.getSentAudio()[0];
	expect(sent).toBeDefined();

	const originalSamples = Array.from(source);
	const conditionedSamples = Array.from(
		new Int16Array(
			sent!.buffer,
			sent!.byteOffset,
			Math.floor(sent!.byteLength / 2)
		)
	);

	expect(conditionedSamples.some((sample, index) => sample !== originalSamples[index])).toBe(
		true
	);
	expect(adapter.getSentAudioChunks()).toBe(1);
});

test('voice session can reopen the adapter after each committed turn', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-turn-scoped-stt',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		sttLifecycle: 'turn-scoped',
		turnDetection: {
			profile: 'balanced',
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-turn-1',
			isFinal: true,
			text: 'First turn'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	await session.receiveAudio(createSpeechChunk(16_000));
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'final-turn-2',
			isFinal: true,
			text: 'Second turn'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	expect(turnTexts).toEqual(['First turn', 'Second turn']);
	expect(adapter.getOpenCalls()).toBeGreaterThanOrEqual(2);
	expect(adapter.getCloseCalls()).toBeGreaterThanOrEqual(1);
});

test('voice session ignores stale adapter events after a turn-scoped reopen', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const turnTexts: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-ignore-stale-adapter-events',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turnTexts.push(turn.text);
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		sttLifecycle: 'turn-scoped',
		turnDetection: {
			profile: 'long-form',
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'stale-final-turn-1',
			isFinal: true,
			text: 'First turn'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(16_000));
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	expect(adapter.getSessionCount()).toBeGreaterThanOrEqual(1);
	await session.receiveAudio(createSpeechChunk(16_000));
	expect(adapter.getSessionCount()).toBeGreaterThanOrEqual(2);
	await adapter.emitSession(0, 'final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'stale-final-turn-2',
			isFinal: true,
			text: 'Old session bleed'
		},
		type: 'final'
	});
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'fresh-final-turn-2',
			isFinal: true,
			text: 'Second turn'
		},
		type: 'final'
	});
	await session.receiveAudio(createSpeechChunk(0));
	await Bun.sleep(60);

	expect(turnTexts).toEqual(['First turn', 'Second turn']);
});

test('voice session emits call lifecycle hooks for transfer and call end', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const lifecycleEvents: string[] = [];
	let onCompleteCalls = 0;

	const session = createVoiceSession({
		context: {},
		id: 'session-call-lifecycle-transfer',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onCallEnd: async ({ disposition, target }) => {
				lifecycleEvents.push(`end:${disposition}:${target ?? ''}`);
			},
			onCallStart: async () => {
				lifecycleEvents.push('start');
			},
			onComplete: async () => {
				onCompleteCalls += 1;
			},
			onTransfer: async ({ target }) => {
				lifecycleEvents.push(`transfer:${target}`);
			},
			onTurn: async () => {}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await session.transfer({
		metadata: {
			queue: 'billing'
		},
		target: 'billing-queue'
	});

	const snapshot = await session.snapshot();

	expect(onCompleteCalls).toBe(0);
	expect(lifecycleEvents).toEqual([
		'start',
		'transfer:billing-queue',
		'end:transferred:billing-queue'
	]);
	expect(snapshot.call?.disposition).toBe('transferred');
	expect(snapshot.call?.events.map((event) => event.type)).toEqual([
		'start',
		'transfer',
		'end'
	]);
});

test('voice session supports voicemail and no-answer lifecycle outcomes', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const voicemailSocket = createMockSocket();
	const noAnswerSocket = createMockSocket();
	const voicemailEvents: string[] = [];
	const noAnswerEvents: string[] = [];

	const voicemailSession = createVoiceSession({
		context: {},
		id: 'session-call-lifecycle-voicemail',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onCallEnd: async ({ disposition }) => {
				voicemailEvents.push(`end:${disposition}`);
			},
			onComplete: async () => {},
			onTurn: async () => {},
			onVoicemail: async () => {
				voicemailEvents.push('voicemail');
			}
		},
		socket: voicemailSocket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await voicemailSession.connect(voicemailSocket.socket);
	await voicemailSession.markVoicemail({
		metadata: {
			mailbox: 'support'
		}
	});

	expect((await voicemailSession.snapshot()).call?.disposition).toBe('voicemail');
	expect(voicemailEvents).toEqual(['voicemail', 'end:voicemail']);

	const noAnswerSession = createVoiceSession({
		context: {},
		id: 'session-call-lifecycle-no-answer',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onCallEnd: async ({ disposition }) => {
				noAnswerEvents.push(`end:${disposition}`);
			},
			onComplete: async () => {},
			onNoAnswer: async () => {
				noAnswerEvents.push('no-answer');
			},
			onTurn: async () => {}
		},
		socket: noAnswerSocket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await noAnswerSession.connect(noAnswerSocket.socket);
	await noAnswerSession.markNoAnswer();

	expect((await noAnswerSession.snapshot()).call?.disposition).toBe('no-answer');
	expect(noAnswerEvents).toEqual(['no-answer', 'end:no-answer']);
});

test('voice session executes lifecycle actions returned from onTurn results', async () => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	const events: string[] = [];

	const session = createVoiceSession({
		context: {},
		id: 'session-onturn-transfer-action',
		logger: {},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onCallEnd: async ({ disposition, target }) => {
				events.push(`end:${disposition}:${target ?? ''}`);
			},
			onComplete: async () => {
				events.push('complete');
			},
			onTransfer: async ({ target }) => {
				events.push(`transfer:${target}`);
			},
			onTurn: async () => ({
				assistantText: 'Transferring this call to billing.',
				transfer: {
					reason: 'caller-requested-transfer',
					target: 'billing'
				}
			})
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			id: 'transfer-final',
			isFinal: true,
			text: 'transfer me to billing'
		},
		type: 'final'
	});
	await adapter.emitCurrent('endOfTurn', {
		reason: 'vendor',
		receivedAt: Date.now(),
		type: 'endOfTurn'
	});
	await Bun.sleep(40);

	expect(events).toEqual([
		'transfer:billing',
		'end:transferred:billing'
	]);
	expect(
		socket.messages.some((message) =>
			message.includes('Transferring this call to billing.')
		)
	).toBe(true);
	expect((await session.snapshot()).call?.disposition).toBe('transferred');
});
