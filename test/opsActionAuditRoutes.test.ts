import { expect, test } from 'bun:test';
import {
	createVoiceMemoryAuditEventStore,
	createVoiceMemoryTraceEventStore,
	buildVoiceOpsActionHistoryReport,
	createVoiceOpsActionAuditRoutes,
	recordVoiceOpsActionAudit
} from '../src';

test('recordVoiceOpsActionAudit stores operator audit and trace evidence', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const trace = createVoiceMemoryTraceEventStore();

	await recordVoiceOpsActionAudit(
		{
			actionId: 'delivery-runtime.tick',
			body: { delivered: 1 },
			ok: true,
			ranAt: 123,
			status: 200
		},
		{ audit, trace }
	);

	expect(await audit.list({ type: 'operator.action' })).toHaveLength(1);
	expect(await trace.list({ type: 'operator.action' })).toMatchObject([
		{
			payload: {
				actionId: 'delivery-runtime.tick',
				ok: true,
				status: 200
			},
			sessionId: 'voice-ops-action-center'
		}
	]);
});

test('createVoiceOpsActionAuditRoutes accepts action result posts', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	const trace = createVoiceMemoryTraceEventStore();
	const routes = createVoiceOpsActionAuditRoutes({ audit, trace });

	const response = await routes.handle(
		new Request('http://localhost/api/voice/ops-actions/audit', {
			body: JSON.stringify({
				actionId: 'turn-latency.proof',
				ok: false,
				error: 'proof failed',
				ranAt: 456,
				status: 500
			}),
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST'
		})
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ ok: true });
	expect(await audit.list({ type: 'operator.action' })).toMatchObject([
		{
			action: 'turn-latency.proof',
			outcome: 'error'
		}
	]);
	expect(await trace.list({ type: 'operator.action' })).toHaveLength(1);
});

test('buildVoiceOpsActionHistoryReport summarizes recent operator actions', async () => {
	const audit = createVoiceMemoryAuditEventStore();
	await recordVoiceOpsActionAudit(
		{
			actionId: 'delivery-runtime.tick',
			ok: true,
			ranAt: 123,
			status: 200
		},
		{ audit }
	);
	await recordVoiceOpsActionAudit(
		{
			actionId: 'turn-latency.proof',
			error: 'failed',
			ok: false,
			ranAt: 456,
			status: 0
		},
		{ audit }
	);

	const report = await buildVoiceOpsActionHistoryReport({ audit });

	expect(report.total).toBe(2);
	expect(report.failed).toBe(1);
	expect(report.entries[0]?.actionId).toBe('turn-latency.proof');
});
