import { expect, test } from 'bun:test';
import { createOpenAIRealtimeAdapter } from '../src/openaiRealtime';

type WebSocketListener = (event: Record<string, unknown>) => void;

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static reset() {
		MockWebSocket.instances = [];
	}

	readyState = 1;
	sent: string[] = [];
	url: string;
	private listeners = new Map<string, Set<WebSocketListener>>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		queueMicrotask(() => this.emit('open', {}));
	}

	addEventListener(
		event: string,
		handler: WebSocketListener,
		options?: { once?: boolean }
	) {
		let listeners = this.listeners.get(event);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(event, listeners);
		}

		const listener: WebSocketListener = options?.once
			? (value) => {
					this.listeners.get(event)?.delete(listener);
					handler(value);
			  }
			: handler;
		listeners.add(listener);
	}

	close(code?: number, reason?: string) {
		this.readyState = 3;
		this.emit('close', { code, reason });
	}

	emitMessage(payload: Record<string, unknown>) {
		this.emit('message', { data: JSON.stringify(payload) });
	}

	send(data: string) {
		this.sent.push(data);
	}

	private emit(event: string, payload: Record<string, unknown>) {
		for (const listener of this.listeners.get(event) ?? []) {
			listener(payload);
		}
	}
}

const openMockSession = async (
	options: Parameters<typeof createOpenAIRealtimeAdapter>[0] = {
		apiKey: 'test-key'
	}
) => {
	MockWebSocket.reset();
	const adapter = createOpenAIRealtimeAdapter({
		webSocket: MockWebSocket as never,
		...options
	});
	const sessionPromise = adapter.open({
		format: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 24_000
		},
		sessionId: 'openai-realtime-unit'
	});
	await Bun.sleep(0);
	const socket = MockWebSocket.instances[0]!;
	socket.emitMessage({ type: 'session.updated' });
	const session = await sessionPromise;

	return { session, socket };
};

const parseSent = (socket: MockWebSocket) =>
	socket.sent.map((message) => JSON.parse(message) as Record<string, unknown>);

test('createOpenAIRealtimeAdapter configures an OpenAI realtime websocket session', async () => {
	const { session, socket } = await openMockSession({
		apiKey: 'test-key',
		instructions: 'Be concise.',
		model: 'gpt-realtime-mini',
		voice: 'marin'
	});

	const sent = parseSent(socket);
	expect(socket.url).toBe(
		'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini'
	);
	expect(sent[0]).toMatchObject({
		session: {
			audio: {
				input: {
					format: { rate: 24000, type: 'audio/pcm' },
					turn_detection: null
				},
				output: {
					format: { rate: 24000, type: 'audio/pcm' },
					voice: 'marin'
				}
			},
			instructions: 'Be concise.',
			output_modalities: ['audio'],
			type: 'realtime'
		},
		type: 'session.update'
	});

	await session.close('done');
});

test('createOpenAIRealtimeAdapter sends text turns and emits returned audio', async () => {
	const { session, socket } = await openMockSession();
	const finals: string[] = [];
	const chunks: number[][] = [];
	session.on('final', (event) => {
		finals.push(event.transcript.text ?? '');
	});
	session.on('audio', (event) => {
		expect(event.format).toEqual({
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 24_000
		});
		chunks.push(Array.from(event.chunk as Uint8Array));
	});

	await session.send('Say hello.');
	socket.emitMessage({
		delta: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString('base64'),
		type: 'response.output_audio.delta'
	});

	const sent = parseSent(socket);
	expect(finals).toEqual(['Say hello.']);
	expect(sent.at(-2)).toMatchObject({
		item: {
			content: [{ text: 'Say hello.', type: 'input_text' }],
			role: 'user',
			type: 'message'
		},
		type: 'conversation.item.create'
	});
	expect(sent.at(-1)).toMatchObject({ type: 'response.create' });
	expect(chunks).toEqual([[1, 2, 3, 4]]);

	await session.close('done');
});

test('createOpenAIRealtimeAdapter streams audio input and commits after silence', async () => {
	const { session, socket } = await openMockSession({
		apiKey: 'test-key',
		autoCommitSilenceMs: 5
	});

	await session.send(new Uint8Array([0, 1, 2, 3]));
	await Bun.sleep(15);

	const sent = parseSent(socket);
	expect(sent.at(-3)).toEqual({
		audio: Buffer.from(new Uint8Array([0, 1, 2, 3])).toString('base64'),
		type: 'input_audio_buffer.append'
	});
	expect(sent.at(-2)).toEqual({ type: 'input_audio_buffer.commit' });
	expect(sent.at(-1)).toMatchObject({ type: 'response.create' });

	await session.close('done');
});

test('createOpenAIRealtimeAdapter dedupes final input transcripts', async () => {
	const { session, socket } = await openMockSession();
	const finals: string[] = [];
	const turns: string[] = [];
	session.on('final', (event) => {
		finals.push(event.transcript.text ?? '');
	});
	session.on('endOfTurn', (event) => {
		turns.push(event.reason);
	});

	socket.emitMessage({
		item_id: 'item-1',
		transcript: 'hello world',
		type: 'conversation.item.input_audio_transcription.completed'
	});
	socket.emitMessage({
		item_id: 'item-1',
		transcript: 'hello world',
		type: 'conversation.item.input_audio_transcription.completed'
	});

	expect(finals).toEqual(['hello world']);
	expect(turns).toEqual(['vendor']);

	await session.close('done');
});

test('createOpenAIRealtimeAdapter only emits response transcripts when enabled', async () => {
	const disabled = await openMockSession({
		apiKey: 'test-key',
		emitResponseTranscripts: false
	});
	const disabledFinals: string[] = [];
	disabled.session.on('final', (event) => {
		disabledFinals.push(event.transcript.text ?? '');
	});
	disabled.socket.emitMessage({
		transcript: 'hidden response',
		type: 'response.output_audio_transcript.done'
	});
	expect(disabledFinals).toEqual([]);
	await disabled.session.close('done');

	const enabled = await openMockSession({
		apiKey: 'test-key',
		emitResponseTranscripts: true
	});
	const enabledFinals: string[] = [];
	enabled.session.on('final', (event) => {
		enabledFinals.push(event.transcript.text ?? '');
	});
	enabled.socket.emitMessage({
		transcript: 'visible response',
		type: 'response.output_audio_transcript.done'
	});
	expect(enabledFinals).toEqual(['visible response']);
	await enabled.session.close('done');
});
