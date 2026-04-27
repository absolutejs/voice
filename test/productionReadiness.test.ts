import { expect, test } from 'bun:test';
import {
	buildVoiceProductionReadinessReport,
	createVoiceMemoryTraceEventStore,
	createVoiceProductionReadinessRoutes,
	createVoiceTelephonyCarrierMatrix,
	renderVoiceProductionReadinessHTML
} from '../src';

test('buildVoiceProductionReadinessReport warns when deployment has no runtime proof', async () => {
	const report = await buildVoiceProductionReadinessReport({
		llmProviders: ['openai'],
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report).toMatchObject({
		status: 'warn',
		summary: {
			quality: {
				status: 'pass'
			},
			routing: {
				events: 0,
				sessions: 0
			},
			sessions: {
				failed: 0,
				total: 0
			}
		}
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: 'Routing evidence',
				actions: expect.arrayContaining([
					expect.objectContaining({
						label: 'Open routing evidence'
					})
				]),
				status: 'warn'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport fails provider and carrier blockers', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: {
			error: 'OpenAI voice TTS failed: HTTP 503',
			kind: 'tts',
			provider: 'openai',
			providerStatus: 'error',
			suppressedUntil: 500
		},
		sessionId: 'call-1',
		type: 'session.error'
	});
	await store.append({
		at: 110,
		payload: {
			fallbackProvider: 'emergency',
			kind: 'tts',
			provider: 'emergency',
			providerStatus: 'fallback',
			selectedProvider: 'openai'
		},
		sessionId: 'call-1',
		type: 'session.error'
	});

	const report = await buildVoiceProductionReadinessReport({
		carriers: [
			{
				setup: {
					generatedAt: 100,
					missing: ['VOICE_DEMO_PUBLIC_BASE_URL'],
					provider: 'twilio',
					ready: false,
					signing: {
						configured: false,
						mode: 'none'
					},
					urls: {
						stream: '',
						webhook: ''
					},
					warnings: []
				}
			}
		],
		store,
		ttsProviders: ['openai', 'emergency']
	});

	expect(report.status).toBe('fail');
	expect(report.summary.carriers).toMatchObject({
		failing: 1,
		providers: 1,
		status: 'fail'
	});
	expect(report.summary.sessions.failed).toBe(1);
	expect(report.summary.routing.events).toBe(2);
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				actions: expect.arrayContaining([
					expect.objectContaining({
						label: 'Replay failed sessions'
					})
				]),
				label: 'Session health'
			}),
			expect.objectContaining({
				actions: expect.arrayContaining([
					expect.objectContaining({
						label: 'Open carrier matrix'
					})
				]),
				label: 'Carrier readiness'
			})
		])
	);
});

test('production readiness routes expose json and html reports', async () => {
	const app = createVoiceProductionReadinessRoutes({
		store: createVoiceMemoryTraceEventStore()
	});
	const json = await app.handle(
		new Request('http://localhost/api/production-readiness')
	);
	const html = await app.handle(new Request('http://localhost/production-readiness'));

	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		status: 'warn'
	});
	expect(html.status).toBe(200);
	expect(await html.text()).toContain('Production Readiness');
});

test('renderVoiceProductionReadinessHTML renders check statuses', () => {
	const matrix = createVoiceTelephonyCarrierMatrix({
		providers: [
			{
				setup: {
					generatedAt: 100,
					missing: [],
					provider: 'twilio',
					ready: true,
					signing: {
						configured: true,
						mode: 'twilio-signature'
					},
					urls: {
						stream: 'wss://example.test/api/twilio/stream',
						webhook: 'https://example.test/api/telephony-webhook'
					},
					warnings: []
				}
			}
		]
	});
	const html = renderVoiceProductionReadinessHTML({
		checkedAt: 100,
		checks: [
			{
				actions: [
					{
						href: '/api/voice-handoffs/retry',
						label: 'Retry handoff deliveries',
						method: 'POST'
					}
				],
				label: 'Carrier readiness',
				status: matrix.pass ? 'pass' : 'fail',
				value: matrix.summary.ready
			}
		],
		links: {},
		status: 'pass',
		summary: {
			carriers: {
				failing: matrix.summary.failing,
				providers: matrix.summary.providers,
				ready: matrix.summary.ready,
				status: 'pass',
				warnings: matrix.summary.warnings
			},
			handoffs: {
				failed: 0,
				total: 0
			},
			providers: {
				degraded: 0,
				total: 0
			},
			quality: {
				status: 'pass'
			},
			routing: {
				events: 0,
				sessions: 0
			},
			sessions: {
				failed: 0,
				total: 0
			}
		}
	});

	expect(html).toContain('Carrier readiness');
	expect(html).toContain('Overall: PASS');
	expect(html).toContain('Retry handoff deliveries');
	expect(html).toContain('data-readiness-action');
});
