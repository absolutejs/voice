import { expect, test } from 'bun:test';
import {
	createVoiceAgentTool,
	createVoiceToolContract,
	createVoiceToolContractRoutes,
	createVoiceToolRuntimeContractDefaults,
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
	});

	expect(report).toMatchObject({
		pass: true,
		toolName: 'create_ticket'
	});
	expect(calls).toBe(2);
	expect(report.cases[0]?.attempts).toBe(2);
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
		]
	});

	expect(report).toMatchObject({
		failed: 1,
		passed: 1,
		status: 'fail',
		total: 2
	});
	expect(renderVoiceToolContractHTML(report)).toContain('broken_tool');
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
		]
	});

	const json = await routes.handle(
		new Request('http://localhost/api/tool-contracts')
	);
	const html = await routes.handle(
		new Request('http://localhost/api/tool-contracts/htmx')
	);

	expect(await json.json()).toMatchObject({
		status: 'pass',
		total: 1
	});
	expect(await html.text()).toContain('Voice Tool Contracts');
});
