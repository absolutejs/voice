import { expect, test } from 'bun:test';
import {
	assertVoiceLiveOpsControlEvidence,
	assertVoiceLiveOpsEvidence,
	buildVoiceLiveOpsControlState,
	createVoiceMemoryLiveOpsControlStore,
	evaluateVoiceLiveOpsControlEvidence,
	evaluateVoiceLiveOpsEvidence
} from '../src/liveOps';
import { createVoiceMemoryStore } from '../src/memoryStore';
import { createVoiceSession } from '../src/session';
import { createVoiceMemoryTraceEventStore } from '../src/trace';
import type {
	AudioChunk,
	STTAdapter,
	STTAdapterOpenOptions,
	STTAdapterSession,
	STTSessionEventMap,
	VoiceServerMessage,
	VoiceSocket
} from '../src/types';
import type { VoiceLiveOpsEvidenceInput } from '../src';

type ListenerMap = {
	[K in keyof STTSessionEventMap]: Array<
		(payload: STTSessionEventMap[K]) => void | Promise<void>
	>;
};

const createFakeAdapter = () => {
	const openOptions: STTAdapterOpenOptions[] = [];
	const sessions: Array<
		STTAdapterSession & {
			emit: <K extends keyof STTSessionEventMap>(
				event: K,
				payload: STTSessionEventMap[K]
			) => Promise<void>;
		}
	> = [];

	const adapter: STTAdapter = {
		kind: 'stt',
		open: (options) => {
			openOptions.push(options);
			const listeners: ListenerMap = {
				close: [],
				endOfTurn: [],
				error: [],
				final: [],
				partial: []
			};
			const session: STTAdapterSession & {
				emit: <K extends keyof STTSessionEventMap>(
					event: K,
					payload: STTSessionEventMap[K]
				) => Promise<void>;
			} = {
				close: async () => {},
				emit: async (event, payload) => {
					for (const listener of listeners[event]) {
						await listener(payload as never);
					}
				},
				on: (event, handler) => {
					listeners[event].push(handler as never);

					return () => {
						const index = listeners[event].indexOf(handler as never);
						if (index >= 0) {
							listeners[event].splice(index, 1);
						}
					};
				},
				send: async (_audio: AudioChunk) => {}
			};

			sessions.push(session);
			return session;
		}
	};

	return {
		adapter,
		emitCurrent: async <K extends keyof STTSessionEventMap>(
			event: K,
			payload: STTSessionEventMap[K]
		) => {
			const session = sessions.at(-1);
			if (!session) {
				throw new Error('No active fake adapter session');
			}

			await session.emit(event, payload);
		},
		getOpenOptions: () => openOptions
	};
};

const createMockSocket = () => {
	const messages: string[] = [];

	const socket: VoiceSocket = {
		close: async () => {},
		send: async (data) => {
			messages.push(typeof data === 'string' ? data : '[binary]');
		}
	};

	return { messages, socket };
};

const emitFinalTranscript = async (
	adapter: ReturnType<typeof createFakeAdapter>,
	id: string,
	text: string
) => {
	await adapter.emitCurrent('final', {
		receivedAt: Date.now(),
		transcript: {
			confidence: 0.99,
			id,
			isFinal: true,
			text,
			vendor: 'absolutejs-proof'
		},
		type: 'final'
	});
};

const parseMessages = (messages: string[]) =>
	messages.map((message) => JSON.parse(message) as VoiceServerMessage);

test('evaluateVoiceLiveOpsEvidence gates operator controls and audit history', () => {
	const evidence = {
		actionHistory: {
			checkedAt: 200,
			entries: [
				{
					actionId: 'delivery-runtime.tick',
					at: 150,
					eventId: 'audit-1',
					ok: true,
					status: 200
				}
			],
			failed: 0,
			passed: 1,
			total: 1
		},
		operationsRecord: {
			audit: {
				error: 0,
				events: [],
				skipped: 0,
				success: 1,
				total: 1
			},
			checkedAt: 200,
			guardrails: {
				blocked: 0,
				decisions: [],
				findings: [],
				passed: 0,
				warned: 0
			},
			handoffs: [
				{
					at: 100,
					status: 'delivered',
					targetAgentId: 'billing'
				}
			],
			outcome: {
				assistantReplies: 1,
				complete: true,
				escalated: true,
				noAnswer: false,
				transferred: true,
				voicemail: false
			},
			providerDecisions: [],
			providers: [],
			replay: {
				sessionId: 'session-1',
				summary: 'Replay available',
				turns: []
			},
			sessionId: 'session-1',
			status: 'healthy',
			summary: {
				averageLatencyMs: 0,
				durationMs: 0,
				errorCount: 0,
				eventCount: 0,
				handoffCount: 1,
				maxLatencyMs: 0,
				providerErrors: {},
				providers: [],
				toolCount: 0,
				turnCount: 0
			},
			tasks: {
				done: 0,
				inProgress: 0,
				open: 1,
				overdue: 0,
				tasks: [],
				total: 1
			},
			timeline: [],
			tools: [],
			traceEvents: [],
			transcript: []
		},
		opsRecovery: {
			checkedAt: 200,
			failedSessions: [],
			interventions: {
				events: [
					{
						action: 'operator-takeover',
						at: 100,
						operatorId: 'operator-1',
						sessionId: 'session-1'
					}
				],
				total: 1
			},
			issues: [],
			providers: {
				healthy: 1,
				providers: [],
				recoveredFallbacks: 0,
				unresolvedFailures: 0
			},
			status: 'pass'
		},
		opsStatus: {
			checkedAt: 200,
			failed: 0,
			links: [],
			passed: 1,
			status: 'pass',
			surfaces: {},
			total: 1
		}
	} satisfies VoiceLiveOpsEvidenceInput;

	const assertion = evaluateVoiceLiveOpsEvidence({
		...evidence,
		maxActionHistoryFailures: 0,
		maxOpsRecoveryIssues: 0,
		minActionHistoryEntries: 1,
		minInterventions: 1,
		minOperationsRecordHandoffs: 1,
		minOperationsRecordTasks: 1,
		requireOperationsRecordAudit: true,
		requiredHistoryActions: ['delivery-runtime.tick'],
		requiredInterventionActions: ['operator-takeover']
	});

	expect(assertion.ok).toBe(true);
	expect(assertion.historyActions).toEqual(['delivery-runtime.tick']);
	expect(assertion.interventionActions).toEqual(['operator-takeover']);
	expect(() =>
		assertVoiceLiveOpsEvidence({
			...evidence,
			requiredInterventionActions: ['force-handoff']
		})
	).toThrow('Voice live-ops evidence assertion failed');
});

test('evaluateVoiceLiveOpsControlEvidence gates control transitions', () => {
	const takeover = buildVoiceLiveOpsControlState({
		action: 'operator-takeover',
		assignee: 'operator-1',
		at: 100,
		detail: 'Take over the call.',
		sessionId: 'session-1',
		tag: 'proof'
	});
	const paused = buildVoiceLiveOpsControlState({
		action: 'pause-assistant',
		assignee: 'operator-1',
		at: 110,
		detail: 'Pause the assistant.',
		previous: takeover,
		sessionId: 'session-1',
		tag: 'proof'
	});
	const resumed = buildVoiceLiveOpsControlState({
		action: 'resume-assistant',
		assignee: 'operator-1',
		at: 120,
		detail: 'Resume the assistant.',
		previous: paused,
		sessionId: 'session-1',
		tag: 'proof'
	});
	const handoff = buildVoiceLiveOpsControlState({
		action: 'force-handoff',
		assignee: 'operator-1',
		at: 130,
		detail: 'Force a human handoff.',
		previous: resumed,
		sessionId: 'session-1',
		tag: 'billing'
	});

	const assertion = evaluateVoiceLiveOpsControlEvidence({
		finalControl: handoff,
		maxFailedActions: 0,
		minSnapshots: 4,
		requireFinalAssistantPaused: true,
		requireFinalOperatorTakeover: false,
		requiredActions: [
			'force-handoff',
			'operator-takeover',
			'pause-assistant',
			'resume-assistant'
		],
		requiredStatuses: [
			'assistant-paused',
			'assistant-resumed',
			'handoff-forced',
			'operator-takeover'
		],
		results: [
			{
				action: 'operator-takeover',
				control: takeover,
				ok: true,
				sessionId: 'session-1'
			},
			{
				action: 'pause-assistant',
				control: paused,
				ok: true,
				sessionId: 'session-1'
			},
			{
				action: 'resume-assistant',
				control: resumed,
				ok: true,
				sessionId: 'session-1'
			},
			{
				action: 'force-handoff',
				control: handoff,
				ok: true,
				sessionId: 'session-1'
			}
		]
	});

	expect(assertion.ok).toBe(true);
	expect(assertion.finalStatus).toBe('handoff-forced');
});

test('assertVoiceLiveOpsControlEvidence reports missing live-ops control actions', () => {
	expect(() =>
		assertVoiceLiveOpsControlEvidence({
			requiredActions: ['force-handoff'],
			results: [
				{
					action: 'pause-assistant',
					control: buildVoiceLiveOpsControlState({
						action: 'pause-assistant',
						sessionId: 'session-1'
					}),
					ok: true,
					sessionId: 'session-1'
				}
			]
		})
	).toThrow('Missing live-ops control action: force-handoff.');
});

test('live ops runtime can pause assistant turns and inject operator instructions after resume', async () => {
	const sessionId = 'live-ops-runtime-proof';
	const injectedInstruction = 'Say LIVE OPS PROOF in the next assistant answer.';
	const store = createVoiceMemoryStore();
	const trace = createVoiceMemoryTraceEventStore();
	const liveOps = createVoiceMemoryLiveOpsControlStore();
	const adapter = createFakeAdapter();
	const socket = createMockSocket();
	let onTurnCalls = 0;
	let observedInstruction: string | undefined;

	const session = createVoiceSession({
		context: {},
		id: sessionId,
		liveOps: {
			getControl: (id) => liveOps.get(id)
		},
		reconnect: {
			maxAttempts: 1,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ liveOps: liveOpsInput }) => {
				onTurnCalls += 1;
				observedInstruction = liveOpsInput?.injectedInstruction;

				return {
					assistantText: `Instruction observed: ${
						liveOpsInput?.injectedInstruction ?? 'none'
					}`
				};
			}
		},
		socket: socket.socket,
		store,
		stt: adapter.adapter,
		trace,
		turnDetection: {
			transcriptStabilityMs: 0
		}
	});

	await session.connect(socket.socket);
	const pausedControl = buildVoiceLiveOpsControlState({
		action: 'pause-assistant',
		assignee: 'proof-operator',
		detail: 'Pause assistant for runtime proof.',
		sessionId,
		tag: 'proof'
	});
	await liveOps.set(sessionId, pausedControl);

	await emitFinalTranscript(
		adapter,
		'proof-final-1',
		'first paused live ops proof turn'
	);
	await session.commitTurn('manual');

	let messages = parseMessages(socket.messages);
	expect(
		messages.some(
			(message) =>
				message.type === 'turn' &&
				message.turn.transcripts.some((transcript) =>
					transcript.text.includes('first paused')
				)
		)
	).toBe(true);
	expect(messages.some((message) => message.type === 'assistant')).toBe(false);
	expect(onTurnCalls).toBe(0);

	const injectedControl = buildVoiceLiveOpsControlState({
		action: 'inject-instruction',
		assignee: 'proof-operator',
		detail: injectedInstruction,
		previous: pausedControl,
		sessionId,
		tag: 'proof'
	});
	const resumedControl = buildVoiceLiveOpsControlState({
		action: 'resume-assistant',
		assignee: 'proof-operator',
		detail: 'Resume assistant for runtime proof.',
		previous: injectedControl,
		sessionId,
		tag: 'proof'
	});
	await liveOps.set(sessionId, resumedControl);

	await emitFinalTranscript(
		adapter,
		'proof-final-2',
		'second resumed live ops proof turn'
	);
	await session.commitTurn('manual');

	messages = parseMessages(socket.messages);
	expect(
		messages.some(
			(message) =>
				message.type === 'assistant' &&
				message.text.includes('LIVE OPS PROOF')
		)
	).toBe(true);
	expect(onTurnCalls).toBe(1);
	expect(observedInstruction).toBe(injectedInstruction);

	const traces = await trace.list({ sessionId });
	expect(
		traces.some(
			(event) =>
				event.type === 'operator.action' &&
				(event.payload as Record<string, unknown>).action === 'turn.skipped'
		)
	).toBe(true);
});
