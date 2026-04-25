import { createVoiceMemoryStore } from '../memoryStore';
import { createVoiceSession } from '../session';
import { resolveTurnDetectionConfig } from '../turnProfiles';
import type {
	AudioChunk,
	STTAdapter,
	STTAdapterSession,
	STTSessionEventMap,
	VoiceSocket
} from '../types';

type ListenerMap = {
	[K in keyof STTSessionEventMap]: Array<
		(payload: STTSessionEventMap[K]) => void | Promise<void>
	>;
};

export type VoiceResilienceScenarioResult = {
	actualTurns: string[];
	id: string;
	passes: boolean;
	replayedTurns: number;
	title: string;
};

export type VoiceResilienceSummary = {
	duplicateTurnRate: number;
	passCount: number;
	passRate: number;
	replayFailureRate: number;
	scenarioCount: number;
};

export type VoiceResilienceReport = {
	generatedAt: number;
	scenarios: VoiceResilienceScenarioResult[];
	summary: VoiceResilienceSummary;
};

const roundMetric = (value: number, digits = 4) => {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
};

const createMockSocket = (): VoiceSocket => ({
	close: async () => {},
	send: async () => {}
});

const createSpeechChunk = (sample: number) => new Int16Array(160).fill(sample);

const createFakeAdapter = () => {
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

	return {
		adapter: {
			kind: 'stt',
			open: () => session
		} satisfies STTAdapter,
		session
	};
};

const runScenario = async (id: string, title: string, run: (input: {
	adapter: ReturnType<typeof createFakeAdapter>;
	commit: (text: string, transcriptId?: string) => Promise<void>;
	connectNewSocket: () => Promise<void>;
	disconnect: () => Promise<void>;
	turns: string[];
	emitEndOfTurn: () => Promise<void>;
	emitFinal: (text: string, transcriptId?: string) => Promise<void>;
}) => Promise<void>): Promise<VoiceResilienceScenarioResult> => {
	const store = createVoiceMemoryStore();
	const adapter = createFakeAdapter();
	const turns: string[] = [];
	const voice = createVoiceSession({
		context: {},
		id,
		logger: {},
		reconnect: {
			maxAttempts: 2,
			strategy: 'resume-last-turn',
			timeout: 5_000
		},
		route: {
			onComplete: async () => {},
			onTurn: async ({ turn }) => {
				turns.push(turn.text);
			}
		},
		socket: createMockSocket(),
		store,
		stt: adapter.adapter,
		sttLifecycle: 'continuous',
		turnDetection: resolveTurnDetectionConfig({
			silenceMs: 20,
			speechThreshold: 0.01,
			transcriptStabilityMs: 5
		})
	});

	await voice.connect(createMockSocket());

	try {
		await run({
			adapter,
			commit: async (text, transcriptId = `${id}-${turns.length}`) => {
				await adapter.session.emit('final', {
					receivedAt: Date.now(),
					transcript: {
						id: transcriptId,
						isFinal: true,
						text
					},
					type: 'final'
				});
				await voice.receiveAudio(createSpeechChunk(16_000));
				await voice.receiveAudio(createSpeechChunk(0));
				await Bun.sleep(60);
			},
			connectNewSocket: async () => {
				await voice.connect(createMockSocket());
			},
			disconnect: async () => {
				await voice.disconnect({
					recoverable: true,
					type: 'close'
				});
			},
			emitEndOfTurn: async () => {
				await adapter.session.emit('endOfTurn', {
					reason: 'vendor',
					receivedAt: Date.now(),
					type: 'endOfTurn'
				});
			},
			emitFinal: async (text, transcriptId = `${id}-${turns.length}`) => {
				await adapter.session.emit('final', {
					receivedAt: Date.now(),
					transcript: {
						id: transcriptId,
						isFinal: true,
						text
					},
					type: 'final'
				});
			},
			turns
		});
	} finally {
		await voice.close('resilience-complete');
	}

	const uniqueTurns = new Set(turns.map((turn) => turn.toLowerCase()));
	const replayedTurns = turns.length - uniqueTurns.size;

	return {
		actualTurns: turns,
		id,
		passes: replayedTurns === 0,
		replayedTurns,
		title
	};
};

export const runVoiceResilienceBenchmark = async (): Promise<VoiceResilienceReport> => {
	const scenarios = await Promise.all([
		runScenario(
			'resume-no-replay',
			'Reconnect after first turn does not replay committed text',
			async ({ commit, connectNewSocket, disconnect }) => {
				await commit('Reconnect should not duplicate prior turns');
				await disconnect();
				await connectNewSocket();
				await commit('A second turn should still commit after resume');
			}
		),
		runScenario(
			'duplicate-final-id',
			'Duplicate transcript ids do not create replayed turns',
			async ({ adapter, connectNewSocket, disconnect, turns, commit }) => {
				await commit('Duplicate final ids should still produce one turn', 'same-id');
				await disconnect();
				await connectNewSocket();
				await adapter.session.emit('final', {
					receivedAt: Date.now(),
					transcript: {
						id: 'same-id',
						isFinal: true,
						text: 'Duplicate final ids should still produce one turn'
					},
					type: 'final'
				});
				if (turns.length === 1) {
					await commit('Fresh transcripts should still commit later');
				}
			}
		),
		runScenario(
			'duplicate-end-of-turn',
			'Repeated end-of-turn events for the same turn stay deduped',
			async ({ emitFinal, emitEndOfTurn, turns }) => {
				await emitFinal('Repeated end-of-turn should only commit once', 'dup-endofturn');
				await emitEndOfTurn();
				await emitEndOfTurn();
				await Bun.sleep(80);

				if (turns.length !== 1) {
					throw new Error('Repeated end-of-turn events created duplicate turns');
				}
			}
		),
		runScenario(
			'duplicate-end-of-turn-jitter',
			'End-of-turn jitter does not trigger extra commits',
			async ({ emitFinal, emitEndOfTurn, turns }) => {
				await emitFinal(
					'Noisy end-of-turn signals should still commit once',
					'dup-endofturn-jitter'
				);

				for (const delayMs of [40, 95, 180, 120]) {
					await Bun.sleep(delayMs);
					await emitEndOfTurn();
				}

				await Bun.sleep(80);

				if (turns.length !== 1) {
					throw new Error(
						'Jittered end-of-turn signals created duplicate turns'
					);
				}
			}
		),
		runScenario(
			'reconnect-duplicate-text-no-new-audio',
			'Reconnect duplicate text with different ids and no audio does not replay turn',
			async ({
				adapter,
				connectNewSocket,
				disconnect,
				emitEndOfTurn,
				emitFinal,
				turns
			}) => {
				await emitFinal(
					'Reconnect duplicate text should be suppressed',
					'dup-text-reconnect-1'
				);
				await emitEndOfTurn();
				await Bun.sleep(60);
				await disconnect();

				await connectNewSocket();
				await adapter.session.emit('final', {
					receivedAt: Date.now(),
					transcript: {
						id: 'dup-text-reconnect-2',
						isFinal: true,
						text: 'Reconnect duplicate text should be suppressed'
					},
					type: 'final'
				});

				for (const delayMs of [40, 70, 110]) {
					await Bun.sleep(delayMs);
					await emitEndOfTurn();
				}

				await Bun.sleep(60);

				if (turns.length !== 1) {
					throw new Error('Reconnect duplicate text was committed twice');
				}
			}
		),
		runScenario(
			'reconnect-end-of-turn-jitter',
			'End-of-turn jitter after reconnect does not replay committed turns',
			async ({
				adapter,
				connectNewSocket,
				disconnect,
				emitEndOfTurn,
				emitFinal,
				turns
			}) => {
				await emitFinal('Reconnect duplicate end-of-turn should dedupe', 'resume-jitter');
				await emitEndOfTurn();
				await Bun.sleep(60);
				await disconnect();

				await connectNewSocket();
				await adapter.session.emit('final', {
					receivedAt: Date.now(),
					transcript: {
						id: 'resume-jitter',
						isFinal: true,
						text: 'Reconnect duplicate end-of-turn should dedupe'
					},
					type: 'final'
				});

				for (const delayMs of [50, 80, 120, 180]) {
					await Bun.sleep(delayMs);
					await emitEndOfTurn();
				}

				await Bun.sleep(80);

				if (turns.length !== 1) {
					throw new Error(
						'Reconnected jittered end-of-turn signals replayed a committed turn'
					);
				}
			}
		)
	]);

	const passCount = scenarios.filter((scenario) => scenario.passes).length;
	const replayFailures = scenarios.filter(
		(scenario) => scenario.replayedTurns > 0
	).length;

	return {
		generatedAt: Date.now(),
		scenarios,
		summary: {
			duplicateTurnRate: roundMetric(
				scenarios.length > 0 ? replayFailures / scenarios.length : 0
			),
			passCount,
			passRate: roundMetric(
				scenarios.length > 0 ? passCount / scenarios.length : 0
			),
			replayFailureRate: roundMetric(
				scenarios.length > 0 ? replayFailures / scenarios.length : 0
			),
			scenarioCount: scenarios.length
		}
	};
};
