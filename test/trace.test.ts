import { expect, test } from 'bun:test';
import {
	buildVoiceTraceReplay,
	createVoiceTraceEvent,
	evaluateVoiceTrace,
	renderVoiceTraceHTML,
	renderVoiceTraceMarkdown,
	summarizeVoiceTrace,
	type StoredVoiceTraceEvent
} from '../src';

const createTraceEvents = (): StoredVoiceTraceEvent[] => [
	createVoiceTraceEvent({
		at: 100,
		payload: {
			type: 'start'
		},
		sessionId: 'session-trace',
		type: 'call.lifecycle'
	}),
	createVoiceTraceEvent({
		at: 120,
		payload: {
			isFinal: false,
			text: 'order status',
			transcriptId: 'partial-1'
		},
		sessionId: 'session-trace',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 140,
		payload: {
			isFinal: true,
			text: 'order status please',
			transcriptId: 'final-1'
		},
		sessionId: 'session-trace',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 160,
		payload: {
			reason: 'manual',
			text: 'order status please',
			transcriptCount: 1
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceTraceEvent({
		at: 170,
		payload: {
			elapsedMs: 42,
			messageCount: 1,
			round: 0,
			toolCallCount: 1
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.model'
	}),
	createVoiceTraceEvent({
		at: 180,
		payload: {
			agentId: 'support',
			status: 'error',
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.tool'
	}),
	createVoiceTraceEvent({
		at: 190,
		payload: {
			text: 'I could not look that up yet.',
			ttsConfigured: true
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.assistant'
	}),
	createVoiceTraceEvent({
		at: 200,
		payload: {
			estimatedRelativeCostUnits: 0.05,
			totalBillableAudioMs: 1500
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.cost'
	}),
	createVoiceTraceEvent({
		at: 240,
		payload: {
			disposition: 'completed',
			type: 'end'
		},
		sessionId: 'session-trace',
		type: 'call.lifecycle'
	})
];

test('summarizeVoiceTrace reports replay metrics', () => {
	const summary = summarizeVoiceTrace(createTraceEvents());

	expect(summary).toMatchObject({
		assistantReplyCount: 1,
		callDurationMs: 140,
		cost: {
			estimatedRelativeCostUnits: 0.05,
			totalBillableAudioMs: 1500
		},
		errorCount: 0,
		eventCount: 9,
		failed: false,
		modelCallCount: 1,
		sessionId: 'session-trace',
		toolCallCount: 1,
		toolErrorCount: 1,
		transcriptCount: 2,
		turnCount: 1
	});
});

test('evaluateVoiceTrace flags tool errors and missing essentials', () => {
	const evaluation = evaluateVoiceTrace(createTraceEvents());

	expect(evaluation.pass).toBe(false);
	expect(evaluation.issues).toMatchObject([
		{
			code: 'tool-errors',
			severity: 'error'
		}
	]);

	const missing = evaluateVoiceTrace([]);
	expect(missing.pass).toBe(false);
	expect(missing.issues.map((issue) => issue.code)).toEqual([
		'call-not-ended',
		'missing-transcript',
		'missing-turn'
	]);
});

test('trace renderers produce portable markdown and html replay artifacts', () => {
	const events = createTraceEvents();
	const markdown = renderVoiceTraceMarkdown(events, {
		title: 'Support Call Trace'
	});
	const html = renderVoiceTraceHTML(events, {
		title: 'Support Call Trace'
	});
	const replay = buildVoiceTraceReplay(events, {
		title: 'Support Call Trace'
	});

	expect(markdown).toContain('# Support Call Trace');
	expect(markdown).toContain('[error] tool-errors');
	expect(markdown).toContain('assistant "I could not look that up yet."');
	expect(html).toContain('<table>');
	expect(html).toContain('Support Call Trace');
	expect(replay.summary.turnCount).toBe(1);
	expect(replay.evaluation.pass).toBe(false);
});
