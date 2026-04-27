import { expect, test } from 'bun:test';
import {
	createVoiceMemoryStore,
	createVoiceOutcomeContractRoutes,
	createVoiceSessionRecord,
	runVoiceOutcomeContractSuite
} from '../src';

test('runVoiceOutcomeContractSuite verifies persisted business artifacts', async () => {
	const session = createVoiceSessionRecord('session-outcome', 'guided');
	session.status = 'completed';
	session.call = {
		disposition: 'transferred',
		events: [
			{ at: 1, type: 'start' },
			{
				at: 2,
				disposition: 'transferred',
				reason: 'caller-requested-transfer',
				target: 'billing',
				type: 'transfer'
			}
		],
		lastEventAt: 2,
		startedAt: 1
	};
	const report = await runVoiceOutcomeContractSuite({
		contracts: [
			{
				expectedDisposition: 'transferred',
				id: 'transfer-outcome',
				requireHandoffActions: ['transfer'],
				requireIntegrationEvents: ['call.completed', 'review.saved', 'task.created'],
				requireTask: true
			}
		],
		events: [
			{
				createdAt: 2,
				id: 'event-call',
				payload: { disposition: 'transferred', sessionId: session.id },
				type: 'call.completed'
			},
			{
				createdAt: 3,
				id: 'event-review',
				payload: { outcome: 'transferred', reviewId: 'review-1' },
				type: 'review.saved'
			},
			{
				createdAt: 4,
				id: 'event-task',
				payload: { outcome: 'transferred', taskId: 'task-1' },
				type: 'task.created'
			}
		],
		handoffs: [
			{
				action: 'transfer',
				context: {},
				createdAt: 2,
				deliveryStatus: 'delivered',
				id: 'handoff-1',
				session,
				sessionId: session.id,
				updatedAt: 3
			}
		],
		reviews: [
			{
				errors: [],
				id: 'review-1',
				latencyBreakdown: [],
				notes: [],
				summary: { outcome: 'transferred', pass: true },
				timeline: [],
				title: 'Transfer review',
				transcript: { actual: 'transfer me' }
			}
		],
		sessions: [session],
		tasks: [
			{
				createdAt: 4,
				description: 'Verify transfer',
				history: [],
				id: 'task-1',
				kind: 'transfer-check',
				outcome: 'transferred',
				recommendedAction: 'Verify handoff',
				status: 'open',
				title: 'Verify transfer',
				updatedAt: 4
			}
		]
	});

	expect(report).toMatchObject({
		failed: 0,
		passed: 1,
		status: 'pass',
		total: 1
	});
	expect(report.contracts[0]?.matched).toMatchObject({
		handoffs: 1,
		integrationEvents: 3,
		reviews: 1,
		sessions: 1,
		tasks: 1
	});
});

test('createVoiceOutcomeContractRoutes reports missing artifacts', async () => {
	const store = createVoiceMemoryStore();
	const session = await store.getOrCreate('session-completed');
	session.status = 'completed';
	await store.set(session.id, session);
	const routes = createVoiceOutcomeContractRoutes({
		contracts: [
			{
				expectedDisposition: 'completed',
				id: 'completed-review',
				requireReview: true
			}
		],
		htmlPath: '/outcome-contracts',
		path: '/api/outcome-contracts',
		sessions: store
	});
	const json = await routes.handle(
		new Request('http://localhost/api/outcome-contracts')
	);
	const html = await routes.handle(
		new Request('http://localhost/outcome-contracts')
	);

	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		failed: 1,
		status: 'fail'
	});
	expect(await html.text()).toContain('Expected at least one matching review');
});
