import { expect, test } from 'bun:test';
import {
	createTwilioMediaStreamBridge,
	createTwilioVoiceResponse,
	encodeTwilioMulawBase64,
	transcodePCMToTwilioOutboundPayload,
	transcodeTwilioInboundPayloadToPCM16
} from '../src/telephony/twilio';
import { createVoiceMemoryStore } from '../src/memoryStore';
import type {
	AudioChunk,
	AudioFormat,
	STTAdapter,
	STTAdapterOpenOptions,
	STTAdapterSession,
	TTSAdapter,
	TTSAdapterSession,
	Transcript
} from '../src/types';

const DEFAULT_PCM16_FORMAT: AudioFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 16_000
};

const DEFAULT_MULAW_FORMAT: AudioFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'mulaw',
	sampleRateHz: 8_000
};

const createFakeSTTAdapter = (inputSpy: Uint8Array[]) => {
	return {
		kind: 'stt',
		open: (_options: STTAdapterOpenOptions): STTAdapterSession => {
			const listeners = {
				close: new Set<(payload: { type: 'close' }) => void>(),
				endOfTurn: new Set<(payload: { reason: 'vendor'; receivedAt: number; type: 'endOfTurn' }) => void>(),
				error: new Set<(payload: { error: Error; recoverable: boolean; type: 'error' }) => void>(),
				final: new Set<(payload: { receivedAt: number; transcript: Transcript; type: 'final' }) => void>(),
				partial: new Set<(payload: { receivedAt: number; transcript: Transcript; type: 'partial' }) => void>()
			};
			let delivered = false;

			return {
				close: async () => {
					for (const handler of listeners.close) {
						handler({ type: 'close' });
					}
				},
				on: (event, handler) => {
					(listeners[event] as Set<typeof handler>).add(handler as never);
					return () => {
						(listeners[event] as Set<typeof handler>).delete(handler as never);
					};
				},
				send: async (audio: AudioChunk) => {
					const normalized =
						audio instanceof Uint8Array
							? audio
							: audio instanceof ArrayBuffer
								? new Uint8Array(audio)
								: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
					inputSpy.push(normalized);

					if (delivered) {
						return;
					}

					delivered = true;
					const receivedAt = Date.now();
					for (const handler of listeners.final) {
						handler({
							receivedAt,
							transcript: {
								id: 'telephony-final-1',
								isFinal: true,
								text: 'hello from the phone'
							},
							type: 'final'
						});
					}
					for (const handler of listeners.endOfTurn) {
						handler({
							receivedAt,
							reason: 'vendor',
							type: 'endOfTurn'
						});
					}
				}
			};
		}
	} satisfies STTAdapter;
};

const createFakeTTSAdapter = () => {
	return {
		kind: 'tts',
		open: (): TTSAdapterSession => {
			const listeners = {
				audio: new Set<
					(payload: {
						chunk: Uint8Array;
						format: AudioFormat;
						receivedAt: number;
						type: 'audio';
					}) => void
				>(),
				close: new Set<(payload: { type: 'close' }) => void>(),
				error: new Set<(payload: { error: Error; recoverable: boolean; type: 'error' }) => void>()
			};

			return {
				close: async () => {
					for (const handler of listeners.close) {
						handler({ type: 'close' });
					}
				},
				on: (event, handler) => {
					(listeners[event] as Set<typeof handler>).add(handler as never);
					return () => {
						(listeners[event] as Set<typeof handler>).delete(handler as never);
					};
				},
				send: async () => {
					const chunk = new Uint8Array(320);
					for (let index = 0; index < chunk.length; index += 2) {
						chunk[index] = 0xff;
						chunk[index + 1] = 0x1f;
					}
					for (const handler of listeners.audio) {
						handler({
							chunk,
							format: DEFAULT_PCM16_FORMAT,
							receivedAt: Date.now(),
							type: 'audio'
						});
					}
				}
			};
		}
	} satisfies TTSAdapter;
};

const waitFor = async (
	check: () => boolean,
	timeoutMs = 200,
	intervalMs = 10
) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (check()) {
			return;
		}
		await Bun.sleep(intervalMs);
	}
};

test('createTwilioVoiceResponse emits TwiML with stream parameters', () => {
	const xml = createTwilioVoiceResponse({
		parameters: {
			scenarioId: 'intake',
			sessionId: 'voice-123'
		},
		streamName: 'absolute-voice',
		streamUrl: 'wss://example.com/voice/phone',
		track: 'both_tracks'
	});

	expect(xml).toContain('<Connect>');
	expect(xml).toContain('wss://example.com/voice/phone');
	expect(xml).toContain('sessionId');
	expect(xml).toContain('voice-123');
});

test('twilio payload transcoding converts narrowband mulaw into voice PCM and back', () => {
	const inbound = encodeTwilioMulawBase64(
		new Int16Array([0, 2_000, -2_000, 5_000, -5_000])
	);
	const pcm16 = transcodeTwilioInboundPayloadToPCM16(inbound);
	expect(pcm16.byteLength).toBeGreaterThan(10);

	const outbound = transcodePCMToTwilioOutboundPayload(pcm16, DEFAULT_PCM16_FORMAT);
	expect(typeof outbound).toBe('string');
	expect(outbound.length).toBeGreaterThan(0);
});

test('twilio outbound payload pass-through preserves native mulaw telephony audio', () => {
	const rawMulawBytes = Uint8Array.from([0xff, 0x7f, 0x00, 0x80]);
	const outbound = transcodePCMToTwilioOutboundPayload(
		rawMulawBytes,
		DEFAULT_MULAW_FORMAT
	);

	expect(outbound).toBe(Buffer.from(rawMulawBytes).toString('base64'));
});

test('twilio bridge forwards inbound media to the voice session and streams outbound audio back', async () => {
	const sentMessages: string[] = [];
	const receivedAudio: Uint8Array[] = [];
	const bridge = createTwilioMediaStreamBridge(
		{
			close: () => {},
			send: (data) => {
				sentMessages.push(data);
			}
		},
		{
			context: {},
			onComplete: async () => {},
			onTurn: async () => ({
				assistantText: 'Copy that.'
			}),
			session: createVoiceMemoryStore(),
			stt: createFakeSTTAdapter(receivedAudio),
			tts: createFakeTTSAdapter(),
			turnDetection: {
				transcriptStabilityMs: 0
			}
		}
	);

	await bridge.handleMessage({
		event: 'start',
		start: {
			callSid: 'CA123',
			customParameters: {
				scenarioId: 'telephony-intake',
				sessionId: 'phone-session'
			},
			streamSid: 'MZ123'
		},
		streamSid: 'MZ123'
	});

	await bridge.handleMessage({
		event: 'media',
		media: {
			payload: encodeTwilioMulawBase64(
				new Int16Array([500, -500, 1_500, -1_500, 2_500, -2_500])
			),
			track: 'inbound'
		},
		streamSid: 'MZ123'
	});

	await waitFor(() => {
		const outbound = sentMessages.map((message) => JSON.parse(message));
		return outbound.some((message) => message.event === 'media');
	});

	expect(bridge.getSessionId()).toBe('phone-session');
	expect(bridge.getStreamSid()).toBe('MZ123');
	expect(receivedAudio.length).toBe(1);
	expect(receivedAudio[0]!.byteLength).toBeGreaterThan(12);

	const outbound = sentMessages.map((message) => JSON.parse(message));
	expect(outbound.some((message) => message.event === 'media')).toBe(true);
	expect(outbound.some((message) => message.event === 'mark')).toBe(true);

	await bridge.handleMessage({
		event: 'media',
		media: {
			payload: encodeTwilioMulawBase64(new Int16Array([200, -200, 200, -200])),
			track: 'inbound'
		},
		streamSid: 'MZ123'
	});

	await waitFor(() => {
		const outbound = sentMessages.map((message) => JSON.parse(message));
		return outbound.some((message) => message.event === 'clear');
	});
	const refreshed = sentMessages.map((message) => JSON.parse(message));
	expect(refreshed.some((message) => message.event === 'clear')).toBe(true);
});

test('twilio bridge can emit a compact call review artifact on close', async () => {
	const sentMessages: string[] = [];
	const receivedAudio: Uint8Array[] = [];
	let reviewArtifact:
		| {
				summary: {
					pass: boolean;
					turnCount?: number;
				};
				transcript: {
					actual: string;
				};
				timeline: Array<{
					event: string;
					source: string;
				}>;
		  }
		| undefined;

	const bridge = createTwilioMediaStreamBridge(
		{
			close: () => {},
			send: (data) => {
				sentMessages.push(data);
			}
		},
		{
			context: {},
			onComplete: async () => {},
			onTurn: async () => ({
				assistantText: 'Copy that.'
			}),
			review: {
				onArtifact: async (artifact) => {
					reviewArtifact = artifact;
				},
				title: 'Phone call'
			},
			session: createVoiceMemoryStore(),
			stt: createFakeSTTAdapter(receivedAudio),
			tts: createFakeTTSAdapter(),
			turnDetection: {
				transcriptStabilityMs: 0
			}
		}
	);

	await bridge.handleMessage({
		event: 'start',
		start: {
			callSid: 'CA123',
			customParameters: {
				sessionId: 'phone-session-review'
			},
			streamSid: 'MZ123'
		},
		streamSid: 'MZ123'
	});

	await bridge.handleMessage({
		event: 'media',
		media: {
			payload: encodeTwilioMulawBase64(
				new Int16Array([500, -500, 1_500, -1_500, 2_500, -2_500])
			),
			track: 'inbound'
		},
		streamSid: 'MZ123'
	});

	await waitFor(() => {
		const outbound = sentMessages.map((message) => JSON.parse(message));
		return outbound.some((message) => message.event === 'media');
	});
	await bridge.close('test-complete');
	await waitFor(() => reviewArtifact !== undefined, 300);

	expect(reviewArtifact?.summary.pass).toBe(true);
	expect(reviewArtifact?.summary.turnCount).toBe(1);
	expect(reviewArtifact?.transcript.actual).toBe('hello from the phone');
	expect(
		reviewArtifact?.timeline.some(
			(entry) => entry.source === 'turn' && entry.event === 'commit'
		)
	).toBe(true);
	expect(
		reviewArtifact?.timeline.some(
			(entry) => entry.source === 'twilio' && entry.event === 'media'
		)
	).toBe(true);
});
