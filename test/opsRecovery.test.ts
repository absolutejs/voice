import { expect, test } from 'bun:test';
import {
	buildVoiceOpsRecoveryReadinessCheck,
	buildVoiceOpsRecoveryReport,
	createVoiceAuditEvent,
	createVoiceAuditSinkDeliveryRecord,
	createVoiceHandoffDeliveryRecord,
	createVoiceMemoryAuditSinkDeliveryStore,
	createVoiceMemoryHandoffDeliveryStore,
	createVoiceMemoryTraceEventStore,
	createVoiceMemoryTraceSinkDeliveryStore,
	createVoiceOpsRecoveryRoutes,
	createVoiceTraceEvent,
	createVoiceTraceSinkDeliveryRecord,
	renderVoiceOpsRecoveryHTML,
	renderVoiceOpsRecoveryMarkdown,
	type VoiceSessionRecord
} from '../src';

const session = (id: string): VoiceSessionRecord => ({
	createdAt: 1,
	id,
	status: 'active',
	turns: []
});

test('buildVoiceOpsRecoveryReport summarizes recovered fallback unresolved failures queues interventions and SLOs', async () => {
	const traces = createVoiceMemoryTraceEventStore();
	await traces.append(
		createVoiceTraceEvent({
			at: 100,
			payload: {
				error: '429 rate limited',
				provider: 'openai',
				providerStatus: 'error',
				rateLimited: true
			},
			sessionId: 'failed-session',
			type: 'session.error'
		})
	);
	await traces.append(
		createVoiceTraceEvent({
			at: 110,
			payload: {
				provider: 'openai',
				providerStatus: 'fallback',
				selectedProvider: 'anthropic'
			},
			sessionId: 'recovered-session',
			type: 'session.error'
		})
	);
	await traces.append(
		createVoiceTraceEvent({
			at: 120,
			payload: {
				action: 'takeover',
				operatorId: 'operator-1'
			},
			sessionId: 'live-ops-session',
			type: 'operator.action'
		})
	);
	await traces.append(
		createVoiceTraceEvent({
			at: 130,
			payload: {
				elapsedMs: 5_000,
				provider: 'openai'
			},
			sessionId: 'slow-session',
			type: 'assistant.run'
		})
	);

	const auditDeliveries = createVoiceMemoryAuditSinkDeliveryStore();
	await auditDeliveries.set(
		'audit-failed',
		createVoiceAuditSinkDeliveryRecord({
			deliveryAttempts: 1,
			deliveryError: 'warehouse down',
			deliveryStatus: 'failed',
			events: [
				createVoiceAuditEvent({
					action: 'trace.export',
					type: 'operator.action'
				})
			],
			id: 'audit-failed'
		})
	);

	const traceDeliveries = createVoiceMemoryTraceSinkDeliveryStore();
	await traceDeliveries.set(
		'trace-pending',
		createVoiceTraceSinkDeliveryRecord({
			deliveryStatus: 'pending',
			events: [
				createVoiceTraceEvent({
					at: 140,
					payload: {},
					sessionId: 'trace-pending-session',
					type: 'call.lifecycle'
				})
			],
			id: 'trace-pending'
		})
	);

	const handoffDeliveries = createVoiceMemoryHandoffDeliveryStore();
	const failedHandoff = {
		...createVoiceHandoffDeliveryRecord({
			action: 'transfer',
			context: {},
			id: 'handoff-failed',
			session: session('handoff-session'),
			target: 'billing'
		}),
		deliveryAttempts: 1,
		deliveryStatus: 'failed' as const
	};
	await handoffDeliveries.set(failedHandoff.id, failedHandoff);

	const report = await buildVoiceOpsRecoveryReport({
		auditDeliveries,
		handoffDeliveries,
		latency: {
			failAfterMs: 1_000
		},
		links: {
			operationsRecords: '/voice-operations/:sessionId',
			traces: '/traces/:sessionId'
		},
		providers: ['openai', 'anthropic'],
		traceDeliveries,
		traces
	});

	expect(report.status).toBe('fail');
	expect(report.providers.recoveredFallbacks).toBe(1);
	expect(report.providers.unresolvedFailures).toBe(1);
	expect(report.interventions.total).toBe(1);
	expect(report.auditDeliveries?.failed).toBe(1);
	expect(report.traceDeliveries?.pending).toBe(1);
	expect(report.handoffDeliveries?.failed).toBe(1);
	expect(report.latency?.failed).toBeGreaterThan(0);
	expect(report.failedSessions[0]?.sessionId).toBe('failed-session');
	expect(report.failedSessions[0]?.operationsRecordHref).toBe(
		'/voice-operations/failed-session'
	);
	expect(report.issues.map((issue) => issue.code)).toContain(
		'voice.ops_recovery.provider_unresolved_failure'
	);
	expect(
		report.issues.find(
			(issue) => issue.code === 'voice.ops_recovery.provider_unresolved_failure'
		)?.href
	).toBe('/voice-operations/failed-session');
	expect(report.issues.map((issue) => issue.code)).toContain(
		'voice.ops_recovery.latency_slo_failed'
	);
	expect(
		report.issues.find(
			(issue) => issue.code === 'voice.ops_recovery.latency_slo_failed'
		)?.href
	).toBe('/voice-operations/slow-session');
});

test('ops recovery renderers and readiness check expose stable status', async () => {
	const report = await buildVoiceOpsRecoveryReport({
		events: [
			createVoiceTraceEvent({
				at: 100,
				payload: {
					provider: 'openai',
					providerStatus: 'success'
				},
				sessionId: 'healthy',
				type: 'session.error'
			})
		],
		latency: false,
		providers: ['openai']
	});

	expect(report.status).toBe('pass');
	expect(buildVoiceOpsRecoveryReadinessCheck(report)).toMatchObject({
		label: 'Ops recovery',
		status: 'pass'
	});
	expect(renderVoiceOpsRecoveryMarkdown(report)).toContain(
		'Voice Ops Recovery'
	);
	expect(renderVoiceOpsRecoveryHTML(report)).toContain('Voice Ops Recovery');
});

test('createVoiceOpsRecoveryRoutes exposes JSON HTML and Markdown', async () => {
	const app = createVoiceOpsRecoveryRoutes({
		events: [
			createVoiceTraceEvent({
				at: 100,
				payload: {
					elapsedMs: 50,
					provider: 'openai'
				},
				sessionId: 'route-session',
				type: 'assistant.run'
			})
		],
		path: '/api/recovery',
		providers: ['openai']
	});

	const json = await app.handle(new Request('http://localhost/api/recovery'));
	expect(json.status).toBe(200);
	expect((await json.json()) as { status: string }).toMatchObject({
		status: 'pass'
	});

	const html = await app.handle(new Request('http://localhost/ops-recovery'));
	expect(html.status).toBe(200);
	expect(await html.text()).toContain('Voice Ops Recovery');

	const markdown = await app.handle(
		new Request('http://localhost/api/recovery.md')
	);
	expect(markdown.status).toBe(200);
	expect(await markdown.text()).toContain('# Voice Ops Recovery');
});
