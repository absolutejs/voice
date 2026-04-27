import { expect, test } from 'bun:test';
import { createVoiceMemoryStore } from '../src/memoryStore';
import { createPlivoMediaStreamBridge } from '../src/telephony/plivo';
import { createTelnyxMediaStreamBridge } from '../src/telephony/telnyx';
import { encodeTwilioMulawBase64 } from '../src/telephony/twilio';
import type {
	AudioChunk,
	AudioFormat,
	STTAdapterOpenOptions,
	STTAdapterSession,
	TTSAdapterSession,
	Transcript
} from '../src/types';

const waitFor = async (condition: () => boolean) => {
	const start = Date.now();
	while (Date.now() - start < 1_000) {
		if (condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('Timed out waiting for condition.');
};

const normalizeAudio = (audio: AudioChunk) =>
	audio instanceof Uint8Array
		? audio
		: audio instanceof ArrayBuffer
			? new Uint8Array(audio)
			: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);

const createFakeSTTAdapter = (inputSpy: Uint8Array[]) => ({
	kind: 'stt' as const,
	open: (_options: STTAdapterOpenOptions): STTAdapterSession => {
		const endOfTurnListeners = new Set<(payload: { reason: 'vendor'; receivedAt: number; type: 'endOfTurn' }) => void>();
		const finalListeners = new Set<(payload: { receivedAt: number; transcript: Transcript; type: 'final' }) => void>();
		const closeListeners = new Set<(payload: { type: 'close' }) => void>();
		let delivered = false;

		return {
			close: async () => {
				for (const handler of closeListeners) {
					handler({ type: 'close' });
				}
			},
			on: (event, handler) => {
				if (event === 'final') {
					finalListeners.add(handler as (payload: { receivedAt: number; transcript: Transcript; type: 'final' }) => void);
				}
				if (event === 'endOfTurn') {
					endOfTurnListeners.add(handler as (payload: { reason: 'vendor'; receivedAt: number; type: 'endOfTurn' }) => void);
				}
				if (event === 'close') {
					closeListeners.add(handler as (payload: { type: 'close' }) => void);
				}
				return () => {};
			},
			send: async (audio: AudioChunk) => {
				inputSpy.push(normalizeAudio(audio));
				if (delivered) {
					return;
				}
				delivered = true;
				const receivedAt = Date.now();
				for (const handler of finalListeners) {
					handler({
						receivedAt,
						transcript: {
							id: 'final-1',
							isFinal: true,
							text: 'hello'
						},
						type: 'final'
					});
				}
				for (const handler of endOfTurnListeners) {
					handler({
						reason: 'vendor',
						receivedAt,
						type: 'endOfTurn'
					});
				}
			}
		};
	}
});

const createFakeTTSAdapter = () => ({
	kind: 'tts' as const,
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
			error: new Set<
				(payload: { error: Error; recoverable: boolean; type: 'error' }) => void
			>()
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
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 16_000
						},
						receivedAt: Date.now(),
						type: 'audio'
					});
				}
			}
		};
	}
});

test('Telnyx media bridge adapts provider websocket events to the voice session', async () => {
	const sentMessages: string[] = [];
	const receivedAudio: Uint8Array[] = [];
	const bridge = createTelnyxMediaStreamBridge(
		{
			close: () => {},
			send: (data) => {
				sentMessages.push(data);
			}
		},
		{
			context: {},
			onComplete: async () => {},
			onTurn: async () => ({ assistantText: 'Copy that.' }),
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
			call_control_id: 'telnyx-call-1',
			call_session_id: 'telnyx-session-1',
			media_format: {
				channels: 1,
				encoding: 'PCMU',
				sample_rate: 8000
			}
		},
		stream_id: 'telnyx-stream-1'
	});
	await bridge.handleMessage({
		event: 'media',
		media: {
			payload: encodeTwilioMulawBase64(new Int16Array([500, -500, 1_500, -1_500])),
			track: 'inbound'
		},
		stream_id: 'telnyx-stream-1'
	});

	await waitFor(() =>
		sentMessages.map((message) => JSON.parse(message)).some((message) => message.event === 'media')
	);

	const outbound = sentMessages.map((message) => JSON.parse(message));
	expect(bridge.getSessionId()).toBe('telnyx-session-1');
	expect(bridge.getStreamId()).toBe('telnyx-stream-1');
	expect(receivedAudio[0]!.byteLength).toBeGreaterThan(0);
	expect(outbound.some((message) => message.event === 'media')).toBe(true);
	expect(outbound.some((message) => message.event === 'mark')).toBe(true);
});

test('Plivo media bridge sends playAudio and checkpoint events for outbound voice audio', async () => {
	const sentMessages: string[] = [];
	const receivedAudio: Uint8Array[] = [];
	const bridge = createPlivoMediaStreamBridge(
		{
			close: () => {},
			send: (data) => {
				sentMessages.push(data);
			}
		},
		{
			context: {},
			onComplete: async () => {},
			onTurn: async () => ({ assistantText: 'Copy that.' }),
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
			callId: 'plivo-call-1',
			extra_headers: 'sessionId=plivo-session-1;scenarioId=demo',
			streamId: 'plivo-stream-1'
		},
		streamId: 'plivo-stream-1'
	});
	await bridge.handleMessage({
		event: 'media',
		media: {
			payload: encodeTwilioMulawBase64(new Int16Array([500, -500, 1_500, -1_500])),
			track: 'inbound'
		},
		streamId: 'plivo-stream-1'
	});

	await waitFor(() =>
		sentMessages.map((message) => JSON.parse(message)).some((message) => message.event === 'playAudio')
	);

	const outbound = sentMessages.map((message) => JSON.parse(message));
	expect(bridge.getSessionId()).toBe('plivo-session-1');
	expect(bridge.getStreamId()).toBe('plivo-stream-1');
	expect(receivedAudio[0]!.byteLength).toBeGreaterThan(0);
	expect(outbound.some((message) => message.event === 'playAudio')).toBe(true);
	expect(outbound.some((message) => message.event === 'checkpoint')).toBe(true);
});
