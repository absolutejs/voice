import { expect, test } from 'bun:test';
import {
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
