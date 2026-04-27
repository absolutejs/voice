import { expect, test } from 'bun:test';
import {
	createVoiceAgent,
	createVoiceAgentSquad,
	createVoiceAgentTool,
	createVoiceMemoryTraceEventStore,
	createVoiceSessionRecord,
	createVoiceToolRuntime,
	type VoiceAgentModel,
	type VoiceAgentTool,
	type VoiceSessionHandle,
	type VoiceSessionRecord,
	type VoiceTurnRecord
} from '../src';

const createTurn = (text: string): VoiceTurnRecord => ({
	committedAt: 100,
	id: 'turn-1',
	text,
	transcripts: []
});

const createApi = () =>
	({
		id: 'session-agent'
	}) as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

test('createVoiceAgent executes tools and feeds results into the next model pass', async () => {
	const calls: string[] = [];
	const lookupOrder = createVoiceAgentTool({
		execute: ({ args }) => {
			calls.push(`lookup:${String(args.orderId)}`);
			return {
				status: 'shipped'
			};
		},
		name: 'lookup_order',
		parameters: {
			properties: {
				orderId: {
					type: 'string'
				}
			},
			type: 'object'
		}
	});
	const model: VoiceAgentModel = {
		generate: ({ messages, tools }) => {
			expect(tools.map((tool) => tool.name)).toEqual(['lookup_order']);
			const toolMessage = messages.find((message) => message.role === 'tool');
			if (!toolMessage) {
				return {
					toolCalls: [
						{
							args: {
								orderId: 'order-123'
							},
							id: 'call-1',
							name: 'lookup_order'
						}
					]
				};
			}

			return {
				assistantText: `Your order is ${JSON.parse(toolMessage.content).status}.`
			};
		}
	};
	const agent = createVoiceAgent({
		id: 'support',
		model,
		tools: [lookupOrder]
	});

	const result = await agent.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent'),
		turn: createTurn('Where is order 123?')
	});

	expect(calls).toEqual(['lookup:order-123']);
	expect(result.assistantText).toBe('Your order is shipped.');
	expect(result.toolResults).toMatchObject([
		{
			status: 'ok',
			toolCallId: 'call-1',
			toolName: 'lookup_order'
		}
	]);
	expect(result.messages.map((message) => message.role)).toEqual([
		'user',
		'assistant',
		'tool',
		'assistant'
	]);
});

test('createVoiceAgent can run tools through reliability runtime retries', async () => {
	let attempts = 0;
	const agent = createVoiceAgent({
		id: 'support',
		model: {
			generate: ({ messages }) =>
				messages.some((message) => message.role === 'tool')
					? {
							assistantText: 'Lookup recovered.'
						}
					: {
							toolCalls: [
								{
									args: {
										accountId: 'acct-1'
									},
									id: 'tool-1',
									name: 'lookup_account'
								}
							]
						}
		},
		toolRuntime: createVoiceToolRuntime({
			maxRetries: 1
		}),
		tools: [
			createVoiceAgentTool({
				execute: () => {
					attempts += 1;
					if (attempts === 1) {
						throw new Error('temporary provider error');
					}
					return {
						status: 'active'
					};
				},
				name: 'lookup_account'
			})
		]
	});

	const result = await agent.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent'),
		turn: createTurn('Check account')
	});

	expect(attempts).toBe(2);
	expect(result.assistantText).toBe('Lookup recovered.');
	expect(result.toolResults).toMatchObject([
		{
			metadata: {
				attempts: 2,
				timedOut: false
			},
			status: 'ok',
			toolName: 'lookup_account'
		}
	]);
});

test('createVoiceToolRuntime dedupes in-flight idempotent tool executions', async () => {
	let calls = 0;
	const runtime = createVoiceToolRuntime({
		idempotencyKey: ({ session, toolName, turn }) =>
			`${session.id}:${turn.id}:${toolName}`
	});
	const tool = createVoiceAgentTool({
		execute: async () => {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 1));
			return {
				ok: true
			};
		},
		name: 'write_ticket'
	});
	const session = createVoiceSessionRecord('session-agent');
	const turn = createTurn('Create a ticket');
	const [first, second] = await Promise.all([
		runtime.execute({
			api: createApi(),
			args: {},
			context: {},
			session,
			tool,
			toolCallId: 'tool-1',
			turn
		}),
		runtime.execute({
			api: createApi(),
			args: {},
			context: {},
			session,
			tool,
			toolCallId: 'tool-1',
			turn
		})
	]);

	expect(calls).toBe(1);
	expect(first.result).toEqual({ ok: true });
	expect(second.result).toEqual({ ok: true });
	expect(first.idempotencyKey).toBe('session-agent:turn-1:write_ticket');
});

test('createVoiceToolRuntime can cache completed idempotent tool executions', async () => {
	let calls = 0;
	const runtime = createVoiceToolRuntime({
		idempotencyKey: ({ session, toolName, turn }) =>
			`${session.id}:${turn.id}:${toolName}`,
		idempotencyTtlMs: 60_000
	});
	const tool = createVoiceAgentTool({
		execute: () => {
			calls += 1;
			return {
				call: calls
			};
		},
		name: 'create_ticket'
	});
	const session = createVoiceSessionRecord('session-agent');
	const turn = createTurn('Create a ticket');
	const first = await runtime.execute({
		api: createApi(),
		args: {},
		context: {},
		session,
		tool,
		toolCallId: 'tool-1',
		turn
	});
	const second = await runtime.execute({
		api: createApi(),
		args: {},
		context: {},
		session,
		tool,
		toolCallId: 'tool-1',
		turn
	});

	expect(calls).toBe(1);
	expect(first.result).toEqual({ call: 1 });
	expect(second.result).toEqual({ call: 1 });
});

test('createVoiceAgent records model, tool, and result trace events', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const agent = createVoiceAgent({
		id: 'support',
		model: {
			generate: ({ messages }) =>
				messages.some((message) => message.role === 'tool')
					? {
							assistantText: 'The account is active.'
						}
					: {
							toolCalls: [
								{
									args: {
										accountId: 'acct-1'
									},
									id: 'tool-1',
									name: 'lookup_account'
								}
							]
						}
		},
		trace,
		tools: [
			createVoiceAgentTool({
				execute: () => ({
					status: 'active'
				}),
				name: 'lookup_account'
			})
		]
	});

	await agent.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent', 'scenario-agent'),
		turn: createTurn('Check account')
	});

	expect((await trace.list()).map((event) => event.type).sort()).toEqual([
		'agent.model',
		'agent.model',
		'agent.result',
		'agent.tool'
	].sort());
	expect(await trace.list({ scenarioId: 'scenario-agent' })).toHaveLength(4);
	expect((await trace.list({ type: 'agent.tool' }))[0]).toMatchObject({
		payload: {
			agentId: 'support',
			status: 'ok',
			toolCallId: 'tool-1',
			toolName: 'lookup_account'
		},
		sessionId: 'session-agent',
		turnId: 'turn-1'
	});
});

test('createVoiceAgentSquad records handoff trace events', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const intake = createVoiceAgent({
		id: 'intake',
		model: {
			generate: () => ({
				handoff: {
					reason: 'billing question',
					targetAgentId: 'billing'
				}
			})
		}
	});
	const billing = createVoiceAgent({
		id: 'billing',
		model: {
			generate: () => ({
				assistantText: 'Billing can help.'
			})
		}
	});
	const squad = createVoiceAgentSquad({
		agents: [intake, billing],
		defaultAgentId: 'intake',
		id: 'front-desk',
		trace
	});

	await squad.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent'),
		turn: createTurn('Billing please')
	});

	expect(await trace.list({ type: 'agent.handoff' })).toMatchObject([
		{
			payload: {
				agentId: 'front-desk',
				fromAgentId: 'intake',
				reason: 'billing question',
				targetAgentId: 'billing'
			}
		}
	]);
});

test('createVoiceAgent reports unknown tools as tool errors', async () => {
	const agent = createVoiceAgent({
		id: 'support',
		model: {
			generate: ({ messages }) =>
				messages.some((message) => message.role === 'tool')
					? {
							assistantText: 'I could not use that tool.'
						}
					: {
							toolCalls: [
								{
									args: {},
									name: 'missing_tool'
								}
							]
						}
		}
	});

	const result = await agent.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent'),
		turn: createTurn('Use a missing tool')
	});

	expect(result.assistantText).toBe('I could not use that tool.');
	expect(result.toolResults).toMatchObject([
		{
			error: 'Unknown voice agent tool: missing_tool',
			status: 'error',
			toolName: 'missing_tool'
		}
	]);
});

test('createVoiceAgentSquad hands a turn to a specialist agent', async () => {
	const handoffs: string[] = [];
	const intake = createVoiceAgent({
		id: 'intake',
		model: {
			generate: () => ({
				handoff: {
					reason: 'billing question',
					targetAgentId: 'billing'
				}
			})
		}
	});
	const billingTool: VoiceAgentTool = createVoiceAgentTool({
		execute: () => ({
			balance: '$42.00'
		}),
		name: 'get_balance'
	});
	const billing = createVoiceAgent({
		id: 'billing',
		model: {
			generate: ({ messages }) =>
				messages.some((message) => message.role === 'tool')
					? {
							assistantText: 'Your current balance is $42.00.'
						}
					: {
							toolCalls: [
								{
									args: {},
									name: 'get_balance'
								}
							]
						}
		},
		tools: [billingTool]
	});
	const squad = createVoiceAgentSquad({
		agents: [intake, billing],
		defaultAgentId: 'intake',
		id: 'front-desk',
		onHandoff: ({ fromAgentId, targetAgentId }) => {
			handoffs.push(`${fromAgentId}->${targetAgentId}`);
		}
	});

	const result = await squad.run({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-agent'),
		turn: createTurn('Can you help with billing?')
	});

	expect(handoffs).toEqual(['intake->billing']);
	expect(result.agentId).toBe('billing');
	expect(result.assistantText).toBe('Your current balance is $42.00.');
	expect(result.toolResults).toMatchObject([
		{
			status: 'ok',
			toolName: 'get_balance'
		}
	]);
});
