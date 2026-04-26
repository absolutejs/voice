import { expect, test } from 'bun:test';
import {
	createAnthropicVoiceAssistantModel,
	createGeminiVoiceAssistantModel,
	createJSONVoiceAssistantModel,
	createOpenAIVoiceAssistantModel,
	createVoiceProviderRouter,
	createVoiceSessionRecord,
	type VoiceAgentModel,
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

test('createVoiceProviderRouter uses the selected provider when healthy', async () => {
	const calls: string[] = [];
	const model = createVoiceProviderRouter({
		fallback: ['primary', 'backup'],
		providers: {
			backup: {
				generate: async () => {
					calls.push('backup');
					return {
						assistantText: 'backup'
					};
				}
			},
			primary: {
				generate: async () => {
					calls.push('primary');
					return {
						assistantText: 'primary',
						complete: true
					};
				}
			}
		} satisfies Record<string, VoiceAgentModel>,
		selectProvider: () => 'primary'
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'primary',
		complete: true
	});
	expect(calls).toEqual(['primary']);
});

test('createVoiceProviderRouter falls back on provider errors', async () => {
	const events: Array<Record<string, unknown>> = [];
	const model = createVoiceProviderRouter({
		fallback: ['primary', 'backup'],
		onProviderEvent: (event) => {
			events.push(event);
		},
		providers: {
			backup: {
				generate: async () => ({
					assistantText: 'backup',
					complete: true
				})
			},
			primary: {
				generate: async () => {
					throw new Error('OpenAI voice assistant model failed: HTTP 429');
				}
			}
		} satisfies Record<string, VoiceAgentModel>,
		selectProvider: () => 'primary'
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'backup',
		complete: true
	});
	expect(events).toMatchObject([
		{
			fallbackProvider: 'backup',
			provider: 'primary',
			rateLimited: true,
			selectedProvider: 'primary',
			status: 'error'
		},
		{
			fallbackProvider: 'backup',
			provider: 'backup',
			recovered: true,
			selectedProvider: 'primary',
			status: 'fallback'
		}
	]);
});

test('createVoiceProviderRouter does not fall back on fatal errors', async () => {
	const events: Array<Record<string, unknown>> = [];
	const model = createVoiceProviderRouter({
		fallback: ['primary', 'backup'],
		isProviderError: () => false,
		onProviderEvent: (event) => {
			events.push(event);
		},
		providers: {
			backup: {
				generate: async () => ({
					assistantText: 'backup'
				})
			},
			primary: {
				generate: async () => {
					throw new Error('tool serialization bug');
				}
			}
		} satisfies Record<string, VoiceAgentModel>,
		selectProvider: () => 'primary'
	});

	await expect(model.generate(createInput())).rejects.toThrow(
		'tool serialization bug'
	);
	expect(events).toMatchObject([
		{
			provider: 'primary',
			selectedProvider: 'primary',
			status: 'error'
		}
	]);
	expect(events[0].fallbackProvider).toBeUndefined();
});

test('createVoiceProviderRouter can prefer the cheapest allowed provider', async () => {
	const calls: string[] = [];
	const model = createVoiceProviderRouter({
		allowProviders: ['fast', 'cheap'],
		policy: 'prefer-cheapest',
		providerProfiles: {
			cheap: {
				cost: 1,
				latencyMs: 900
			},
			fast: {
				cost: 10,
				latencyMs: 100
			}
		},
		providers: {
			cheap: {
				generate: async () => {
					calls.push('cheap');
					return {
						assistantText: 'cheap'
					};
				}
			},
			fast: {
				generate: async () => {
					calls.push('fast');
					return {
						assistantText: 'fast'
					};
				}
			},
			premium: {
				generate: async () => {
					calls.push('premium');
					return {
						assistantText: 'premium'
					};
				}
			}
		} satisfies Record<string, VoiceAgentModel>
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'cheap'
	});
	expect(calls).toEqual(['cheap']);
});

test('createVoiceProviderRouter can fall back only on rate limits', async () => {
	const calls: string[] = [];
	const model = createVoiceProviderRouter({
		fallback: ['primary', 'backup'],
		fallbackMode: 'rate-limit',
		providers: {
			backup: {
				generate: async () => {
					calls.push('backup');
					return {
						assistantText: 'backup'
					};
				}
			},
			primary: {
				generate: async () => {
					calls.push('primary');
					throw new Error('OpenAI voice assistant model failed: HTTP 500');
				}
			}
		} satisfies Record<string, VoiceAgentModel>,
		selectProvider: () => 'primary'
	});

	await expect(model.generate(createInput())).rejects.toThrow('HTTP 500');
	expect(calls).toEqual(['primary']);
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
	input.messages.push(
		{
			content: '',
			metadata: {
				toolCalls: [
					{
						args: {
							orderId: '123'
						},
						id: 'call-1',
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
			toolCallId: 'call-1'
		}
	);

	await model.generate(input);

	expect(requests[0].input).toContainEqual({
		arguments: '{"orderId":"123"}',
		call_id: 'call-1',
		name: 'lookup_order',
		type: 'function_call'
	});
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

test('createAnthropicVoiceAssistantModel maps fenced JSON text into route results', async () => {
	const model = createAnthropicVoiceAssistantModel({
		apiKey: 'test-key',
		fetch: async () =>
			new Response(
				JSON.stringify({
					content: [
						{
							text: '```json\n{"assistantText":"Done.","complete":true}\n```',
							type: 'text'
						}
					]
				})
			)
	});

	expect(await model.generate(createInput())).toMatchObject({
		assistantText: 'Done.',
		complete: true
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
		generationConfig: {},
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
