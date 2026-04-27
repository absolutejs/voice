import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceSessionListRoutes,
	createVoiceSessionReplayHTMLHandler,
	createVoiceSessionReplayRoutes,
	createVoiceTraceEvent,
	renderVoiceSessionsHTML,
	summarizeVoiceSessions,
	summarizeVoiceSessionReplay
} from '../src';

const createReplayEvents = () => [
	createVoiceTraceEvent({
		at: 1_000,
		payload: {
			isFinal: true,
			text: 'hello'
		},
		sessionId: 'session-replay',
		turnId: 'turn-1',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 1_010,
		payload: {
			text: 'hello'
		},
		sessionId: 'session-replay',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceTraceEvent({
		at: 1_020,
		payload: {
			assistantId: 'support',
			elapsedMs: 20,
			outcome: 'completed',
			variantId: 'openai'
		},
		sessionId: 'session-replay',
		turnId: 'turn-1',
		type: 'assistant.run'
	}),
	createVoiceTraceEvent({
		at: 1_030,
		payload: {
			text: 'done'
		},
		sessionId: 'session-replay',
		turnId: 'turn-1',
		type: 'turn.assistant'
	}),
	createVoiceTraceEvent({
		at: 1_040,
		payload: {
			error: 'OpenAI voice assistant model failed: HTTP 429',
			provider: 'openai',
			providerStatus: 'error'
		},
		sessionId: 'session-replay',
		turnId: 'turn-1',
		type: 'session.error'
	}),
	createVoiceTraceEvent({
		at: 2_000,
		payload: {
			text: 'other session'
		},
		sessionId: 'session-other',
		turnId: 'turn-1',
		type: 'turn.committed'
	})
];

test('summarizeVoiceSessionReplay builds a per-session timeline and turn summary', async () => {
	const replay = await summarizeVoiceSessionReplay({
		events: createReplayEvents(),
		sessionId: 'session-replay'
	});

	expect(replay.summary).toMatchObject({
		errorCount: 1,
		sessionId: 'session-replay',
		turnCount: 1
	});
	expect(replay.events).toHaveLength(5);
	expect(replay.timeline[0]).toMatchObject({
		offsetMs: 0,
		type: 'turn.transcript'
	});
	expect(replay.turns).toMatchObject([
		{
			assistantReplies: ['done'],
			committedText: 'hello',
			errors: [
				{
					provider: 'openai'
				}
			],
			id: 'turn-1',
			transcripts: [
				{
					isFinal: true,
					text: 'hello'
				}
			]
		}
	]);
});

test('createVoiceSessionReplayHTMLHandler returns replay html for a session', async () => {
	const response = await createVoiceSessionReplayHTMLHandler({
		events: createReplayEvents()
	})({
		params: {
			sessionId: 'session-replay'
		}
	});

	expect(response.headers.get('Content-Type')).toBe(
		'text/html; charset=utf-8'
	);
	expect(await response.text()).toContain('Voice Session session-replay');
});

test('createVoiceSessionReplayRoutes exposes json and html replay endpoints', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createReplayEvents()) {
		await store.append(event);
	}
	const routes = createVoiceSessionReplayRoutes({
		store
	});
	const json = await routes.handle(
		new Request('http://localhost/api/voice-sessions/session-replay/replay')
	);
	const html = await routes.handle(
		new Request('http://localhost/api/voice-sessions/session-replay/replay/htmx')
	);

	expect(await json.json()).toMatchObject({
		sessionId: 'session-replay',
		summary: {
			turnCount: 1
		}
	});
	expect(await html.text()).toContain('Voice Session session-replay');
});

test('summarizeVoiceSessions lists searchable sessions with replay links', async () => {
	const sessions = await summarizeVoiceSessions({
		events: createReplayEvents(),
		q: 'replay'
	});

	expect(sessions).toMatchObject([
		{
			errorCount: 1,
			eventCount: 5,
			providerErrors: {
				openai: 1
			},
			providers: ['openai'],
			replayHref: '/api/voice-sessions/session-replay/replay/htmx',
			sessionId: 'session-replay',
			status: 'failed',
			turnCount: 1
		}
	]);
	expect(
		await summarizeVoiceSessions({
			events: createReplayEvents(),
			provider: 'openai',
			status: 'failed'
		})
	).toHaveLength(1);
});

test('renderVoiceSessionsHTML renders replay links', async () => {
	const sessions = await summarizeVoiceSessions({
		events: createReplayEvents()
	});

	expect(renderVoiceSessionsHTML(sessions)).toContain('Open replay');
});

test('createVoiceSessionListRoutes exposes json and html session list endpoints', async () => {
	const store = createVoiceMemoryTraceEventStore();
	for (const event of createReplayEvents()) {
		await store.append(event);
	}
	const routes = createVoiceSessionListRoutes({
		store
	});
	const json = await routes.handle(
		new Request('http://localhost/api/voice-sessions?status=failed')
	);
	const html = await routes.handle(
		new Request('http://localhost/api/voice-sessions/htmx?provider=openai')
	);

	expect(await json.json()).toMatchObject([
		{
			sessionId: 'session-replay',
			status: 'failed'
		}
	]);
	expect(await html.text()).toContain('session-replay');
});
