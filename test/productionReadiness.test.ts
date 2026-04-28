import { expect, test } from 'bun:test';
import {
	buildVoiceProductionReadinessReport,
	createVoiceAuditEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryAuditSinkDeliveryStore,
	createVoiceMemoryTraceEventStore,
	createVoiceMemoryTraceSinkDeliveryStore,
	createVoiceProductionReadinessRoutes,
	createVoiceTelephonyCarrierMatrix,
	createVoiceTraceEvent,
	createVoiceTraceSinkDeliveryRecord,
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

test('buildVoiceProductionReadinessReport fails missing audit evidence', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	await audit.append({
		action: 'llm.provider.call',
		outcome: 'success',
		payload: {
			kind: 'llm',
			provider: 'openai'
		},
		resource: {
			id: 'openai',
			type: 'provider'
		},
		type: 'provider.call'
	});

	const report = await buildVoiceProductionReadinessReport({
		audit,
		links: {
			audit: '/ops/audit'
		},
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.audit).toMatchObject({
		events: 1,
		status: 'fail'
	});
	expect(report.summary.audit?.missing.map((requirement) => requirement.type)).toEqual([
		'retention.policy',
		'operator.action'
	]);
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/ops/audit',
				label: 'Audit evidence',
				status: 'fail',
				value: '1/3'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport accepts complete audit evidence', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	await Promise.all([
		audit.append({
			action: 'llm.provider.call',
			outcome: 'success',
			type: 'provider.call'
		}),
		audit.append({
			action: 'retention.apply',
			outcome: 'success',
			type: 'retention.policy'
		}),
		audit.append({
			action: 'review.approve',
			actor: {
				id: 'operator-1',
				kind: 'operator'
			},
			outcome: 'success',
			type: 'operator.action'
		})
	]);

	const report = await buildVoiceProductionReadinessReport({
		audit,
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.summary.audit).toMatchObject({
		events: 3,
		status: 'pass'
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: 'Audit evidence',
				status: 'pass',
				value: '3/3'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport fails stale retention audit evidence', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const staleRetentionAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
	await Promise.all([
		audit.append({
			action: 'llm.provider.call',
			outcome: 'success',
			type: 'provider.call'
		}),
		audit.append({
			action: 'retention.apply',
			at: staleRetentionAt,
			outcome: 'success',
			type: 'retention.policy'
		}),
		audit.append({
			action: 'review.approve',
			actor: {
				id: 'operator-1',
				kind: 'operator'
			},
			outcome: 'success',
			type: 'operator.action'
		})
	]);

	const report = await buildVoiceProductionReadinessReport({
		audit,
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.audit?.missing.map((requirement) => requirement.type)).toEqual([
		'retention.policy'
	]);
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: 'Audit evidence',
				status: 'fail',
				value: '2/3'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport allows custom retention freshness windows', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const retentionAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
	await Promise.all([
		audit.append({
			action: 'llm.provider.call',
			outcome: 'success',
			type: 'provider.call'
		}),
		audit.append({
			action: 'retention.apply',
			at: retentionAt,
			outcome: 'success',
			type: 'retention.policy'
		}),
		audit.append({
			action: 'review.approve',
			actor: {
				id: 'operator-1',
				kind: 'operator'
			},
			outcome: 'success',
			type: 'operator.action'
		})
	]);

	const report = await buildVoiceProductionReadinessReport({
		audit: {
			require: [
				'provider.call',
				{
					maxAgeMs: 14 * 24 * 60 * 60 * 1000,
					type: 'retention.policy'
				},
				'operator.action'
			],
			store: audit
		},
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.summary.audit).toMatchObject({
		status: 'pass'
	});
});

test('buildVoiceProductionReadinessReport fails unhealthy audit sink deliveries', async () => {
	const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
	const event = createVoiceAuditEvent({
		action: 'provider.call',
		type: 'provider.call'
	});
	await auditDeliveries.set(
		'audit-delivery-failed',
		createVoiceAuditSinkDeliveryRecord({
			events: [event],
			id: 'audit-delivery-failed',
			deliveryAttempts: 2,
			deliveryError: 'warehouse unavailable',
			deliveryStatus: 'failed'
		})
	);

	const report = await buildVoiceProductionReadinessReport({
		auditDeliveries,
		links: {
			auditDeliveries: '/ops/audit-deliveries'
		},
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.auditDeliveries).toMatchObject({
		failed: 1,
		status: 'fail',
		total: 1
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/ops/audit-deliveries',
				label: 'Audit sink delivery',
				status: 'fail',
				value: '0/1'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport warns then fails stale audit sink backlog', async () => {
	const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
	const event = createVoiceAuditEvent({
		action: 'tool.call',
		type: 'tool.call'
	});
	await auditDeliveries.set(
		'audit-delivery-pending',
		createVoiceAuditSinkDeliveryRecord({
			createdAt: Date.now() - 2_000,
			events: [event],
			id: 'audit-delivery-pending'
		})
	);

	const warningReport = await buildVoiceProductionReadinessReport({
		auditDeliveries: {
			failPendingAfterMs: 10_000,
			store: auditDeliveries,
			warnPendingAfterMs: 1_000
		},
		store: createVoiceMemoryTraceEventStore()
	});
	const failingReport = await buildVoiceProductionReadinessReport({
		auditDeliveries: {
			failPendingAfterMs: 1_000,
			store: auditDeliveries,
			warnPendingAfterMs: 500
		},
		store: createVoiceMemoryTraceEventStore()
	});

	expect(warningReport.summary.auditDeliveries).toMatchObject({
		pending: 1,
		staleWarning: 1,
		status: 'warn'
	});
	expect(failingReport.summary.auditDeliveries).toMatchObject({
		pending: 1,
		staleFailing: 1,
		status: 'fail'
	});
});

test('buildVoiceProductionReadinessReport fails unhealthy trace sink deliveries', async () => {
	const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
	const event = createVoiceTraceEvent({
		at: 100,
		payload: {
			error: 'provider failed'
		},
		sessionId: 'session-trace',
		type: 'session.error'
	});
	await traceDeliveries.set(
		'trace-delivery-failed',
		createVoiceTraceSinkDeliveryRecord({
			events: [event],
			id: 'trace-delivery-failed',
			deliveryAttempts: 2,
			deliveryError: 'trace warehouse unavailable',
			deliveryStatus: 'failed'
		})
	);

	const report = await buildVoiceProductionReadinessReport({
		links: {
			traceDeliveries: '/ops/trace-deliveries'
		},
		store: createVoiceMemoryTraceEventStore(),
		traceDeliveries
	});

	expect(report.status).toBe('fail');
	expect(report.summary.traceDeliveries).toMatchObject({
		failed: 1,
		status: 'fail',
		total: 1
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/ops/trace-deliveries',
				label: 'Trace sink delivery',
				status: 'fail',
				value: '0/1'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport warns then fails stale trace sink backlog', async () => {
	const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
	const event = createVoiceTraceEvent({
		at: 100,
		payload: {
			text: 'hello'
		},
		sessionId: 'session-trace',
		type: 'turn.assistant'
	});
	await traceDeliveries.set(
		'trace-delivery-pending',
		createVoiceTraceSinkDeliveryRecord({
			createdAt: Date.now() - 2_000,
			events: [event],
			id: 'trace-delivery-pending'
		})
	);

	const warningReport = await buildVoiceProductionReadinessReport({
		store: createVoiceMemoryTraceEventStore(),
		traceDeliveries: {
			failPendingAfterMs: 10_000,
			store: traceDeliveries,
			warnPendingAfterMs: 1_000
		}
	});
	const failingReport = await buildVoiceProductionReadinessReport({
		store: createVoiceMemoryTraceEventStore(),
		traceDeliveries: {
			failPendingAfterMs: 1_000,
			store: traceDeliveries,
			warnPendingAfterMs: 500
		}
	});

	expect(warningReport.summary.traceDeliveries).toMatchObject({
		pending: 1,
		staleWarning: 1,
		status: 'warn'
	});
	expect(failingReport.summary.traceDeliveries).toMatchObject({
		pending: 1,
		staleFailing: 1,
		status: 'fail'
	});
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

test('buildVoiceProductionReadinessReport fails failing agent squad contracts', async () => {
	const report = await buildVoiceProductionReadinessReport({
		agentSquadContracts: [
			{
				contractId: 'billing-route',
				issues: [],
				pass: true,
				sessionId: 'contract-session-1',
				turns: []
			},
			{
				contractId: 'legal-route',
				issues: [
					{
						code: 'agent_squad.handoff_mismatch',
						message: 'Expected legal handoff to be blocked.'
					}
				],
				pass: false,
				sessionId: 'contract-session-2',
				turns: []
			}
		],
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.agentSquadContracts).toEqual({
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				actions: expect.arrayContaining([
					expect.objectContaining({
						label: 'Open squad contracts'
					})
				]),
				label: 'Agent squad contracts',
				status: 'fail',
				value: '1/2'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport accepts resolved agent squad contracts', async () => {
	const report = await buildVoiceProductionReadinessReport({
		agentSquadContracts: async () => [
			{
				contractId: 'billing-route',
				issues: [],
				pass: true,
				sessionId: 'contract-session-1',
				turns: []
			}
		],
		links: {
			agentSquadContracts: '/agent-squad-contract'
		},
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.summary.agentSquadContracts).toEqual({
		failed: 0,
		passed: 1,
		status: 'pass',
		total: 1
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/agent-squad-contract',
				label: 'Agent squad contracts',
				status: 'pass',
				value: '1/1'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport fails failing provider routing contracts', async () => {
	const report = await buildVoiceProductionReadinessReport({
		providerRoutingContracts: [
			{
				contractId: 'openai-anthropic-fallback',
				events: [],
				issues: [],
				pass: true
			},
			{
				contractId: 'openai-gemini-fallback',
				events: [],
				issues: [
					{
						code: 'provider_routing.expected_event_missing',
						message: 'Expected Gemini fallback.'
					}
				],
				pass: false
			}
		],
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.providerRoutingContracts).toEqual({
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				actions: expect.arrayContaining([
					expect.objectContaining({
						label: 'Open provider routing contracts'
					})
				]),
				label: 'Provider routing contracts',
				status: 'fail',
				value: '1/2'
			})
		])
	);
});

test('buildVoiceProductionReadinessReport fails failing phone-agent production smoke contracts', async () => {
	const report = await buildVoiceProductionReadinessReport({
		links: {
			phoneAgentSmoke: '/ops/phone-smoke'
		},
		phoneAgentSmokes: [
			{
				contractId: 'twilio-phone-smoke',
				generatedAt: 100,
				issues: [],
				observed: {
					assistantResponses: 1,
					lifecycleOutcomes: ['completed'],
					latestEventAt: 100,
					mediaStarts: 1,
					sessionErrors: 0,
					transcripts: 1
				},
				pass: true,
				provider: 'twilio',
				required: [
					'media-started',
					'transcript',
					'assistant-response',
					'lifecycle-outcome',
					'no-session-error'
				],
				sessionId: 'phone-smoke-pass'
			},
			{
				contractId: 'telnyx-phone-smoke',
				generatedAt: 100,
				issues: [
					{
						message: 'No assistant response trace was recorded.',
						requirement: 'assistant-response',
						severity: 'error'
					}
				],
				observed: {
					assistantResponses: 0,
					lifecycleOutcomes: ['completed'],
					latestEventAt: 100,
					mediaStarts: 1,
					sessionErrors: 0,
					transcripts: 1
				},
				pass: false,
				provider: 'telnyx',
				required: [
					'media-started',
					'transcript',
					'assistant-response',
					'lifecycle-outcome',
					'no-session-error'
				],
				sessionId: 'phone-smoke-fail'
			}
		],
		store: createVoiceMemoryTraceEventStore()
	});

	expect(report.status).toBe('fail');
	expect(report.summary.phoneAgentSmokes).toEqual({
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	expect(report.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				href: '/ops/phone-smoke',
				label: 'Phone agent production smoke',
				status: 'fail',
				value: '1/2'
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
