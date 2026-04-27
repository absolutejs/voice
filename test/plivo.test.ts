import { expect, test } from 'bun:test';
import {
	createPlivoVoiceResponse,
	createPlivoVoiceRoutes,
	signVoicePlivoWebhook,
	verifyVoicePlivoWebhookSignature
} from '../src/telephony/plivo';

test('createPlivoVoiceResponse emits Plivo Stream XML', () => {
	const xml = createPlivoVoiceResponse({
		audioTrack: 'inbound',
		bidirectional: true,
		contentType: 'audio/x-mulaw;rate=8000',
		keepCallAlive: true,
		streamUrl: 'wss://voice.example.test/plivo/stream'
	});

	expect(xml).toContain('<Response>');
	expect(xml).toContain('<Stream');
	expect(xml).toContain('bidirectional="true"');
	expect(xml).toContain('keepCallAlive="true"');
	expect(xml).toContain('audio/x-mulaw;rate=8000');
	expect(xml).toContain('wss://voice.example.test/plivo/stream');
});

test('Plivo webhook signature helpers support V3 signatures', async () => {
	const body = {
		CallUUID: 'call-1',
		From: '+15555550100',
		To: '+15555550101'
	};
	const nonce = 'nonce-1';
	const signature = await signVoicePlivoWebhook({
		authToken: 'secret',
		body,
		nonce,
		url: 'https://voice.example.test/voice/plivo/webhook'
	});
	const headers = new Headers({
		'x-plivo-signature-v3': signature,
		'x-plivo-signature-v3-nonce': nonce
	});

	await expect(
		verifyVoicePlivoWebhookSignature({
			authToken: 'secret',
			body,
			headers,
			url: 'https://voice.example.test/voice/plivo/webhook'
		})
	).resolves.toEqual({ ok: true });
	await expect(
		verifyVoicePlivoWebhookSignature({
			authToken: 'wrong',
			body,
			headers,
			url: 'https://voice.example.test/voice/plivo/webhook'
		})
	).resolves.toEqual({
		ok: false,
		reason: 'invalid-signature'
	});
});

test('createPlivoVoiceRoutes exposes answer XML and webhook outcome routes', async () => {
	const decisions: Array<{ action: string; provider?: string }> = [];
	const routes = createPlivoVoiceRoutes({
		answer: {
			path: '/voice/plivo',
			response: {
				bidirectional: true,
				contentType: 'audio/x-mulaw;rate=8000',
				keepCallAlive: true
			},
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		webhook: {
			onDecision: ({ decision, event }) => {
				decisions.push({
					action: decision.action,
					provider: event.provider
				});
			},
			path: '/voice/plivo/webhook',
			policy: {
				statusMap: {
					hangup: {
						action: 'no-answer',
						disposition: 'no-answer',
						source: 'status'
					}
				}
			}
		}
	});

	const answer = await routes.handle(
		new Request('https://voice.example.test/voice/plivo')
	);
	const xml = await answer.text();
	expect(answer.headers.get('content-type')).toContain('text/xml');
	expect(xml).toContain('wss://voice.example.test/voice/plivo/stream');

	const webhook = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/webhook', {
			body: new URLSearchParams({
				CallUUID: 'call-1',
				Event: 'Hangup',
				HangupCause: 'busy',
				SessionId: 'session-1',
				SipResponseCode: '486'
			}),
			headers: {
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		})
	);
	const body = await webhook.json();

	expect(body).toMatchObject({
		decision: {
			action: 'no-answer',
			disposition: 'no-answer'
		},
		event: {
			provider: 'plivo'
		},
		sessionId: 'session-1'
	});
	expect(decisions).toEqual([
		{
			action: 'no-answer',
			provider: 'plivo'
		}
	]);
});

test('createPlivoVoiceRoutes exposes setup and smoke reports that satisfy the shared contract', async () => {
	const routes = createPlivoVoiceRoutes({
		answer: {
			path: '/voice/plivo',
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		setup: {
			path: '/voice/plivo/setup',
			requiredEnv: {
				PLIVO_AUTH_TOKEN: 'present'
			}
		},
		smoke: {
			path: '/voice/plivo/smoke',
			title: 'Demo Plivo smoke'
		},
		webhook: {
			path: '/voice/plivo/webhook',
			verify: () => ({ ok: true })
		}
	});

	const setupResponse = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/setup')
	);
	const setup = await setupResponse.json();
	expect(setup).toMatchObject({
		provider: 'plivo',
		ready: true,
		signing: {
			configured: true,
			mode: 'custom'
		},
		urls: {
			answer: 'https://voice.example.test/voice/plivo',
			stream: 'wss://voice.example.test/voice/plivo/stream',
			webhook: 'https://voice.example.test/voice/plivo/webhook'
		}
	});

	const smokeResponse = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/smoke')
	);
	const smoke = await smokeResponse.json();
	expect(smoke).toMatchObject({
		answer: {
			status: 200,
			streamUrl: 'wss://voice.example.test/voice/plivo/stream'
		},
		contract: {
			pass: true,
			provider: 'plivo'
		},
		pass: true,
		provider: 'plivo',
		webhook: {
			status: 200
		}
	});

	const html = await routes.handle(
		new Request('https://voice.example.test/voice/plivo/smoke?format=html')
	);
	const text = await html.text();
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(text).toContain('Demo Plivo smoke');
	expect(text).toContain('Pass');
});
