import { expect, test } from 'bun:test';
import {
	acknowledgeVoiceMonitorIssue,
	buildVoiceMonitorRunReport,
	createVoiceMemoryMonitorNotifierDeliveryReceiptStore,
	createVoiceMemoryMonitorIssueStore,
	createVoiceMonitorRoutes,
	createVoiceMonitorRunner,
	createVoiceMonitorRunnerRoutes,
	createVoiceMonitorWebhookNotifier,
	deliverVoiceMonitorIssueNotifications,
	renderVoiceMonitorMarkdown,
	resolveVoiceMonitorIssue,
	type VoiceMonitorDefinition
} from '../src';

type Evidence = {
	errorRate: number;
	sessionId: string;
};

const errorRateMonitor: VoiceMonitorDefinition<Evidence> = {
	evaluate: ({ evidence }) => ({
		detail: `Error rate is ${evidence.errorRate}.`,
		impactedSessions: [evidence.sessionId],
		operationsRecordHrefs: [`/voice-operations/${evidence.sessionId}`],
		status: evidence.errorRate > 0.02 ? 'fail' : 'pass',
		threshold: 0.02,
		value: evidence.errorRate
	}),
	id: 'error-rate',
	label: 'Error rate',
	severity: 'critical'
};

test('buildVoiceMonitorRunReport creates durable critical issues', async () => {
	const store = createVoiceMemoryMonitorIssueStore();
	const report = await buildVoiceMonitorRunReport({
		evidence: {
			errorRate: 0.05,
			sessionId: 'session-monitor'
		},
		issueStore: store,
		monitors: [errorRateMonitor],
		now: 100
	});

	expect(report).toMatchObject({
		status: 'fail',
		summary: {
			criticalOpen: 1,
			failed: 1,
			open: 1,
			total: 1
		}
	});
	expect(report.issues[0]).toMatchObject({
		id: 'voice-monitor:error-rate:session-monitor',
		monitorId: 'error-rate',
		operationsRecordHrefs: ['/voice-operations/session-monitor'],
		severity: 'critical',
		status: 'open'
	});
	expect(renderVoiceMonitorMarkdown(report)).toContain('Error rate is 0.05');
});

test('deliverVoiceMonitorIssueNotifications writes notifier receipts', async () => {
	const issueStore = createVoiceMemoryMonitorIssueStore();
	const receiptStore = createVoiceMemoryMonitorNotifierDeliveryReceiptStore();
	await buildVoiceMonitorRunReport({
		evidence: {
			errorRate: 0.05,
			sessionId: 'session-notify'
		},
		issueStore,
		monitors: [errorRateMonitor],
		now: 100
	});

	const report = await deliverVoiceMonitorIssueNotifications({
		issueStore,
		notifiers: [
			{
				deliver: ({ issue }) => ({
					detail: `sent ${issue.id}`,
					status: 'sent'
				}),
				id: 'ops-webhook',
				label: 'Ops webhook'
			}
		],
		now: 150,
		receiptStore
	});

	expect(report).toMatchObject({
		status: 'pass',
		summary: {
			failed: 0,
			notifiers: 1,
			sent: 1,
			total: 1
		}
	});
	expect((await receiptStore.list())[0]).toMatchObject({
		issueId: 'voice-monitor:error-rate:session-notify',
		notifierId: 'ops-webhook',
		status: 'sent'
	});
});

test('createVoiceMonitorWebhookNotifier posts issue payloads', async () => {
	const requests: unknown[] = [];
	const notifier = createVoiceMonitorWebhookNotifier({
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)));
			return new Response('ok', { status: 202 });
		},
		id: 'slack-webhook',
		url: 'https://hooks.example.test/voice'
	});
	const issue = {
		createdAt: 100,
		id: 'issue-webhook',
		impactedSessions: ['session-webhook'],
		label: 'Error rate',
		lastSeenAt: 100,
		monitorId: 'error-rate',
		operationsRecordHrefs: ['/voice-operations/session-webhook'],
		severity: 'critical' as const,
		status: 'open' as const
	};

	const result = await notifier.deliver({ issue, now: 125 });

	expect(result).toEqual({
		detail: 'HTTP 202',
		status: 'sent'
	});
	expect(requests[0]).toMatchObject({
		issueId: 'issue-webhook',
		operationsRecordHrefs: ['/voice-operations/session-webhook']
	});
});

test('createVoiceMonitorRunner ticks monitors and notifier delivery', async () => {
	const issueStore = createVoiceMemoryMonitorIssueStore();
	const receiptStore = createVoiceMemoryMonitorNotifierDeliveryReceiptStore();
	const runner = createVoiceMonitorRunner({
		evidence: {
			errorRate: 0.05,
			sessionId: 'session-runner'
		},
		issueStore,
		monitors: [errorRateMonitor],
		notifiers: [
			{
				deliver: ({ issue }) => ({
					detail: `runner sent ${issue.id}`,
					status: 'sent'
				}),
				id: 'runner-webhook',
				label: 'Runner webhook'
			}
		],
		now: () => 500,
		receiptStore
	});

	const result = await runner.tick();

	expect(result.monitoring).toMatchObject({
		status: 'fail',
		summary: {
			criticalOpen: 1
		}
	});
	expect(result.notifierDelivery).toMatchObject({
		status: 'pass',
		summary: {
			sent: 1
		}
	});
	expect((await receiptStore.list())[0]).toMatchObject({
		issueId: 'voice-monitor:error-rate:session-runner',
		notifierId: 'runner-webhook',
		status: 'sent'
	});
	expect(runner.isRunning()).toBe(false);
	runner.start();
	expect(runner.isRunning()).toBe(true);
	runner.stop();
	expect(runner.isRunning()).toBe(false);
});

test('createVoiceMonitorRunnerRoutes exposes status and manual controls', async () => {
	const runner = createVoiceMonitorRunner({
		evidence: {
			errorRate: 0,
			sessionId: 'session-runner-routes'
		},
		monitors: [errorRateMonitor],
		now: () => 600
	});
	const app = createVoiceMonitorRunnerRoutes({ runner });

	const status = await app.handle(
		new Request('http://localhost/api/voice/monitor-runner')
	);
	expect(await status.json()).toEqual({ isRunning: false });

	const tick = await app.handle(
		new Request('http://localhost/api/voice/monitor-runner/tick', {
			method: 'POST'
		})
	);
	expect(await tick.json()).toMatchObject({
		monitoring: {
			status: 'pass'
		}
	});

	const started = await app.handle(
		new Request('http://localhost/api/voice/monitor-runner/start', {
			method: 'POST'
		})
	);
	expect(await started.json()).toEqual({ isRunning: true });

	const stopped = await app.handle(
		new Request('http://localhost/api/voice/monitor-runner/stop', {
			method: 'POST'
		})
	);
	expect(await stopped.json()).toEqual({ isRunning: false });
});

test('monitor issues can be acknowledged and resolved', async () => {
	const store = createVoiceMemoryMonitorIssueStore();
	await buildVoiceMonitorRunReport({
		evidence: {
			errorRate: 0.05,
			sessionId: 'session-monitor'
		},
		issueStore: store,
		monitors: [errorRateMonitor],
		now: 100
	});

	const acknowledged = await acknowledgeVoiceMonitorIssue(
		store,
		'voice-monitor:error-rate:session-monitor',
		{ actorId: 'operator', now: 125 }
	);
	expect(acknowledged).toMatchObject({
		acknowledgedAt: 125,
		acknowledgedBy: 'operator',
		status: 'acknowledged'
	});

	const resolved = await resolveVoiceMonitorIssue(
		store,
		'voice-monitor:error-rate:session-monitor',
		{ actorId: 'operator', now: 150 }
	);
	expect(resolved).toMatchObject({
		resolvedAt: 150,
		resolvedBy: 'operator',
		status: 'resolved'
	});
});

test('createVoiceMonitorRoutes exposes reports and issue lifecycle actions', async () => {
	const store = createVoiceMemoryMonitorIssueStore();
	const receiptStore = createVoiceMemoryMonitorNotifierDeliveryReceiptStore();
	const app = createVoiceMonitorRoutes({
		evidence: {
			errorRate: 0.05,
			sessionId: 'session-route'
		},
		issueStore: store,
		monitors: [errorRateMonitor],
		notifiers: [
			{
				deliver: () => ({ status: 'sent' }),
				id: 'ops-webhook',
				label: 'Ops webhook'
			}
		],
		now: 200,
		receiptStore
	});

	const report = await app.handle(new Request('http://localhost/api/voice/monitors'));
	expect(await report.json()).toMatchObject({
		status: 'fail',
		summary: {
			criticalOpen: 1
		}
	});

	const html = await app.handle(new Request('http://localhost/voice/monitors'));
	expect(await html.text()).toContain('createVoiceMonitorRoutes');

	const delivered = await app.handle(
		new Request('http://localhost/api/voice/monitor-notifications', {
			method: 'POST'
		})
	);
	expect(await delivered.json()).toMatchObject({
		status: 'pass',
		summary: {
			sent: 1
		}
	});

	const acknowledged = await app.handle(
		new Request(
			'http://localhost/api/voice/monitor-issues/voice-monitor:error-rate:session-route/acknowledge',
			{
				body: JSON.stringify({ actorId: 'operator' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			}
		)
	);
	expect(await acknowledged.json()).toMatchObject({
		acknowledgedBy: 'operator',
		status: 'acknowledged'
	});
});
