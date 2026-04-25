import { expect, test } from 'bun:test';
import {
	createVoiceAgent,
	createVoiceAgentSquad,
	createVoiceAgentTool,
	createVoiceMemoryTraceEventStore,
	createVoiceSessionRecord,
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
		'tool',
		'assistant'
	]);
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
