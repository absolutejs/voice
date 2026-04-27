import { expect, test } from 'bun:test';
import {
	createVoiceOpsWebhookReceiverRoutes,
	createVoiceOpsWebhookSink,
	createVoiceReviewSavedEvent,
	createStoredVoiceCallReviewArtifact,
	deliverVoiceIntegrationEventToSinks,
	verifyVoiceOpsWebhookSignature
} from '../src';

test('createVoiceOpsWebhookSink emits a portable signed ops envelope', async () => {
	const requests: Array<{
		body: string;
		headers: Headers;
		url: string;
	}> = [];
	const event = createVoiceReviewSavedEvent(
		createStoredVoiceCallReviewArtifact('review-webhook', {
			errors: [],
			generatedAt: 100,
			latencyBreakdown: [],
			notes: [],
			postCall: {
				label: 'Transferred',
				recommendedAction: 'Confirm the handoff.',
				summary: 'The caller was transferred.',
				target: 'billing'
			},
			summary: {
				outcome: 'transferred',
				pass: true,
				turnCount: 2
			},
			title: 'Webhook Review',
			timeline: [],
			transcript: {
				actual: 'Please transfer me.'
			}
		})
	);
	const eventWithSession = {
		...event,
		payload: {
			...event.payload,
			priority: 'high',
			queue: 'billing',
			scenarioId: 'support-demo',
			sessionId: 'session-webhook'
		}
	};

	const delivered = await deliverVoiceIntegrationEventToSinks({
		event: eventWithSession,
		sinks: [
			createVoiceOpsWebhookSink({
				baseUrl: 'https://voice.example.test',
				fetch: async (url, init) => {
					requests.push({
						body: String(init?.body ?? ''),
						headers: new Headers(init?.headers),
						url: String(url)
					});
					return new Response(null, {
						status: 202
					});
				},
				id: 'ops-webhook',
				signingSecret: 'secret',
				url: 'https://receiver.example.test/hooks/voice'
			})
		]
	});

	expect(requests).toHaveLength(1);
	const body = JSON.parse(requests[0]!.body);
	expect(body).toMatchObject({
		entity: {
			outcome: 'transferred',
			priority: 'high',
			queue: 'billing',
			reviewId: 'review-webhook',
			scenarioId: 'support-demo',
			sessionId: 'session-webhook'
		},
		event: {
			id: event.id,
			type: 'review.saved'
		},
		links: {
			replay:
				'https://voice.example.test/api/voice-sessions/session-webhook/replay'
		},
		schemaVersion: 1,
		source: 'absolutejs-voice'
	});
	expect(requests[0]!.headers.get('x-absolutejs-signature')).toStartWith(
		'sha256='
	);
	expect(delivered.sinkDeliveries?.['ops-webhook']).toMatchObject({
		sinkKind: 'ops-webhook',
		status: 'delivered'
	});

	const verified = await verifyVoiceOpsWebhookSignature({
		body: requests[0]!.body,
		secret: 'secret',
		signature: requests[0]!.headers.get('x-absolutejs-signature'),
		timestamp: requests[0]!.headers.get('x-absolutejs-timestamp')
	});
	expect(verified).toEqual({
		ok: true
	});
});

test('verifyVoiceOpsWebhookSignature rejects stale or invalid signatures', async () => {
	const stale = await verifyVoiceOpsWebhookSignature({
		body: '{}',
		now: 1_000_000,
		secret: 'secret',
		signature: 'sha256=bad',
		timestamp: '1',
		toleranceMs: 100
	});
	const invalid = await verifyVoiceOpsWebhookSignature({
		body: '{}',
		now: 1_000,
		secret: 'secret',
		signature: 'sha256=bad',
		timestamp: '1000',
		toleranceMs: 10_000
	});

	expect(stale).toEqual({
		ok: false,
		reason: 'stale-timestamp'
	});
	expect(invalid).toEqual({
		ok: false,
		reason: 'invalid-signature'
	});
});

test('createVoiceOpsWebhookReceiverRoutes validates signatures before accepting envelopes', async () => {
	const received: string[] = [];
	const receiver = createVoiceOpsWebhookReceiverRoutes({
		onEnvelope: ({ envelope }) => {
			received.push(envelope.event.id);
		},
		signingSecret: 'secret',
		toleranceMs: 10_000
	});
	const body = JSON.stringify({
		entity: {
			sessionId: 'session-receiver'
		},
		event: {
			createdAt: 100,
			id: 'event-receiver',
			payload: {
				sessionId: 'session-receiver'
			},
			type: 'call.completed'
		},
		schemaVersion: 1,
		source: 'absolutejs-voice'
	});
	const badResponse = await receiver.handle(
		new Request('http://localhost/api/voice-ops/webhook', {
			body,
			headers: {
				'content-type': 'application/json',
				'x-absolutejs-signature': 'sha256=bad',
				'x-absolutejs-timestamp': String(Date.now())
			},
			method: 'POST'
		})
	);
	const goodSinkRequests: Array<{
		body: string;
		headers: Headers;
	}> = [];
	await deliverVoiceIntegrationEventToSinks({
		event: {
			createdAt: 100,
			id: 'event-receiver',
			payload: {
				sessionId: 'session-receiver'
			},
			type: 'call.completed'
		},
		sinks: [
			createVoiceOpsWebhookSink({
				fetch: async (_url, init) => {
					goodSinkRequests.push({
						body: String(init?.body ?? ''),
						headers: new Headers(init?.headers)
					});
					return new Response(null, {
						status: 204
					});
				},
				id: 'receiver-signer',
				signingSecret: 'secret',
				url: 'https://receiver.example.test/hooks/voice'
			})
		]
	});
	const goodResponse = await receiver.handle(
		new Request('http://localhost/api/voice-ops/webhook', {
			body: goodSinkRequests[0]!.body,
			headers: {
				'content-type': 'application/json',
				'x-absolutejs-signature':
					goodSinkRequests[0]!.headers.get('x-absolutejs-signature') ?? '',
				'x-absolutejs-timestamp':
					goodSinkRequests[0]!.headers.get('x-absolutejs-timestamp') ?? ''
			},
			method: 'POST'
		})
	);

	expect(badResponse.status).toBe(401);
	expect(goodResponse.status).toBe(200);
	expect(await goodResponse.json()).toMatchObject({
		eventId: 'event-receiver',
		ok: true,
		type: 'call.completed'
	});
	expect(received).toEqual(['event-receiver']);
});
