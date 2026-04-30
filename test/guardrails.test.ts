import { expect, test } from 'bun:test';
import {
	buildVoiceGuardrailReport,
	createVoiceAgentTool,
	createVoiceAssistant,
	createVoiceGuardrailPolicy,
	createVoiceGuardrailRuntime,
	createVoiceGuardrailRoutes,
	createVoiceMemoryTraceEventStore,
	createVoiceSessionRecord,
	evaluateVoiceGuardrailPolicy,
	renderVoiceGuardrailMarkdown,
	voiceGuardrailPolicyPresets
} from '../src';
import type { VoiceSessionHandle } from '../src';

const createApi = (): VoiceSessionHandle => ({
	appendEvent: async () => undefined,
	complete: async () => undefined,
	emit: async () => undefined,
	getSession: () => createVoiceSessionRecord('session-guardrail-runtime'),
	updateSession: async (session) => session
});

const createTurn = (text: string) => ({
	assistantText: undefined,
	committedAt: Date.now(),
	id: `turn-${Math.random()}`,
	startedAt: Date.now(),
	text,
	transcripts: []
});

test('evaluateVoiceGuardrailPolicy blocks unsafe assistant output', async () => {
	const decision = await evaluateVoiceGuardrailPolicy(
		voiceGuardrailPolicyPresets.supportSafeDefaults,
		{
			content: 'This is medical advice and I can diagnose the issue.',
			sessionId: 'session-1',
			stage: 'assistant-output',
			turnId: 'turn-1'
		}
	);

	expect(decision).toMatchObject({
		allowed: false,
		sessionId: 'session-1',
		stage: 'assistant-output',
		status: 'blocked'
	});
	expect(decision.findings.map((finding) => finding.ruleId)).toContain(
		'regulated-advice'
	);
});

test('evaluateVoiceGuardrailPolicy warns and redacts sensitive transcript data', async () => {
	const decision = await evaluateVoiceGuardrailPolicy(
		voiceGuardrailPolicyPresets.supportSafeDefaults,
		{
			content: 'My card is 4111 1111 1111 1111',
			stage: 'transcript'
		}
	);

	expect(decision).toMatchObject({
		allowed: true,
		redactedContent: 'My card is [redacted-card]',
		status: 'warn'
	});
});

test('buildVoiceGuardrailReport summarizes policy decisions', async () => {
	const policy = createVoiceGuardrailPolicy({
		id: 'custom-policy',
		rules: [
			{
				action: 'warn',
				id: 'competitor-mention',
				match: 'vapi'
			}
		]
	});
	const decisions = await Promise.all([
		evaluateVoiceGuardrailPolicy(policy, {
			content: 'Compare this to Vapi.',
			stage: 'assistant-output'
		}),
		evaluateVoiceGuardrailPolicy(policy, {
			content: 'Normal response.',
			stage: 'assistant-output'
		})
	]);
	const report = buildVoiceGuardrailReport({ decisions, policies: [policy] });

	expect(report).toMatchObject({
		status: 'warn',
		summary: {
			blocked: 0,
			passed: 1,
			warned: 1
		},
		total: 2
	});
	expect(renderVoiceGuardrailMarkdown(report)).toContain(
		'# Voice Guardrail Report'
	);
});

test('createVoiceGuardrailRoutes exposes JSON and Markdown and traces decisions', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const app = createVoiceGuardrailRoutes({
		path: '/guardrails',
		policies: [voiceGuardrailPolicyPresets.supportSafeDefaults],
		trace
	});

	const response = await app.handle(
		new Request('http://localhost/guardrails', {
			body: JSON.stringify({
				content: 'This is guaranteed approval.',
				sessionId: 'session-route',
				stage: 'assistant-output'
			}),
			headers: {
				'content-type': 'application/json'
			},
			method: 'POST'
		})
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		status: 'fail',
		summary: {
			blocked: 1
		}
	});
	expect(await trace.list({ type: 'assistant.guardrail' })).toHaveLength(1);

	const markdown = await app.handle(
		new Request('http://localhost/guardrails.md?content=normal')
	);
	expect(await markdown.text()).toContain('Voice Guardrail Report');
});

test('createVoiceGuardrailRuntime blocks unsafe assistant output and traces decisions', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const runtime = createVoiceGuardrailRuntime({
		policies: [voiceGuardrailPolicyPresets.supportSafeDefaults],
		trace
	});
	const assistant = createVoiceAssistant({
		guardrails: runtime.assistantGuardrails,
		id: 'support',
		model: {
			generate: () => ({
				assistantText: 'This is medical advice and I can diagnose it.'
			})
		}
	});

	const result = await assistant.onTurn({
		api: createApi(),
		context: {},
		session: createVoiceSessionRecord('session-runtime'),
		turn: createTurn('hello')
	});
	const events = await trace.list({ type: 'assistant.guardrail' });

	expect(result).toMatchObject({
		escalate: {
			reason: 'guardrail-blocked-assistant-output'
		}
	});
	expect(events.some((event) => event.payload.stage === 'assistant-output')).toBe(
		true
	);
});

test('createVoiceGuardrailRuntime wraps tools with input and output checks', async () => {
	const trace = createVoiceMemoryTraceEventStore();
	const runtime = createVoiceGuardrailRuntime({
		policies: [voiceGuardrailPolicyPresets.supportSafeDefaults],
		trace
	});
	const tool = runtime.wrapTool(
		createVoiceAgentTool({
			execute: () => ({
				card: '4111 1111 1111 1111'
			}),
			name: 'payment_lookup'
		})
	);

	const result = await tool.execute({
		api: createApi(),
		args: {},
		context: {},
		session: createVoiceSessionRecord('session-tool-runtime'),
		turn: createTurn('lookup payment')
	});
	const events = await trace.list({ type: 'assistant.guardrail' });

	expect(result).toMatchObject({
		card: '4111 1111 1111 1111'
	});
	expect(events.map((event) => event.payload.stage).sort()).toEqual([
		'tool-input',
		'tool-output'
	]);
	expect(
		events.find((event) => event.payload.stage === 'tool-output')?.payload.status
	).toBe('warn');
});
