import { expect, test } from 'bun:test';
import {
	createVoiceAgentTool,
	createVoiceToolContract,
	createVoiceToolContractRoutes,
	createVoiceToolRuntimeContractDefaults,
	evaluateVoiceToolContractEvidence,
	renderVoiceToolContractHTML,
	runVoiceToolContractSuite,
	runVoiceToolContract
} from '../src';

test('runVoiceToolContract validates retry and idempotency behavior', async () => {
	let calls = 0;
	const tool = createVoiceAgentTool({
		execute: () => {
			calls += 1;
			if (calls === 1) {
				throw new Error('temporary failure');
			}
			return { ticketId: 'ticket-1' };
		},
		name: 'create_ticket'
	});

	const report = await runVoiceToolContract({
		cases: [
			{
				args: { title: 'Need help' },
				expect: {
					expectedAttempts: 2,
					expectedResult: { ticketId: 'ticket-1' },
					expectIdempotent: true,
					expectStatus: 'ok',
					expectTimedOut: false
				},
				id: 'retry-create-ticket'
			}
		],
		defaultRuntime: createVoiceToolRuntimeContractDefaults(),
		id: 'ticket-tool',
		tool
	}, {
		operationsRecordHref: '/voice-operations/:sessionId'
	});

	expect(report).toMatchObject({
		pass: true,
		toolName: 'create_ticket'
	});
	expect(calls).toBe(2);
	expect(report.cases[0]?.attempts).toBe(2);
	expect(report.cases[0]?.sessionId).toBe(
		'tool-contract-ticket-tool-retry-create-ticket'
	);
	expect(report.cases[0]?.operationsRecordHref).toBe(
		'/voice-operations/tool-contract-ticket-tool-retry-create-ticket'
	);
});

test('runVoiceToolContract reports timeout and error shaping failures', async () => {
	const tool = createVoiceAgentTool({
		execute: async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			return { ok: true };
		},
		name: 'slow_lookup'
	});

	const report = await runVoiceToolContract({
		cases: [
			{
				args: {},
				expect: {
					expectedErrorIncludes: 'timed out',
					expectStatus: 'error',
					expectTimedOut: true
				},
				id: 'timeout'
			}
		],
		defaultRuntime: {
			timeoutMs: 1
		},
		id: 'slow-tool',
		tool
	});

	expect(report.pass).toBe(true);
	expect(report.cases[0]).toMatchObject({
		status: 'error',
		timedOut: true
	});
});

test('createVoiceToolContract assert throws with actionable issues', async () => {
	const contract = createVoiceToolContract({
		cases: [
			{
				args: {},
				expect: {
					expectedResult: { ok: true },
					expectStatus: 'ok'
				},
				id: 'wrong-result'
			}
		],
		id: 'broken-tool',
		tool: createVoiceAgentTool({
			execute: () => ({ ok: false }),
			name: 'broken_tool'
		})
	});

	await expect(contract.assert()).rejects.toThrow(
		'Tool result did not match expected result.'
	);
});

test('runVoiceToolContractSuite aggregates contract reports', async () => {
	const report = await runVoiceToolContractSuite({
		contracts: [
			{
				cases: [
					{
						args: {},
						expect: {
							expectedResult: { ok: true },
							expectStatus: 'ok'
						},
						id: 'ok'
					}
				],
				id: 'healthy-tool',
				tool: createVoiceAgentTool({
					execute: () => ({ ok: true }),
					name: 'healthy_tool'
				})
			},
			{
				cases: [
					{
						args: {},
						expect: {
							expectedResult: { ok: true },
							expectStatus: 'ok'
						},
						id: 'bad'
					}
				],
				id: 'broken-tool',
				tool: createVoiceAgentTool({
					execute: () => ({ ok: false }),
					name: 'broken_tool'
				})
			}
		],
		operationsRecordHref: '/voice-operations/:sessionId'
	});

	expect(report).toMatchObject({
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	const html = renderVoiceToolContractHTML(report);
	expect(html).toContain('broken_tool');
	expect(html).toContain('/voice-operations/tool-contract-broken-tool-bad');
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceToolContractRoutes');
});

test('createVoiceToolContractRoutes exposes json and html reports', async () => {
	const routes = createVoiceToolContractRoutes({
		contracts: [
			{
				cases: [
					{
						args: {},
						expect: {
							expectedResult: { ok: true },
							expectStatus: 'ok'
						},
						id: 'ok'
					}
				],
				id: 'healthy-tool',
				tool: createVoiceAgentTool({
					execute: () => ({ ok: true }),
					name: 'healthy_tool'
				})
			}
		],
		operationsRecordHref: (sessionId) => `/ops/records/${sessionId}`
	});

	const json = await routes.handle(
		new Request('http://localhost/api/tool-contracts')
	);
	const html = await routes.handle(
		new Request('http://localhost/api/tool-contracts/htmx')
	);

	expect(await json.json()).toMatchObject({
		contracts: [
			{
				cases: [
					{
						operationsRecordHref: '/ops/records/tool-contract-healthy-tool-ok',
						sessionId: 'tool-contract-healthy-tool-ok'
					}
				]
			}
		],
		status: 'pass',
		total: 1
	});
	const htmlText = await html.text();
	expect(htmlText).toContain('Voice Tool Contracts');
	expect(htmlText).toContain('/ops/records/tool-contract-healthy-tool-ok');
	expect(htmlText).toContain('createVoiceToolContractRoutes');
});

test('evaluateVoiceToolContractEvidence accepts complete tool proof', () => {
	const report = evaluateVoiceToolContractEvidence(
		{
			checkedAt: 1,
			contracts: [
				{
					cases: [
						{
							attempts: 2,
							caseId: 'retry-create-ticket',
							elapsedMs: 20,
							issues: [],
							operationsRecordHref:
								'/voice-operations/tool-contract-ticket-tool-retry-create-ticket',
							pass: true,
							sessionId: 'tool-contract-ticket-tool-retry-create-ticket',
							status: 'ok',
							timedOut: false
						}
					],
					contractId: 'ticket-tool',
					issues: [],
					pass: true,
					toolName: 'create_ticket'
				}
			],
			failed: 0,
			passed: 1,
			status: 'pass',
			total: 1
		},
		{
			maxFailed: 0,
			maxIssues: 0,
			maxTimedOut: 0,
			minCases: 1,
			minContracts: 1,
			requireOperationRecordHrefs: true,
			requiredCaseStatuses: ['ok'],
			requiredContractIds: ['ticket-tool'],
			requiredToolNames: ['create_ticket']
		}
	);

	expect(report.ok).toBe(true);
	expect(report.cases).toBe(1);
	expect(report.toolNames).toEqual(['create_ticket']);
});

test('evaluateVoiceToolContractEvidence reports missing tool proof', () => {
	const report = evaluateVoiceToolContractEvidence(
		{
			checkedAt: 1,
			contracts: [
				{
					cases: [
						{
							attempts: 1,
							caseId: 'bad',
							elapsedMs: 10,
							issues: [{ caseId: 'bad', code: 'tool.result_mismatch', message: 'bad' }],
							pass: false,
							sessionId: 'tool-contract-broken-tool-bad',
							status: 'error',
							timedOut: true
						}
					],
					contractId: 'broken-tool',
					issues: [{ caseId: 'bad', code: 'tool.result_mismatch', message: 'bad' }],
					pass: false,
					toolName: 'broken_tool'
				}
			],
			failed: 1,
			passed: 0,
			status: 'fail',
			total: 1
		},
		{
			maxFailed: 0,
			maxIssues: 0,
			maxTimedOut: 0,
			requireOperationRecordHrefs: true,
			requiredCaseStatuses: ['ok'],
			requiredContractIds: ['ticket-tool'],
			requiredToolNames: ['create_ticket']
		}
	);

	expect(report.ok).toBe(false);
	expect(report.issues).toEqual(
		expect.arrayContaining([
			'Expected at most 0 failing tool contract(s), found 1.',
			'Expected at most 0 tool contract issue(s), found 1.',
			'Expected at most 0 timed out tool contract case(s), found 1.',
			'Expected every tool contract case to include an operations record href; 1 missing.',
			'Missing tool contract: ticket-tool.',
			'Missing tool contract tool: create_ticket.',
			'Missing tool contract case status: ok.'
		])
	);
});
