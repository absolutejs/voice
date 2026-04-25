import { expect, test } from 'bun:test';
import {
	createVoiceAssistant,
	createVoiceExperiment,
	createVoiceSessionRecord,
	type VoiceAgentModel,
	type VoiceSessionHandle,
	type VoiceSessionRecord,
	type VoiceTurnRecord
} from '../src';

const createTurn = (text: string, id = 'turn-1'): VoiceTurnRecord => ({
	committedAt: 100,
	id,
	text,
	transcripts: []
});

const createApi = () =>
	({
		id: 'session-assistant'
	}) as VoiceSessionHandle<unknown, VoiceSessionRecord, unknown>;

test('createVoiceAssistant exposes an onTurn handler from a model', async () => {
	const assistant = createVoiceAssistant({
		id: 'support',
		model: {
			generate: ({ messages }) => ({
				assistantText: `heard ${messages.at(-1)?.content}`
			})
		}
	});

	const result = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-assistant'),
		turn: createTurn('hello')
	});

	expect(result).toMatchObject({
		assistantText: 'heard hello'
	});
});

test('createVoiceAssistant applies artifact plan outcome recipes to ops', () => {
	const assistant = createVoiceAssistant({
		artifactPlan: {
			preset: {
				name: 'support-triage',
				options: {
					queue: 'support-live'
				}
			}
		},
		id: 'support',
		model: {
			generate: () => ({
				assistantText: 'How can I help?'
			})
		}
	});

	expect(assistant.ops?.taskPolicies?.completed).toMatchObject({
		name: 'support-triage-completed',
		queue: 'support-live'
	});
	expect(assistant.ops?.createTaskFromReview).toBeFunction();
});

test('createVoiceAssistant guardrails can block or rewrite turn results', async () => {
	const assistant = createVoiceAssistant({
		guardrails: {
			afterTurn: ({ result }) => ({
				...result,
				assistantText: `${result.assistantText} Please do not share secrets.`
			}),
			beforeTurn: ({ turn }) =>
				turn.text.includes('human')
					? {
							escalate: {
								reason: 'caller requested a human'
							}
						}
					: undefined
		},
		id: 'support',
		model: {
			generate: () => ({
				assistantText: 'I can help.'
			})
		}
	});

	const escalated = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-assistant'),
		turn: createTurn('get me a human')
	});
	const rewritten = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-assistant'),
		turn: createTurn('hello')
	});

	expect(escalated).toMatchObject({
		escalate: {
			reason: 'caller requested a human'
		}
	});
	expect(rewritten).toMatchObject({
		assistantText: 'I can help. Please do not share secrets.'
	});
});

test('createVoiceExperiment assigns variants deterministically by session', () => {
	const experiment = createVoiceExperiment({
		id: 'prompt-copy',
		variants: [
			{
				id: 'a',
				weight: 1
			},
			{
				id: 'b',
				weight: 1
			}
		]
	});
	const session = createVoiceSessionRecord('session-experiment');

	expect(
		experiment.resolve({
			assistantId: 'support',
			context: {},
			session
		})
	).toBe(
		experiment.resolve({
			assistantId: 'support',
			context: {},
			session
		})
	);
});

test('createVoiceAssistant can run an experiment variant model', async () => {
	const baseModel: VoiceAgentModel = {
		generate: () => ({
			assistantText: 'base'
		})
	};
	const experimentModel: VoiceAgentModel = {
		generate: () => ({
			assistantText: 'variant'
		})
	};
	const assistant = createVoiceAssistant({
		experiment: createVoiceExperiment({
			id: 'model-test',
			selectVariant: () => 'variant-b',
			variants: [
				{
					id: 'variant-a'
				},
				{
					id: 'variant-b',
					model: experimentModel
				}
			]
		}),
		id: 'support',
		model: baseModel
	});

	const result = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-assistant'),
		turn: createTurn('hello')
	});

	expect(result?.assistantText).toBe('variant');
});

test('createVoiceAssistant experiment variants can override system prompts', async () => {
	const assistant = createVoiceAssistant({
		experiment: createVoiceExperiment({
			id: 'system-test',
			selectVariant: () => 'direct',
			variants: [
				{
					id: 'baseline'
				},
				{
					id: 'direct',
					system: 'Be direct.'
				}
			]
		}),
		id: 'support',
		model: {
			generate: ({ system }) => ({
				assistantText: system
			})
		},
		system: 'Be warm.'
	});

	const result = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-assistant'),
		turn: createTurn('hello')
	});

	expect(result?.assistantText).toBe('Be direct.');
});
