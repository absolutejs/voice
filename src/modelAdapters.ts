import type {
	VoiceAgentMessage,
	VoiceAgentModel,
	VoiceAgentModelInput,
	VoiceAgentModelOutput,
	VoiceAgentToolCall
} from './agent';
import type { VoiceSessionRecord } from './types';

export type VoiceJSONAssistantModelHandler<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = (
	input: VoiceAgentModelInput<TContext, TSession>
) =>
	| Promise<Record<string, unknown> | VoiceAgentModelOutput<TResult>>
	| Record<string, unknown>
	| VoiceAgentModelOutput<TResult>;

export type VoiceJSONAssistantModelOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	generate: VoiceJSONAssistantModelHandler<TContext, TSession, TResult>;
	mapOutput?: (output: Record<string, unknown>) => VoiceAgentModelOutput<TResult>;
};

export type OpenAIVoiceAssistantModelOptions = {
	apiKey: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	maxOutputTokens?: number;
	model?: string;
	onUsage?: (usage: Record<string, unknown>) => Promise<void> | void;
	temperature?: number;
};

const OUTPUT_SCHEMA = {
	additionalProperties: false,
	properties: {
		assistantText: {
			type: 'string'
		},
		complete: {
			type: 'boolean'
		},
		escalate: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				},
				reason: {
					type: 'string'
				}
			},
			required: ['reason'],
			type: 'object'
		},
		noAnswer: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				}
			},
			type: 'object'
		},
		result: {
			additionalProperties: true,
			type: 'object'
		},
		transfer: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				},
				reason: {
					type: 'string'
				},
				target: {
					type: 'string'
				}
			},
			required: ['target'],
			type: 'object'
		},
		voicemail: {
			additionalProperties: false,
			properties: {
				metadata: {
					additionalProperties: true,
					type: 'object'
				}
			},
			type: 'object'
		}
	},
	type: 'object'
};

const parseJSON = (value: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {
			assistantText: value
		};
	}
};

const normalizeRouteOutput = <TResult>(
	output: Record<string, unknown>
): VoiceAgentModelOutput<TResult> => {
	const result: VoiceAgentModelOutput<TResult> = {};

	if (typeof output.assistantText === 'string') {
		result.assistantText = output.assistantText;
	}
	if (typeof output.complete === 'boolean') {
		result.complete = output.complete;
	}
	if (output.result !== undefined) {
		result.result = output.result as TResult;
	}
	if (output.transfer && typeof output.transfer === 'object') {
		const transfer = output.transfer as Record<string, unknown>;
		if (typeof transfer.target === 'string') {
			result.transfer = {
				metadata:
					transfer.metadata && typeof transfer.metadata === 'object'
						? (transfer.metadata as Record<string, unknown>)
						: undefined,
				reason:
					typeof transfer.reason === 'string' ? transfer.reason : undefined,
				target: transfer.target
			};
		}
	}
	if (output.escalate && typeof output.escalate === 'object') {
		const escalate = output.escalate as Record<string, unknown>;
		if (typeof escalate.reason === 'string') {
			result.escalate = {
				metadata:
					escalate.metadata && typeof escalate.metadata === 'object'
						? (escalate.metadata as Record<string, unknown>)
						: undefined,
				reason: escalate.reason
			};
		}
	}
	if (output.voicemail && typeof output.voicemail === 'object') {
		const voicemail = output.voicemail as Record<string, unknown>;
		result.voicemail = {
			metadata:
				voicemail.metadata && typeof voicemail.metadata === 'object'
					? (voicemail.metadata as Record<string, unknown>)
					: undefined
		};
	}
	if (output.noAnswer && typeof output.noAnswer === 'object') {
		const noAnswer = output.noAnswer as Record<string, unknown>;
		result.noAnswer = {
			metadata:
				noAnswer.metadata && typeof noAnswer.metadata === 'object'
					? (noAnswer.metadata as Record<string, unknown>)
					: undefined
		};
	}

	return result;
};

export const createJSONVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceJSONAssistantModelOptions<TContext, TSession, TResult>
): VoiceAgentModel<TContext, TSession, TResult> => ({
	generate: async (input) => {
		const output = await options.generate(input);
		if (
			'assistantText' in output ||
			'toolCalls' in output ||
			'complete' in output ||
			'transfer' in output ||
			'escalate' in output
		) {
			return output as VoiceAgentModelOutput<TResult>;
		}

		return options.mapOutput?.(output) ?? normalizeRouteOutput<TResult>(output);
	}
});

const messageToOpenAIInput = (message: VoiceAgentMessage) => {
	if (message.role === 'tool') {
		return {
			call_id: message.toolCallId ?? message.name ?? crypto.randomUUID(),
			output: message.content,
			type: 'function_call_output'
		};
	}

	return {
		content: message.content,
		role: message.role === 'system' ? 'developer' : message.role
	};
};

const extractText = (response: Record<string, unknown>) => {
	if (typeof response.output_text === 'string') {
		return response.output_text;
	}

	const output = Array.isArray(response.output) ? response.output : [];
	for (const item of output) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		const content = Array.isArray(record.content) ? record.content : [];
		for (const contentItem of content) {
			if (!contentItem || typeof contentItem !== 'object') {
				continue;
			}
			const contentRecord = contentItem as Record<string, unknown>;
			if (typeof contentRecord.text === 'string') {
				return contentRecord.text;
			}
		}
	}

	return '';
};

const extractToolCalls = (response: Record<string, unknown>) => {
	const output = Array.isArray(response.output) ? response.output : [];
	const toolCalls: VoiceAgentToolCall[] = [];

	for (const item of output) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		if (record.type !== 'function_call' || typeof record.name !== 'string') {
			continue;
		}
		const args =
			typeof record.arguments === 'string'
				? parseJSON(record.arguments)
				: {};
		toolCalls.push({
			args,
			id:
				typeof record.call_id === 'string'
					? record.call_id
					: typeof record.id === 'string'
						? record.id
						: undefined,
			name: record.name
		});
	}

	return toolCalls;
};

export const createOpenAIVoiceAssistantModel = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: OpenAIVoiceAssistantModelOptions
): VoiceAgentModel<TContext, TSession, TResult> => {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
	const model = options.model ?? 'gpt-4.1-mini';

	return {
		generate: async (input) => {
			const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/responses`, {
				body: JSON.stringify({
					input: input.messages.map(messageToOpenAIInput),
					instructions: [
						input.system,
						'Return a JSON object with assistantText, complete, transfer, escalate, voicemail, noAnswer, and result when you are not calling tools.'
					]
						.filter(Boolean)
						.join('\n\n'),
					max_output_tokens: options.maxOutputTokens,
					model,
					temperature: options.temperature,
					text: {
						format: {
							name: 'voice_route_result',
							schema: OUTPUT_SCHEMA,
							strict: false,
							type: 'json_schema'
						}
					},
					tool_choice: input.tools.length ? 'auto' : 'none',
					tools: input.tools.map((tool) => ({
						description: tool.description,
						name: tool.name,
						parameters: tool.parameters ?? {
							additionalProperties: true,
							type: 'object'
						},
						strict: false,
						type: 'function'
					}))
				}),
				headers: {
					authorization: `Bearer ${options.apiKey}`,
					'content-type': 'application/json'
				},
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error(`OpenAI voice assistant model failed: HTTP ${response.status}`);
			}

			const body = (await response.json()) as Record<string, unknown>;
			if (body.usage && typeof body.usage === 'object') {
				await options.onUsage?.(body.usage as Record<string, unknown>);
			}

			const toolCalls = extractToolCalls(body);
			if (toolCalls.length) {
				return {
					toolCalls
				};
			}

			return normalizeRouteOutput<TResult>(parseJSON(extractText(body)));
		}
	};
};
