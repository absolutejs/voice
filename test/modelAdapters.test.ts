import { expect, test } from 'bun:test';
import {
	createAnthropicVoiceAssistantModel,
	createGeminiVoiceAssistantModel,
	createJSONVoiceAssistantModel,
	createOpenAIVoiceAssistantModel,
	createVoiceSessionRecord,
	type VoiceAgentModelInput
} from '../src';

const createInput = (): VoiceAgentModelInput => ({
	agentId: 'support',
	context: {},
	messages: [
		{
			content: 'hello',
			role: 'user'
		}
	],
	session: createVoiceSessionRecord('session-model'),
	system: 'Be useful.',
	tools: [
		{
			description: 'Lookup an order.',
			name: 'lookup_order',
			parameters: {
				properties: {
					orderId: {
						type: 'string'
					}
				},
				type: 'object'
			}
		}
	],
	turn: {
		committedAt: 100,
		id: 'turn-1',
		text: 'hello',
		transcripts: []
	}
});

test('createJSONVoiceAssistantModel maps JSON into route results', async () => {
	const model = createJSONVoiceAssistantModel({
		generate: () => ({
			assistantText: 'Done.',
			complete: true
		})
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'Done.',
		complete: true
	});
});

test('createOpenAIVoiceAssistantModel maps tool calls from responses output', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createOpenAIVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					output: [
						{
							arguments: '{"orderId":"123"}',
							call_id: 'call-1',
							name: 'lookup_order',
							type: 'function_call'
						}
					]
				})
			);
		}
	});

	const result = await model.generate(createInput());

	expect(requests[0]).toMatchObject({
		model: 'gpt-4.1-mini',
		tool_choice: 'auto'
	});
	expect(result.toolCalls).toEqual([
		{
			args: {
				orderId: '123'
			},
			id: 'call-1',
			name: 'lookup_order'
		}
	]);
});

test('createOpenAIVoiceAssistantModel maps JSON text into route results', async () => {
	const usage: Record<string, unknown>[] = [];
	const model = createOpenAIVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async () =>
			new Response(
				JSON.stringify({
					output_text: '{"assistantText":"Hi","complete":true}',
					usage: {
						input_tokens: 10,
						output_tokens: 5
					}
				})
			),
		onUsage: (nextUsage) => {
			usage.push(nextUsage);
		}
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'Hi',
		complete: true
	});
	expect(usage).toEqual([
		{
			input_tokens: 10,
			output_tokens: 5
		}
	]);
});

test('createOpenAIVoiceAssistantModel sends tool outputs as function call outputs', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createOpenAIVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					output_text: '{"assistantText":"Order shipped"}'
				})
			);
		}
	});
	const input = createInput();
	input.messages.push({
		content: '{"status":"shipped"}',
		name: 'lookup_order',
		role: 'tool',
		toolCallId: 'call-1'
	});

	await model.generate(input);

	expect(requests[0].input).toContainEqual({
		call_id: 'call-1',
		output: '{"status":"shipped"}',
		type: 'function_call_output'
	});
});

test('createAnthropicVoiceAssistantModel maps tool calls from content blocks', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createAnthropicVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					content: [
						{
							id: 'toolu-1',
							input: {
								orderId: '123'
							},
							name: 'lookup_order',
							type: 'tool_use'
						}
					],
					usage: {
						input_tokens: 8,
						output_tokens: 4
					}
				})
			);
		}
	});

	const result = await model.generate(createInput());

	expect(requests[0]).toMatchObject({
		max_tokens: 1024,
		model: 'claude-sonnet-4-5',
		tool_choice: {
			type: 'auto'
		}
	});
	expect(requests[0].tools).toEqual([
		{
			description: 'Lookup an order.',
			input_schema: {
				properties: {
					orderId: {
						type: 'string'
					}
				},
				type: 'object'
			},
			name: 'lookup_order'
		}
	]);
	expect(result.toolCalls).toEqual([
		{
			args: {
				orderId: '123'
			},
			id: 'toolu-1',
			name: 'lookup_order'
		}
	]);
});

test('createAnthropicVoiceAssistantModel sends tool results as tool_result blocks', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createAnthropicVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					content: [
						{
							text: '{"assistantText":"Order shipped"}',
							type: 'text'
						}
					]
				})
			);
		}
	});
	const input = createInput();
	input.messages.push(
		{
			content: '',
			metadata: {
				toolCalls: [
					{
						args: {
							orderId: '123'
						},
						id: 'toolu-1',
						name: 'lookup_order'
					}
				]
			},
			role: 'assistant'
		},
		{
			content: '{"status":"shipped"}',
			name: 'lookup_order',
			role: 'tool',
			toolCallId: 'toolu-1'
		}
	);

	await model.generate(input);

	expect(requests[0].messages).toContainEqual({
		content: [
			{
				id: 'toolu-1',
				input: {
					orderId: '123'
				},
				name: 'lookup_order',
				type: 'tool_use'
			}
		],
		role: 'assistant'
	});
	expect(requests[0].messages).toContainEqual({
		content: [
			{
				content: '{"status":"shipped"}',
				tool_use_id: 'toolu-1',
				type: 'tool_result'
			}
		],
		role: 'user'
	});
});

test('createGeminiVoiceAssistantModel maps function calls from candidate parts', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createGeminiVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					candidates: [
						{
							content: {
								parts: [
									{
										functionCall: {
											args: {
												orderId: '123'
											},
											id: 'fn-1',
											name: 'lookup_order'
										}
									}
								]
							}
						}
					],
					usageMetadata: {
						promptTokenCount: 8
					}
				})
			);
		}
	});

	const result = await model.generate(createInput());

	expect(requests[0]).toMatchObject({
		tools: [
			{
				functionDeclarations: [
					{
						description: 'Lookup an order.',
						name: 'lookup_order',
						parameters: {
							properties: {
								orderId: {
									type: 'STRING'
								}
							},
							type: 'OBJECT'
						}
					}
				]
			}
		]
	});
	expect(result.toolCalls).toEqual([
		{
			args: {
				orderId: '123'
			},
			id: 'fn-1',
			name: 'lookup_order'
		}
	]);
});

test('createGeminiVoiceAssistantModel sends function responses', async () => {
	const requests: Array<Record<string, unknown>> = [];
	const model = createGeminiVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async (_url, init) => {
			requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(
				JSON.stringify({
					candidates: [
						{
							content: {
								parts: [
									{
										text: '{"assistantText":"Order shipped"}'
									}
								]
							}
						}
					]
				})
			);
		}
	});
	const input = createInput();
	input.messages.push(
		{
			content: '',
			metadata: {
				toolCalls: [
					{
						args: {
							orderId: '123'
						},
						id: 'fn-1',
						name: 'lookup_order'
					}
				]
			},
			role: 'assistant'
		},
		{
			content: '{"status":"shipped"}',
			name: 'lookup_order',
			role: 'tool',
			toolCallId: 'fn-1'
		}
	);

	await model.generate(input);

	expect(requests[0].contents).toContainEqual({
		parts: [
			{
				functionCall: {
					args: {
						orderId: '123'
					},
					id: 'fn-1',
					name: 'lookup_order'
				}
			}
		],
		role: 'model'
	});
	expect(requests[0].contents).toContainEqual({
		parts: [
			{
				functionResponse: {
					id: 'fn-1',
					name: 'lookup_order',
					response: {
						result: {
							status: 'shipped'
						}
					}
				}
			}
		],
		role: 'user'
	});
});
