import { expect, test } from 'bun:test';
import {
	assertVoiceOperationsRecordGuardrails,
	assertVoiceOperationsRecordProviderRecovery,
	buildVoiceOperationsRecord,
	createVoiceAuditEvent,
	createVoiceIntegrationEvent,
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryTraceEventStore,
	createVoiceOperationsRecordRoutes,
	createVoiceProviderDecisionTraceEvent,
	createVoiceTraceEvent,
	evaluateVoiceOperationsRecordGuardrails,
	evaluateVoiceOperationsRecordProviderRecovery,
	renderVoiceOperationsRecordHTML,
	renderVoiceOperationsRecordIncidentMarkdown
} from '../src';
import type {
	StoredVoiceCallReviewArtifact,
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask
} from '../src';

const createStore = <T extends { id: string }>() => {
	const values = new Map<string, T>();

	return {
		get: (id: string) => values.get(id),
		list: () => [...values.values()],
		remove: (id: string) => {
			values.delete(id);
		},
		set: (id: string, value: T) => {
			values.set(id, value);
		}
	};
};

const createRecordEvents = () => [
	createVoiceTraceEvent({
		at: 100,
		payload: { type: 'start' },
		sessionId: 'session-ops',
		type: 'call.lifecycle'
	}),
	createVoiceTraceEvent({
		at: 120,
		payload: {
			isFinal: true,
			elapsedMs: 20,
			provider: 'deepgram',
			providerStatus: 'success',
			text: 'I need billing help for alex@example.com.'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 130,
		payload: {
			text: 'I need billing help for alex@example.com.'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceTraceEvent({
		at: 140,
		payload: {
			fromAgentId: 'intake',
			metadata: {
				intent: 'billing'
			},
			reason: 'billing question',
			status: 'allowed',
			summary: 'Send billing question for alex@example.com to billing.',
			targetAgentId: 'billing'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'agent.handoff'
	}),
	createVoiceTraceEvent({
		at: 170,
		payload: {
			elapsedMs: 30,
			status: 'ok',
			toolCallId: 'tool-1',
			toolName: 'lookup_invoice'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'agent.tool'
	}),
	createVoiceTraceEvent({
		at: 190,
		payload: {
			elapsedMs: 50,
			provider: 'openai',
			providerStatus: 'success'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'assistant.run'
	}),
	createVoiceTraceEvent({
		at: 210,
		payload: {
			complete: true,
			escalated: false,
			noAnswer: false,
			transferred: false,
			voicemail: false
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'agent.result'
	}),
	createVoiceProviderDecisionTraceEvent({
		at: 220,
		elapsedMs: 42,
		kind: 'llm',
		provider: 'openai',
		reason: 'live-call selected openai because it met the latency policy.',
		selectedProvider: 'openai',
		sessionId: 'session-ops',
		status: 'selected',
		surface: 'live-call',
		turnId: 'turn-1'
	}),
	createVoiceProviderDecisionTraceEvent({
		at: 225,
		elapsedMs: 120,
		fallbackProvider: 'anthropic',
		kind: 'llm',
		provider: 'openai',
		reason: 'live-call recovered with anthropic after a simulated timeout.',
		selectedProvider: 'anthropic',
		sessionId: 'session-ops',
		status: 'fallback',
		surface: 'live-call',
		turnId: 'turn-1'
	}),
	createVoiceProviderDecisionTraceEvent({
		at: 226,
		elapsedMs: 140,
		fallbackProvider: 'deterministic',
		kind: 'llm',
		provider: 'openai',
		reason: 'live-call degraded to deterministic fallback after the latency budget.',
		selectedProvider: 'deterministic',
		sessionId: 'session-ops',
		status: 'degraded',
		surface: 'live-call',
		turnId: 'turn-1'
	}),
	createVoiceTraceEvent({
		at: 240,
		payload: {
			text: 'Billing can help with that invoice.'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'turn.assistant'
	}),
	createVoiceTraceEvent({
		at: 260,
		payload: { disposition: 'completed', type: 'end' },
		sessionId: 'session-ops',
		type: 'call.lifecycle'
	}),
	createVoiceTraceEvent({
		at: 270,
		payload: {
			carrier: 'twilio',
			envelope: {
				event: 'start',
				start: {
					callSid: 'CA-ops',
					streamSid: 'MZ-ops'
				},
				streamSid: 'MZ-ops'
			},
			event: 'start',
			streamId: 'MZ-ops'
		},
		sessionId: 'session-ops',
		type: 'client.telephony_media'
	}),
	createVoiceTraceEvent({
		at: 280,
		payload: {
			carrier: 'twilio',
			envelope: {
				event: 'media',
				media: {
					payload: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
						'base64'
					),
					sequenceNumber: '7',
					track: 'inbound'
				},
				streamSid: 'MZ-ops'
			},
			event: 'media',
			streamId: 'MZ-ops'
		},
		sessionId: 'session-ops',
		type: 'client.telephony_media'
	}),
	createVoiceTraceEvent({
		at: 290,
		payload: {
			callSid: 'CA-ops',
			carrier: 'twilio',
			envelope: {
				event: 'stop',
				stop: {
					callSid: 'CA-ops'
				},
				streamSid: 'MZ-ops'
			},
			event: 'stop',
			streamId: 'MZ-ops'
		},
		sessionId: 'session-ops',
		type: 'client.telephony_media'
	})
];

const createGuardrailEvents = () => [
	createVoiceTraceEvent({
		at: 185,
		metadata: {
			proof: 'operations-record-guardrail-proof'
		},
		payload: {
			allowed: false,
			findings: [
				{
					action: 'block',
					label: 'Unsafe tool argument',
					ruleId: 'support.tool-input-policy'
				}
			],
			stage: 'tool-input',
			status: 'fail',
			toolName: 'lookup_invoice'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'assistant.guardrail'
	}),
	createVoiceTraceEvent({
		at: 230,
		metadata: {
			proof: 'operations-record-guardrail-proof'
		},
		payload: {
			allowed: false,
			findings: [
				{
					action: 'block',
					label: 'Unsafe assistant output',
					ruleId: 'support.no-medical-advice'
				}
			],
			stage: 'assistant-output',
			status: 'fail'
		},
		sessionId: 'session-ops',
		turnId: 'turn-1',
		type: 'assistant.guardrail'
	})
];

test('buildVoiceOperationsRecord aggregates trace, replay, provider, handoff, tool, and audit proof', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const audit = createVoiceMemoryAuditEventStore();
	for (const event of createRecordEvents()) {
		await trace.append(event);
	}
	await audit.append(
		createVoiceAuditEvent({
			action: 'handoff',
			outcome: 'success',
			payload: {
				fromAgentId: 'intake',
				toAgentId: 'billing'
			},
			sessionId: 'session-ops',
			type: 'handoff'
		})
	);

	const record = await buildVoiceOperationsRecord({
		audit,
		sessionId: 'session-ops',
		store: trace
	});
	const providerDecisions = record.providerDecisions;
	const providerRecoveryReport = evaluateVoiceOperationsRecordProviderRecovery(
		record,
		{
			minDegraded: 1,
			minFallbacks: 1,
			minSelected: 1,
			minTotal: 5,
			recoveryStatus: 'degraded',
			requiredFallbackProviders: ['anthropic', 'deterministic'],
			requiredProviders: ['deepgram', 'openai'],
			requiredReasonIncludes: ['latency budget'],
			requiredSelectedProviders: ['anthropic', 'deterministic', 'openai'],
			requiredStatuses: ['degraded', 'fallback', 'selected', 'success'],
			requiredSurfaces: ['live-call']
		}
	);
	const providerRecoveryFailureReport =
		evaluateVoiceOperationsRecordProviderRecovery(record, {
			minFallbacks: 2,
			recoveryStatus: 'recovered',
			requiredFallbackProviders: ['assemblyai'],
			requiredReasonIncludes: ['carrier failover']
		});
	const providerRecoveryAssertReport =
		assertVoiceOperationsRecordProviderRecovery(record, {
			minDegraded: 1,
			minFallbacks: 1,
			recoveryStatus: 'degraded'
		});

	expect(record).toMatchObject({
		audit: {
			success: 1,
			total: 1
		},
		handoffs: [
			{
				fromAgentId: 'intake',
				metadata: {
					intent: 'billing'
				},
				status: 'allowed',
				summary: 'Send billing question for alex@example.com to billing.',
				targetAgentId: 'billing'
			}
		],
		outcome: {
			assistantReplies: 1,
			complete: true,
			escalated: false
		},
		providerDecisions: expect.arrayContaining([
			expect.objectContaining({
				provider: 'deepgram',
				status: 'success'
			}),
			expect.objectContaining({
				provider: 'openai',
				status: 'success'
			}),
			expect.objectContaining({
				provider: 'openai',
				reason: 'live-call selected openai because it met the latency policy.',
				selectedProvider: 'openai',
				status: 'selected',
				surface: 'live-call'
			}),
			expect.objectContaining({
				fallbackProvider: 'anthropic',
				status: 'fallback'
			}),
			expect.objectContaining({
				fallbackProvider: 'deterministic',
				status: 'degraded'
			})
		]),
		providerDecisionSummary: {
			degraded: 1,
			errors: 0,
			fallbacks: 1,
			recoveryStatus: 'degraded',
			selected: 3,
			total: 5
		},
		sessionId: 'session-ops',
		status: 'healthy',
		summary: {
			callDurationMs: 160,
			eventCount: 15,
			turnCount: 1,
			handoffCount: 1,
			toolCallCount: 1
		},
		tools: [
			{
				elapsedMs: 30,
				status: 'ok',
				toolName: 'lookup_invoice'
			}
		]
	});
	expect(record.telephonyMedia).toMatchObject({
		audioBytes: 4,
		carriers: ['twilio'],
		media: 1,
		starts: 1,
		stops: 1,
		streamIds: ['MZ-ops'],
		total: 3
	});
	expect(record.telephonyMedia.events[1]).toMatchObject({
		audioBytes: 4,
		carrier: 'twilio',
		direction: 'inbound',
		event: 'media',
		sequenceNumber: '7',
		streamId: 'MZ-ops'
	});
	expect(record.transcript).toMatchObject([
		{
			assistantReplies: ['Billing can help with that invoice.'],
			committedText: 'I need billing help for alex@example.com.',
			id: 'turn-1'
		}
	]);
	expect(record.providers).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				provider: 'deepgram'
			}),
			expect.objectContaining({
				provider: 'openai'
			})
		])
	);
	expect(providerDecisions).toHaveLength(5);
	expect(providerDecisions.map((decision) => decision.type)).not.toContain(
		'call.lifecycle'
	);
	expect(providerRecoveryReport).toMatchObject({
		degraded: 1,
		fallbacks: 1,
		ok: true,
		recoveryStatus: 'degraded'
	});
	expect(providerRecoveryAssertReport.ok).toBe(true);
	expect(providerRecoveryFailureReport).toMatchObject({
		ok: false,
		issues: expect.arrayContaining([
			'Expected provider recovery status recovered, got degraded.',
			'Expected at least 2 provider fallback decision(s), found 1.',
			'Missing provider recovery fallback providers: assemblyai',
			'Missing provider recovery reason containing: carrier failover.'
		])
	});
	expect(
		record.replay.turns.find((turn) => turn.id === 'turn-1')?.assistantReplies
	).toEqual([
		'Billing can help with that invoice.'
	]);
});

test('buildVoiceOperationsRecord links reviews tasks integration events and sink delivery proof', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const reviews = createStore<StoredVoiceCallReviewArtifact>();
	const tasks = createStore<StoredVoiceOpsTask>();
	const integrationEvents = createStore<StoredVoiceIntegrationEvent>();
	for (const event of createRecordEvents()) {
		await trace.append(event);
	}
	reviews.set('session-ops:review', {
		errors: [],
		generatedAt: 300,
		id: 'session-ops:review',
		latencyBreakdown: [],
		notes: [],
		postCall: {
			label: 'Completed',
			recommendedAction: 'No follow-up required.',
			summary: 'Billing call completed.'
		},
		summary: {
			outcome: 'completed',
			pass: true,
			turnCount: 1
		},
		timeline: [],
		title: 'Billing support review',
		transcript: {
			actual: 'I need billing help.'
		}
	});
	tasks.set('session-ops:review:ops', {
		createdAt: 310,
		description: 'Confirm billing follow-up.',
		history: [],
		id: 'session-ops:review:ops',
		kind: 'support-triage',
		priority: 'normal',
		recommendedAction: 'Confirm invoice lookup was sent.',
		reviewId: 'session-ops:review',
		status: 'open',
		title: 'Billing follow-up',
		updatedAt: 310
	});
	integrationEvents.set(
		'session-ops:call.completed',
		createVoiceIntegrationEvent(
			'call.completed',
			{
				sessionId: 'session-ops',
				status: 'completed'
			},
			{
				createdAt: 320,
				id: 'session-ops:call.completed'
			}
		)
	);
	integrationEvents.set('session-ops:review.saved', {
		...createVoiceIntegrationEvent(
			'review.saved',
			{
				reviewId: 'session-ops:review',
				title: 'Billing support review'
			},
			{
				createdAt: 330,
				id: 'session-ops:review.saved'
			}
		),
		deliveredAt: 340,
		deliveredTo: 'https://crm.example.test/events',
		deliveryAttempts: 1,
		deliveryStatus: 'delivered',
		sinkDeliveries: {
			crm: {
				attempts: 1,
				deliveredAt: 340,
				deliveredTo: 'https://crm.example.test/events',
				sinkId: 'crm',
				status: 'delivered'
			}
		}
	});
	integrationEvents.set('session-ops:task.created', {
		...createVoiceIntegrationEvent(
			'task.created',
			{
				reviewId: 'session-ops:review',
				taskId: 'session-ops:review:ops',
				title: 'Billing follow-up'
			},
			{
				createdAt: 350,
				id: 'session-ops:task.created'
			}
		),
		deliveryAttempts: 2,
		deliveryError: 'temporary outage',
		deliveryStatus: 'failed'
	});

	const record = await buildVoiceOperationsRecord({
		integrationEvents,
		reviews,
		sessionId: 'session-ops',
		store: trace,
		tasks
	});

	expect(record.reviews).toMatchObject({
		failed: 0,
		total: 1
	});
	expect(record.reviews?.reviews[0]?.title).toBe('Billing support review');
	expect(record.tasks).toMatchObject({
		open: 1,
		total: 1
	});
	expect(record.tasks?.tasks[0]?.title).toBe('Billing follow-up');
	expect(record.integrationEvents).toMatchObject({
		delivered: 1,
		failed: 1,
		sinkDeliveries: 1,
		total: 3
	});
	expect(record.integrationEvents?.events.map((event) => event.type)).toEqual([
		'call.completed',
		'review.saved',
		'task.created'
	]);
});

test('createVoiceOperationsRecordRoutes exposes JSON and HTML records', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	for (const event of [...createRecordEvents(), ...createGuardrailEvents()]) {
		await trace.append(event);
	}
	const app = createVoiceOperationsRecordRoutes({ redact: true, store: trace });

	const json = await app.handle(
		new Request('http://localhost/api/voice-operations/session-ops')
	);
	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		guardrails: {
			blocked: 2,
			stages: ['assistant-output', 'tool-input'],
			total: 2
		},
		handoffs: [
			{
				summary: 'Send billing question for [redacted] to billing.',
				targetAgentId: 'billing'
			}
		],
		sessionId: 'session-ops'
	});

	const html = await app.handle(
		new Request('http://localhost/voice-operations/session-ops')
	);
	const apiMarkdown = await app.handle(
		new Request('http://localhost/api/voice-operations/session-ops/incident.md')
	);
	const htmlMarkdown = await app.handle(
		new Request('http://localhost/voice-operations/session-ops/incident.md')
	);
	const htmlText = await html.text();
	expect(html.status).toBe(200);
	expect(html.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
	expect(htmlText).toContain('Voice Operations Record');
	expect(htmlText).toContain('Provider Decisions');
	expect(htmlText).toContain('Provider recovery');
	expect(htmlText).toContain('degraded');
	expect(htmlText).toContain('Guardrail Evidence');
	expect(htmlText).toContain('assistant.guardrail tool-input');
	expect(htmlText).toContain('operations-record-guardrail-proof');
	expect(htmlText).toContain('Copyable Incident Handoff');
	expect(htmlText).toContain('Download incident.md');
	expect(htmlText).toContain('/voice-operations/session-ops/incident.md');
	expect(htmlText).toContain('createVoiceOperationsRecordRoutes');
	expect(htmlText).toContain('lookup_invoice');
	expect(htmlText).not.toContain('alex@example.com');
	expect(apiMarkdown.headers.get('Content-Type')).toBe(
		'text/markdown; charset=utf-8'
	);
	const apiMarkdownText = await apiMarkdown.text();
	expect(apiMarkdown.status).toBe(200);
	expect(apiMarkdownText).toContain('# Voice incident handoff: session-ops');
	expect(apiMarkdownText).toContain('- Status: healthy');
	expect(apiMarkdownText).toContain('- Providers:');
	expect(apiMarkdownText).toContain(
		'- Provider recovery: status=degraded; selected=3; fallbacks=1; degraded=1; errors=0'
	);
	expect(apiMarkdownText).toContain('deepgram');
	expect(apiMarkdownText).toContain('openai');
	expect(apiMarkdownText).toContain('## Provider decisions');
	expect(apiMarkdownText).toContain('surface=live-call');
	expect(apiMarkdownText).toContain(
		'reason=live-call selected openai because it met the latency policy.'
	);
	expect(apiMarkdownText).toContain('status=fallback');
	expect(apiMarkdownText).toContain('fallback=anthropic');
	expect(apiMarkdownText).toContain('status=degraded');
	expect(apiMarkdownText).toContain('fallback=deterministic');
	expect(apiMarkdownText).toContain('## Guardrail evidence');
	expect(apiMarkdownText).toContain('assistant.guardrail assistant-output');
	expect(apiMarkdownText).toContain('operations-record-guardrail-proof');
	expect(htmlMarkdown.status).toBe(200);
	expect(htmlMarkdown.headers.get('Content-Type')).toBe(
		'text/markdown; charset=utf-8'
	);
	const htmlMarkdownText = await htmlMarkdown.text();
	expect(htmlMarkdownText).toContain('# Voice incident handoff: session-ops');
	expect(htmlMarkdownText).toContain('## Provider decisions');
	expect(htmlMarkdownText).toContain('## Next checks');
	expect(htmlMarkdownText).toContain('assistant.guardrail tool-input');
});

test('evaluateVoiceOperationsRecordGuardrails verifies required guardrail evidence', async () => {
	const record = await buildVoiceOperationsRecord({
		events: [...createRecordEvents(), ...createGuardrailEvents()],
		sessionId: 'session-ops'
	});

	const report = evaluateVoiceOperationsRecordGuardrails(record, {
		minBlocked: 2,
		proofs: ['operations-record-guardrail-proof'],
		ruleIds: ['support.no-medical-advice', 'support.tool-input-policy'],
		stages: ['assistant-output', 'tool-input'],
		statuses: ['fail'],
		toolNames: ['lookup_invoice']
	});

	expect(report).toMatchObject({
		blocked: 2,
		decisions: 2,
		ok: true,
		proofs: ['operations-record-guardrail-proof'],
		ruleIds: ['support.no-medical-advice', 'support.tool-input-policy'],
		stages: ['assistant-output', 'tool-input'],
		statuses: ['fail'],
		toolNames: ['lookup_invoice']
	});
	expect(
		assertVoiceOperationsRecordGuardrails(record, {
			minBlocked: 2,
			stages: ['assistant-output', 'tool-input']
		}).ok
	).toBe(true);

	const failed = evaluateVoiceOperationsRecordGuardrails(record, {
		minBlocked: 3,
		proofs: ['missing-proof'],
		ruleIds: ['missing-rule'],
		stages: ['missing-stage']
	});
	expect(failed.ok).toBe(false);
	expect(failed.issues).toContain(
		'Expected at least 3 blocked guardrail decisions, found 2.'
	);
	expect(failed.issues).toContain('Missing guardrail proofs: missing-proof');
	expect(failed.issues).toContain('Missing guardrail rule IDs: missing-rule');
	expect(failed.issues).toContain('Missing guardrail stages: missing-stage');
	expect(() =>
		assertVoiceOperationsRecordGuardrails(record, { minBlocked: 3 })
	).toThrow('Voice operations record guardrail assertion failed for session-ops');
});

test('renderVoiceOperationsRecordHTML includes copyable primitive snippet', async () => {
	const record = await buildVoiceOperationsRecord({
		events: createRecordEvents(),
		sessionId: 'session-ops'
	});
	const html = renderVoiceOperationsRecordHTML(record, {
		incidentHref: '/voice-operations/session-ops/incident.md'
	});

	expect(html).toContain('Call log replacement');
	expect(html).toContain('Transcript');
	expect(html).toContain('Voice incident handoff: session-ops');
	expect(html).toContain('Download incident.md');
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceOperationsRecordRoutes');
	expect(html).toContain('Telephony Media');
	expect(html).toContain('client.telephony_media');
	const markdown = renderVoiceOperationsRecordIncidentMarkdown(record);
	expect(markdown).toContain('Top errors: none');
	expect(markdown).toContain('Telephony media');
	expect(markdown).toContain('stream=MZ-ops');
});
