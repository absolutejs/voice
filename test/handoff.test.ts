import { expect, test } from 'bun:test';
import {
	createVoiceMemoryStore,
	createVoiceSession,
	createVoiceTwilioRedirectHandoffAdapter,
	createVoiceWebhookHandoffAdapter
} from '../src';
import { createVoiceMemoryTraceEventStore } from '../src/trace';
import type {
	AudioChunk,
	STTAdapter,
	STTAdapterOpenOptions,
	STTAdapterSession,
	STTSessionEventMap,
	VoiceSocket
} from '../src/types';

type ListenerMap = {
	[K in keyof STTSessionEventMap]: Array<
		(payload: STTSessionEventMap[K]) => void | Promise<void>
	>;
};

const createFakeAdapter = () => {
	const adapter: STTAdapter = {
		kind: 'stt',
		open: (_options: STTAdapterOpenOptions) => {
			const listeners: ListenerMap = {
				close: [],
				endOfTurn: [],
				error: [],
				final: [],
				partial: []
			};
			const session: STTAdapterSession = {
				close: async () => {},
				on: (event, handler) => {
					listeners[event].push(handler as never);
					return () => {};
				},
				send: async (_audio: AudioChunk) => {}
			};
			return session;
		}
	};

	return adapter;
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

test('voice session runs configured handoff adapters for transfer lifecycle actions', async () => {
	const requests: Array<{
		body: Record<string, unknown>;
		headers: Headers;
		url: string;
	}> = [];
	const trace = createVoiceMemoryTraceEventStore();
	const socket = createMockSocket();
	const session = createVoiceSession({
		context: {},
		handoff: {
			adapters: [
				createVoiceWebhookHandoffAdapter({
					fetch: async (url, init) => {
						requests.push({
							body: JSON.parse(String(init?.body ?? '{}')),
							headers: new Headers(init?.headers),
							url: String(url)
						});
						return new Response(null, {
							status: 202
						});
					},
					id: 'ops-transfer',
					signingSecret: 'secret',
					url: 'https://example.test/voice/handoff'
				})
			]
		},
		id: 'session-handoff-transfer',
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
		store: createVoiceMemoryStore(),
		stt: createFakeAdapter(),
		sttLifecycle: 'continuous',
		trace,
		turnDetection: {
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		}
	});

	await session.connect(socket.socket);
	await session.transfer({
		metadata: {
			source: 'button'
		},
		reason: 'caller-requested-transfer',
		target: 'billing'
	});

	expect(requests).toHaveLength(1);
	expect(requests[0]).toMatchObject({
		body: {
			action: 'transfer',
			metadata: {
				source: 'button'
			},
			reason: 'caller-requested-transfer',
			target: 'billing'
		},
		url: 'https://example.test/voice/handoff'
	});
	expect(requests[0]?.headers.get('x-absolutejs-signature')).toStartWith(
		'sha256='
	);
	expect(await trace.list({ type: 'call.handoff' })).toMatchObject([
		{
			payload: {
				action: 'transfer',
				deliveries: {
					'ops-transfer': {
						status: 'delivered'
					}
				},
				status: 'delivered',
				target: 'billing'
			}
		}
	]);
});

test('Twilio redirect handoff adapter posts TwiML to the active call', async () => {
	const requests: Array<{
		body: string;
		headers: Headers;
		url: string;
	}> = [];
	const adapter = createVoiceTwilioRedirectHandoffAdapter({
		accountSid: 'AC123',
		authToken: 'token',
		fetch: async (url, init) => {
			requests.push({
				body: String(init?.body ?? ''),
				headers: new Headers(init?.headers),
				url: String(url)
			});
			return new Response(null, {
				status: 200
			});
		}
	});
	const result = await adapter.handoff({
		action: 'transfer',
		api: {} as never,
		context: {},
		metadata: {
			callSid: 'CA456'
		},
		session: {
			committedTurnIds: [],
			createdAt: 100,
			currentTurn: {
				finalText: '',
				partialText: '',
				transcripts: []
			},
			id: 'session-twilio-handoff',
			reconnect: {
				attempts: 0
			},
			status: 'active',
			transcripts: [],
			turns: []
		},
		target: '+15551234567'
	});

	expect(result).toMatchObject({
		deliveredTo:
			'https://api.twilio.com/2010-04-01/Accounts/AC123/Calls/CA456.json',
		status: 'delivered'
	});
	expect(requests[0]?.body).toContain(
		'Twiml=%3CResponse%3E%3CDial%3E%2B15551234567%3C%2FDial%3E%3C%2FResponse%3E'
	);
	expect(requests[0]?.headers.get('authorization')).toStartWith('Basic ');
});
