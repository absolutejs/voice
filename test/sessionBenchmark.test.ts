import { expect, test } from 'bun:test';
import {
	summarizeVoiceSessionBenchmarkSeries,
	summarizeVoiceSessionBenchmark,
	type VoiceSessionBenchmarkScenarioResult
} from '../src/testing';
import { runVoiceSessionBenchmarkScenario } from '../src/testing';
import type { STTAdapter } from '../src/types';

test('summarizeVoiceSessionBenchmark reports pass and replay metrics', () => {
	const scenarios: VoiceSessionBenchmarkScenarioResult[] = [
		{
			actualTurns: ['alpha', 'beta'],
			averageRelativeCostUnits: 1,
			duplicateTurnCount: 0,
			elapsedMs: 1000,
			fallbackReplayAudioMs: 0,
			expectedReconnectCount: 2,
			expectedTurns: ['alpha', 'beta'],
			fixtureId: 'scenario-1',
			primaryAudioMs: 600,
			passes: true,
			reconnectCount: 2,
			reconnectTriggered: true,
			tags: ['multi-turn'],
			title: 'Scenario 1',
			turnPassRate: 1,
			turnCountDelta: 0,
			turnResults: [
				{
					actualText: 'alpha',
					accuracy: {
						actualText: 'alpha',
						charDistance: 0,
						charErrorRate: 0,
						expectedText: 'alpha',
						passesThreshold: true,
						threshold: 0.35,
						wordDistance: 0,
						wordErrorRate: 0
					},
					expectedText: 'alpha',
					index: 0,
					passes: true
				}
			]
		},
		{
			actualTurns: ['alpha', 'alpha'],
			averageRelativeCostUnits: 1.5,
			duplicateTurnCount: 1,
			elapsedMs: 1200,
			fallbackReplayAudioMs: 120,
			expectedReconnectCount: 0,
			expectedTurns: ['alpha'],
			fixtureId: 'scenario-2',
			primaryAudioMs: 600,
			passes: false,
			reconnectCount: 0,
			reconnectTriggered: false,
			tags: ['multi-turn'],
			title: 'Scenario 2',
			turnPassRate: 0.5,
			turnCountDelta: 1,
			turnResults: [
				{
					actualText: 'alpha',
					accuracy: {
						actualText: 'alpha',
						charDistance: 0,
						charErrorRate: 0,
						expectedText: 'alpha',
						passesThreshold: true,
						threshold: 0.35,
						wordDistance: 0,
						wordErrorRate: 0
					},
					expectedText: 'alpha',
					index: 0,
					passes: true
				},
				{
					actualText: 'alpha',
					index: 1,
					passes: false
				}
			]
		}
	];

	const summary = summarizeVoiceSessionBenchmark('adapter-x', scenarios);

	expect(summary.passRate).toBe(0.5);
	expect(summary.reconnectSuccessRate).toBe(1);
	expect(summary.reconnectCoverageRate).toBe(1);
	expect(summary.averageRelativeCostUnits).toBe(1.25);
	expect(summary.averageReconnectCount).toBe(1);
	expect(summary.averageTurnPassRate).toBe(0.75);
	expect(summary.scenariosWithDuplicateTurns).toBe(1);
	expect(summary.scenariosWithTurnCountMismatch).toBe(1);
});

test('summarizeVoiceSessionBenchmarkSeries reports stability across runs', () => {
	const reports = [
		{
			adapterId: 'adapter-x',
			generatedAt: 1,
			scenarios: [
				{
					actualTurns: ['alpha'],
					averageRelativeCostUnits: 1,
					duplicateTurnCount: 0,
					elapsedMs: 1000,
					fallbackReplayAudioMs: 0,
					expectedReconnectCount: 1,
					expectedTurns: ['alpha'],
					fixtureId: 'scenario-1',
					primaryAudioMs: 600,
					passes: true,
					reconnectCount: 1,
					reconnectTriggered: true,
					tags: ['dialogue-style'],
					title: 'Scenario 1',
					turnPassRate: 1,
					turnCountDelta: 0,
					turnResults: [
						{
							actualText: 'alpha',
							accuracy: {
								actualText: 'alpha',
								charDistance: 0,
								charErrorRate: 0,
								expectedText: 'alpha',
								passesThreshold: true,
								threshold: 0.35,
								wordDistance: 0,
								wordErrorRate: 0
							},
							expectedText: 'alpha',
							index: 0,
							passes: true
						}
					]
				},
				{
					actualTurns: ['beta'],
					averageRelativeCostUnits: 1.3,
					duplicateTurnCount: 0,
					elapsedMs: 1200,
					fallbackReplayAudioMs: 180,
					expectedReconnectCount: 0,
					expectedTurns: ['beta'],
					fixtureId: 'scenario-2',
					primaryAudioMs: 600,
					passes: false,
					reconnectCount: 0,
					reconnectTriggered: false,
					tags: ['dialogue-style'],
					title: 'Scenario 2',
					turnPassRate: 0,
					turnCountDelta: 0,
					turnResults: [
						{
							actualText: 'beta',
							accuracy: {
								actualText: 'beta',
								charDistance: 2,
								charErrorRate: 0.5,
								expectedText: 'better',
								passesThreshold: false,
								threshold: 0.35,
								wordDistance: 1,
								wordErrorRate: 1
							},
							expectedText: 'better',
							index: 0,
							passes: false
						}
					]
				}
			],
			summary: {
				adapterId: 'adapter-x',
				averageElapsedMs: 1100,
				averageFallbackReplayAudioMs: 90,
				averagePrimaryAudioMs: 600,
				averageReconnectCount: 0.5,
				averageRelativeCostUnits: 1.15,
				averageTurnPassRate: 0.5,
				averageWordErrorRate: 0.5,
				duplicateTurnRate: 0,
				passCount: 1,
				passRate: 0.5,
				reconnectCoverageRate: 1,
				reconnectSuccessRate: 1,
				scenarioCount: 2,
				scenariosWithDuplicateTurns: 0,
				scenariosWithTurnCountMismatch: 0
			}
		},
		{
			adapterId: 'adapter-x',
			generatedAt: 2,
			scenarios: [
				{
					actualTurns: ['alpha'],
					averageRelativeCostUnits: 1,
					duplicateTurnCount: 0,
					elapsedMs: 900,
					fallbackReplayAudioMs: 0,
					expectedReconnectCount: 1,
					expectedTurns: ['alpha'],
					fixtureId: 'scenario-1',
					primaryAudioMs: 600,
					passes: true,
					reconnectCount: 1,
					reconnectTriggered: true,
					tags: ['dialogue-style'],
					title: 'Scenario 1',
					turnPassRate: 1,
					turnCountDelta: 0,
					turnResults: [
						{
							actualText: 'alpha',
							accuracy: {
								actualText: 'alpha',
								charDistance: 0,
								charErrorRate: 0,
								expectedText: 'alpha',
								passesThreshold: true,
								threshold: 0.35,
								wordDistance: 0,
								wordErrorRate: 0
							},
							expectedText: 'alpha',
							index: 0,
							passes: true
						}
					]
				},
				{
					actualTurns: ['better'],
					averageRelativeCostUnits: 1,
					duplicateTurnCount: 0,
					elapsedMs: 1000,
					fallbackReplayAudioMs: 0,
					expectedReconnectCount: 0,
					expectedTurns: ['better'],
					fixtureId: 'scenario-2',
					primaryAudioMs: 600,
					passes: true,
					reconnectCount: 0,
					reconnectTriggered: false,
					tags: ['dialogue-style'],
					title: 'Scenario 2',
					turnPassRate: 1,
					turnCountDelta: 0,
					turnResults: [
						{
							actualText: 'better',
							accuracy: {
								actualText: 'better',
								charDistance: 0,
								charErrorRate: 0,
								expectedText: 'better',
								passesThreshold: true,
								threshold: 0.35,
								wordDistance: 0,
								wordErrorRate: 0
							},
							expectedText: 'better',
							index: 0,
							passes: true
						}
					]
				}
			],
			summary: {
				adapterId: 'adapter-x',
				averageElapsedMs: 950,
				averageFallbackReplayAudioMs: 0,
				averagePrimaryAudioMs: 600,
				averageReconnectCount: 0.5,
				averageRelativeCostUnits: 1,
				averageTurnPassRate: 1,
				averageWordErrorRate: 0,
				duplicateTurnRate: 0,
				passCount: 2,
				passRate: 1,
				reconnectCoverageRate: 1,
				reconnectSuccessRate: 1,
				scenarioCount: 2,
				scenariosWithDuplicateTurns: 0,
				scenariosWithTurnCountMismatch: 0
			}
		}
	];

	const summary = summarizeVoiceSessionBenchmarkSeries({
		adapterId: 'adapter-x',
		reports
	});

	expect(summary.runCount).toBe(2);
	expect(summary.summary.totalRunCount).toBe(4);
	expect(summary.summary.totalPassCount).toBe(3);
	expect(summary.summary.stableScenarioCount).toBe(1);
	expect(summary.summary.flakyScenarioCount).toBe(1);
	expect(summary.summary.averagePassRate).toBe(0.75);
	expect(summary.summary.averageReconnectCount).toBe(0.5);
	expect(summary.summary.averageTurnPassRate).toBe(0.75);
	expect(summary.summary.reconnectCoverageRate).toBe(1);
	expect(summary.scenarios.find((scenario) => scenario.fixtureId === 'scenario-2')?.passRate).toBe(
		0.5
	);
});

test('runVoiceSessionBenchmarkScenario does not flag duplicate turns when turn count matches expected repeated phrases', async () => {
	const transcripts = [
		'Go quietly, alone. No harm will befall you.',
		'We passed around Atlanta and traveled under Joe Johnson.',
		'Go quietly, alone. No harm will befall you.',
		'We passed around Atlanta and traveled under Joe Johnson.'
	];
	let transcriptIndex = 0;

	const adapter: STTAdapter = {
		kind: 'stt',
		open: () => ({
			close: async () => {},
			on: (_event, _handler) => () => {},
			send: async () => {}
		})
	};

	const result = await runVoiceSessionBenchmarkScenario(
		{
			...adapter,
			open: async () => {
				const listeners = new Map<string, Array<(payload: any) => void | Promise<void>>>();
				const emit = async (event: string, payload: unknown) => {
					for (const listener of listeners.get(event) ?? []) {
						await listener(payload);
					}
				};

				return {
					close: async () => {},
					on: (event, handler) => {
						const entries = listeners.get(event) ?? [];
						entries.push(handler as never);
						listeners.set(event, entries);
						return () => {};
					},
					send: async () => {
						const text = transcripts[transcriptIndex];
						if (!text) {
							return;
						}

						const currentId = `turn-${transcriptIndex}`;
						transcriptIndex += 1;
						await emit('final', {
							receivedAt: Date.now(),
							transcript: {
								id: currentId,
								isFinal: true,
								text
							},
							type: 'final'
						});
						await emit('endOfTurn', {
							reason: 'vendor',
							receivedAt: Date.now(),
							type: 'endOfTurn'
						});
					}
				};
			}
		},
		{
			audio: new Uint8Array(12_800),
			audioPath: 'synthetic.pcm',
			chunkDurationMs: 100,
			difficulty: 'clean',
			expectedText: 'synthetic repeated-turn session',
			expectedTurnTexts: [
				'GO QUIETLY ALONE NO HARM WILL BEFALL YOU',
				'WE PASSED AROUND ATLANTA AND TRAVELED UNDER JOE JOHNSTON',
				'GO QUIETLY ALONE NO HARM WILL BEFALL YOU',
				'WE PASSED AROUND ATLANTA AND TRAVELED UNDER JOE JOHNSTON'
			],
			format: {
				channels: 1,
				container: 'raw',
				encoding: 'pcm_s16le',
				sampleRateHz: 16_000
			},
			id: 'repeated-turn-no-duplicate',
			silenceMs: 20,
			tags: ['synthetic'],
			tailPaddingMs: 0,
			title: 'Repeated expected turns with recurring mishear do not count as duplicate commits',
			transcriptStabilityMs: 5,
			transcriptThreshold: 0.35
		}
	);

	expect(result.turnCountDelta).toBe(0);
	expect(result.duplicateTurnCount).toBe(0);
});
