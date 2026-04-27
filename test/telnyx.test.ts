import { expect, test } from 'bun:test';
import {
	createTelnyxVoiceResponse,
	createTelnyxVoiceRoutes
} from '../src/telephony/telnyx';

test('createTelnyxVoiceResponse emits TeXML stream response', () => {
	const xml = createTelnyxVoiceResponse({
		codec: 'PCMU',
		streamName: 'absolute-voice',
		streamUrl: 'wss://voice.example.test/telnyx/stream',
		track: 'both_tracks'
	});

	expect(xml).toContain('<Response>');
	expect(xml).toContain('<Stream');
	expect(xml).toContain('wss://voice.example.test/telnyx/stream');
	expect(xml).toContain('both_tracks');
	expect(xml).toContain('PCMU');
});

test('createTelnyxVoiceRoutes exposes TeXML and webhook outcome routes', async () => {
	const decisions: Array<{ action: string; provider?: string }> = [];
	const routes = createTelnyxVoiceRoutes({
		texml: {
			path: '/voice/telnyx',
			streamUrl: 'wss://voice.example.test/voice/telnyx/stream'
		},
		webhook: {
			onDecision: ({ decision, event }) => {
				decisions.push({
					action: decision.action,
					provider: event.provider
				});
			},
			path: '/voice/telnyx/webhook',
			policy: {
				statusMap: {
					'call.hangup': {
						action: 'no-answer',
						disposition: 'no-answer',
						source: 'status'
					}
				}
			}
		}
	});

	const texml = await routes.handle(
		new Request('https://voice.example.test/voice/telnyx')
	);
	const xml = await texml.text();
	expect(texml.headers.get('content-type')).toContain('text/xml');
	expect(xml).toContain('wss://voice.example.test/voice/telnyx/stream');

	const webhook = await routes.handle(
		new Request('https://voice.example.test/voice/telnyx/webhook', {
			body: JSON.stringify({
				data: {
					event_type: 'call.hangup',
					id: 'event-1',
					payload: {
						call_control_id: 'call-control-1',
						call_session_id: 'session-1',
						hangup_cause: 'busy',
						sip_hangup_cause: 486
					},
					record_type: 'event'
				}
			}),
			headers: {
				'content-type': 'application/json'
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
			provider: 'telnyx'
		},
		sessionId: 'session-1'
	});
	expect(decisions).toEqual([
		{
			action: 'no-answer',
			provider: 'telnyx'
		}
	]);
});

test('createTelnyxVoiceRoutes exposes setup and smoke reports that satisfy the shared contract', async () => {
	const routes = createTelnyxVoiceRoutes({
		setup: {
			path: '/voice/telnyx/setup',
			requiredEnv: {
				TELNYX_PUBLIC_KEY: 'present'
			}
		},
		smoke: {
			path: '/voice/telnyx/smoke',
			title: 'Demo Telnyx smoke'
		},
		texml: {
			path: '/voice/telnyx',
			streamUrl: 'wss://voice.example.test/voice/telnyx/stream'
		},
		webhook: {
			path: '/voice/telnyx/webhook',
			verify: () => ({ ok: true })
		}
	});

	const setupResponse = await routes.handle(
		new Request('https://voice.example.test/voice/telnyx/setup')
	);
	const setup = await setupResponse.json();
	expect(setup).toMatchObject({
		provider: 'telnyx',
		ready: true,
		signing: {
			configured: true,
			mode: 'custom'
		},
		urls: {
			stream: 'wss://voice.example.test/voice/telnyx/stream',
			texml: 'https://voice.example.test/voice/telnyx',
			webhook: 'https://voice.example.test/voice/telnyx/webhook'
		}
	});

	const smokeResponse = await routes.handle(
		new Request('https://voice.example.test/voice/telnyx/smoke')
	);
	const smoke = await smokeResponse.json();
	expect(smoke).toMatchObject({
		contract: {
			pass: true,
			provider: 'telnyx'
		},
		pass: true,
		provider: 'telnyx',
		texml: {
			status: 200,
			streamUrl: 'wss://voice.example.test/voice/telnyx/stream'
		},
		webhook: {
			status: 200
		}
	});

	const html = await routes.handle(
		new Request('https://voice.example.test/voice/telnyx/smoke?format=html')
	);
	const text = await html.text();
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(text).toContain('Demo Telnyx smoke');
	expect(text).toContain('Pass');
});
