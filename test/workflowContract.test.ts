import { expect, test } from 'bun:test';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceWorkflowContract,
	createVoiceWorkflowContractHandler,
	runVoiceScenarioEvals
} from '../src';
import type {
	VoiceRouteResult,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from '../src';

type IntakeResult = {
	contact: {
		name?: string;
		phone?: string;
	};
	summary?: string;
};

const session = {
	id: 'session-1',
	scenarioId: 'guided',
	startedAt: Date.now(),
	status: 'active',
	traceId: 'trace-1',
	turns: []
} as VoiceSessionRecord;

const turn = {
	id: 'turn-1',
	startedAt: Date.now(),
	transcripts: []
} as VoiceTurnRecord;

const api = {} as VoiceSessionHandle<unknown, VoiceSessionRecord, IntakeResult>;

test('createVoiceWorkflowContract validates terminal route result fields', () => {
	const contract = createVoiceWorkflowContract<IntakeResult>({
		fields: [
			{ path: 'contact.name' },
			{ path: 'contact.phone' },
			{ path: 'summary' }
		],
		id: 'guided-intake',
		outcome: 'complete'
	});

	expect(
		contract.validateRouteResult({
			complete: true,
			result: {
				contact: { name: 'Ada' },
				summary: 'Needs a callback.'
			}
		})
	).toMatchObject({
		missingFields: ['contact.phone'],
		pass: false
	});

	expect(
		contract.validateRouteResult({
			complete: true,
			result: {
				contact: { name: 'Ada', phone: '555-0100' },
				summary: 'Needs a callback.'
			}
		})
	).toMatchObject({
		missingFields: [],
		pass: true
	});
});

test('workflow contract handler records trace evidence for scenario evals', async () => {
	const store = createVoiceMemoryTraceEventStore();
	const contract = createVoiceWorkflowContract<IntakeResult>({
		fields: [{ path: 'contact.name' }, { path: 'summary' }],
		id: 'guided-intake',
		label: 'Guided intake',
		outcome: 'complete',
		requiredDisposition: 'completed',
		scenarioId: 'guided'
	});
	const handler = createVoiceWorkflowContractHandler({
		contract,
		handler: async (): Promise<VoiceRouteResult<IntakeResult>> => ({
			complete: true,
			result: {
				contact: { name: 'Ada' },
				summary: 'Book a demo.'
			}
		}),
		store
	});

	await handler(session, turn, api, undefined);
	await store.append({
		at: Date.now(),
		payload: { disposition: 'completed', type: 'completed' },
		scenarioId: 'guided',
		sessionId: session.id,
		traceId: session.traceId,
		type: 'call.lifecycle'
	});

	const report = await runVoiceScenarioEvals({
		scenarios: [contract.toScenarioEval()],
		store
	});

	expect(report.status).toBe('pass');
	expect(report.scenarios[0]?.sessions[0]?.status).toBe('pass');
});

test('workflow contract scenario eval fails missing or failed contract evidence', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: Date.now(),
		payload: {
			contractId: 'guided-intake',
			issues: [{ code: 'workflow.missing_field', message: 'Missing name.' }],
			missingFields: ['contact.name'],
			requiredFields: ['contact.name'],
			status: 'fail'
		},
		scenarioId: 'guided',
		sessionId: 'session-2',
		type: 'workflow.contract'
	});

	const report = await runVoiceScenarioEvals({
		scenarios: [
			{
				id: 'guided-intake',
				requiredWorkflowContracts: ['guided-intake'],
				scenarioId: 'guided'
			}
		],
		store
	});

	expect(report.status).toBe('fail');
	expect(report.scenarios[0]?.sessions[0]?.issues.join(' ')).toContain(
		'Workflow contract failed'
	);
});
