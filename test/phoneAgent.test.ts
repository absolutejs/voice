import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceTraceEvent,
	createVoicePhoneAgent
} from '../src';

test('createVoicePhoneAgent mounts carrier routes and exposes setup readiness', async () => {
	const phoneAgent = createVoicePhoneAgent({
		carriers: [
			{
				name: 'primary telnyx',
				options: {
					setup: {
						requiredEnv: {
							TELNYX_PUBLIC_KEY: 'present'
						}
					},
					smoke: {
						title: 'Phone agent Telnyx smoke'
					},
					texml: {
						streamUrl: 'wss://voice.example.test/api/voice/telnyx/stream'
					},
					webhook: {
						verify: () => ({ ok: true })
					}
				},
				provider: 'telnyx'
			}
		],
		setup: {
			path: '/api/voice/phone/setup',
			title: 'Demo Phone Agent'
		}
	});

	expect(phoneAgent.setupPath).toBe('/api/voice/phone/setup');
	expect(phoneAgent.matrixPath).toBe('/api/voice/phone/carriers');
	expect(phoneAgent.carriers).toEqual([
		{
			name: 'primary telnyx',
			provider: 'telnyx',
			setupPath: '/api/voice/telnyx/setup',
			smokePath: '/api/voice/telnyx/smoke'
		}
	]);

	const setupResponse = await phoneAgent.routes.handle(
		new Request('https://voice.example.test/api/voice/phone/setup')
	);
	const setup = await setupResponse.json();

	expect(setup).toMatchObject({
		ready: true,
		title: 'Demo Phone Agent',
		matrix: {
			pass: true,
			summary: {
				providers: 1,
				ready: 1,
				smokePassing: 1
			}
		}
	});
	expect(setup.lifecycleStages).toContain('media-started');
	expect(setup.lifecycleStages).toContain('assistant-response');
	expect(setup.lifecycleStages).toContain('transfer');

	const matrixResponse = await phoneAgent.routes.handle(
		new Request('https://voice.example.test/api/voice/phone/carriers')
	);
	const matrix = await matrixResponse.json();

	expect(matrix).toMatchObject({
		pass: true,
		summary: {
			providers: 1,
			ready: 1,
			smokePassing: 1
		}
	});
});

test('createVoicePhoneAgent renders the setup report as HTML', async () => {
	const phoneAgent = createVoicePhoneAgent({
		carriers: [
			{
				options: {
					setup: {
						requiredEnv: {
							PLIVO_AUTH_TOKEN: 'present'
						}
					},
					answer: {
						streamUrl: 'wss://voice.example.test/api/voice/plivo/stream'
					},
					webhook: {
						verify: () => ({ ok: true })
					}
				},
				provider: 'plivo'
			}
		]
	});

	const response = await phoneAgent.routes.handle(
		new Request('https://voice.example.test/api/voice/phone/setup?format=html')
	);
	const html = await response.text();

	expect(response.headers.get('content-type')).toContain('text/html');
	expect(html).toContain('Phone agent setup');
	expect(html).toContain('plivo');
	expect(html).toContain('media-started');
});

test('createVoicePhoneAgent can mount production smoke contract routes', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const sessionId = 'phone-agent-smoke-session';
	await Promise.all([
		trace.append(
			createVoiceTraceEvent({
				payload: {
					type: 'start'
				},
				sessionId,
				type: 'call.lifecycle'
			})
		),
		trace.append(
			createVoiceTraceEvent({
				payload: {
					text: 'hello from phone'
				},
				sessionId,
				type: 'turn.transcript'
			})
		),
		trace.append(
			createVoiceTraceEvent({
				payload: {
					text: 'hello back'
				},
				sessionId,
				type: 'turn.assistant'
			})
		),
		trace.append(
			createVoiceTraceEvent({
				payload: {
					disposition: 'completed',
					type: 'end'
				},
				sessionId,
				type: 'call.lifecycle'
			})
		)
	]);
	const phoneAgent = createVoicePhoneAgent({
		carriers: [
			{
				options: {
					setup: {
						requiredEnv: {
							TELNYX_PUBLIC_KEY: 'present'
						}
					},
					smoke: {
						title: 'Phone agent Telnyx smoke'
					},
					texml: {
						streamUrl: 'wss://voice.example.test/api/voice/telnyx/stream'
					},
					webhook: {
						verify: () => ({ ok: true })
					}
				},
				provider: 'telnyx'
			}
		],
		productionSmoke: {
			required: [
				'carrier-contract',
				'media-started',
				'transcript',
				'assistant-response',
				'lifecycle-outcome',
				'no-session-error'
			],
			store: trace
		}
	});

	expect(phoneAgent.productionSmokePath).toBe('/api/voice/phone/smoke-contract');

	const setupResponse = await phoneAgent.routes.handle(
		new Request('https://voice.example.test/api/voice/phone/setup')
	);
	const setup = await setupResponse.json();
	expect(setup.productionSmokePath).toBe('/api/voice/phone/smoke-contract');

	const smokeResponse = await phoneAgent.routes.handle(
		new Request(
			`https://voice.example.test/api/voice/phone/smoke-contract?sessionId=${sessionId}&provider=telnyx`
		)
	);
	const smoke = await smokeResponse.json();

	expect(smoke).toMatchObject({
		observed: {
			carrierContract: true,
			mediaStarts: 1,
			transcripts: 1,
			assistantResponses: 1
		},
		pass: true,
		provider: 'telnyx',
		sessionId
	});
});
