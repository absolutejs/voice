import { expect, test } from 'bun:test';
import {
	getDefaultTTSBenchmarkFixtures,
	runTTSAdapterBenchmark,
	runTTSAdapterFixture,
	summarizeTTSBenchmark
} from '../src/testing/tts';
import type {
	RealtimeAdapter,
	RealtimeSessionEventMap,
	TTSAdapter,
	TTSSessionEventMap
} from '../src/types';

type TTSListenerMap = {
	[K in keyof TTSSessionEventMap]: Array<
		(payload: TTSSessionEventMap[K]) => void | Promise<void>
	>;
};

type RealtimeListenerMap = {
	[K in keyof RealtimeSessionEventMap]: Array<
		(payload: RealtimeSessionEventMap[K]) => void | Promise<void>
	>;
};

const createFakeTTSAdapter = (): TTSAdapter => ({
	kind: 'tts',
	open: () => {
		const listeners: TTSListenerMap = {
			audio: [],
			close: [],
			error: []
		};

		return {
			close: async () => {
				for (const listener of listeners.close) {
					await listener({
						recoverable: false,
						type: 'close'
					});
				}
			},
			on: (event, handler) => {
				listeners[event].push(handler as never);
				return () => {};
			},
			send: async () => {
				for (const listener of listeners.audio) {
					await listener({
						chunk: new Uint8Array(4096),
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 16000
						},
						receivedAt: Date.now(),
						type: 'audio'
					});
				}
			}
		};
	}
});

const createFakeRealtimeAdapter = (): RealtimeAdapter => ({
	kind: 'realtime',
	open: () => {
		const listeners: RealtimeListenerMap = {
			audio: [],
			close: [],
			endOfTurn: [],
			error: [],
			final: [],
			partial: []
		};

		return {
			close: async () => {
				for (const listener of listeners.close) {
					await listener({
						reason: 'done',
						recoverable: false,
						type: 'close'
					});
				}
			},
			on: (event, handler) => {
				listeners[event].push(handler as never);
				return () => {};
			},
			send: async (input) => {
				expect(typeof input).toBe('string');
				for (const listener of listeners.audio) {
					await listener({
						chunk: new Uint8Array(8192),
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 24000
						},
						receivedAt: Date.now(),
						type: 'audio'
					});
				}
			}
		};
	}
});

test('getDefaultTTSBenchmarkFixtures returns bundled text prompts', () => {
	const fixtures = getDefaultTTSBenchmarkFixtures();

	expect(fixtures).toHaveLength(3);
	expect(fixtures.every((fixture) => fixture.text.length > 0)).toBe(true);
});

test('runTTSAdapterFixture measures audio output for TTS adapters', async () => {
	const result = await runTTSAdapterFixture(createFakeTTSAdapter(), {
		id: 'tts-fixture',
		text: 'Test short response',
		title: 'Short'
	});

	expect(result.passes).toBe(true);
	expect(result.audioChunkCount).toBe(1);
	expect(result.totalAudioBytes).toBe(4096);
	expect(result.firstAudioLatencyMs).toBeDefined();
});

test('runTTSAdapterFixture supports realtime output adapters', async () => {
	const result = await runTTSAdapterFixture(createFakeRealtimeAdapter(), {
		id: 'realtime-fixture',
		text: 'Say this out loud',
		title: 'Realtime'
	});

	expect(result.passes).toBe(true);
	expect(result.audioChunkCount).toBe(1);
	expect(result.totalAudioBytes).toBe(8192);
	expect(result.audioFormat?.sampleRateHz).toBe(24000);
});

test('runTTSAdapterFixture measures interruption latency after first audio', async () => {
	const adapter: TTSAdapter = {
		kind: 'tts',
		open: () => {
			const listeners: TTSListenerMap = {
				audio: [],
				close: [],
				error: []
			};
			let closed = false;

			return {
				close: async () => {
					closed = true;
					for (const listener of listeners.close) {
						await listener({
							reason: 'interrupt',
							recoverable: false,
							type: 'close'
						});
					}
				},
				on: (event, handler) => {
					listeners[event].push(handler as never);
					return () => {};
				},
				send: async () => {
					await listeners.audio[0]?.({
						chunk: new Uint8Array(2048),
						format: {
							channels: 1,
							container: 'raw',
							encoding: 'pcm_s16le',
							sampleRateHz: 16000
						},
						receivedAt: Date.now(),
						type: 'audio'
					});
					await Bun.sleep(300);
					if (!closed) {
						await listeners.audio[0]?.({
							chunk: new Uint8Array(2048),
							format: {
								channels: 1,
								container: 'raw',
								encoding: 'pcm_s16le',
								sampleRateHz: 16000
							},
							receivedAt: Date.now(),
							type: 'audio'
						});
					}
				}
			};
		}
	};

	const result = await runTTSAdapterFixture(
		adapter,
		{
			id: 'interrupt-fixture',
			text: 'Interrupt me once audio starts',
			title: 'Interrupt'
		},
		{
			interruptAfterFirstAudioMs: 10,
			minAudioBytes: 256,
			waitForCloseAfterInterruptMs: 500
		}
	);

	expect(result.passes).toBe(true);
	expect(result.interruptionRequestedAtMs).toBeDefined();
	expect(result.interruptionLatencyMs).toBeDefined();
	expect(result.preInterruptAudioBytes).toBe(2048);
	expect(result.postInterruptAudioBytes).toBe(0);
});

test('summarizeTTSBenchmark aggregates fixture metrics', () => {
	const summary = summarizeTTSBenchmark('fake', [
		{
			audioChunkCount: 1,
			audioDurationMs: 100,
			closeCount: 1,
			elapsedMs: 200,
			errorCount: 0,
			fixtureId: 'a',
			firstAudioLatencyMs: 25,
			passes: true,
			tags: [],
			textLength: 20,
			title: 'A',
			totalAudioBytes: 1000
		},
		{
			audioChunkCount: 2,
			audioDurationMs: 150,
			closeCount: 1,
			elapsedMs: 300,
			errorCount: 1,
			fixtureId: 'b',
			firstAudioLatencyMs: 75,
			passes: false,
			tags: [],
			textLength: 40,
			title: 'B',
			totalAudioBytes: 2000
		}
	]);

	expect(summary.passRate).toBe(0.5);
	expect(summary.averageFirstAudioLatencyMs).toBe(50);
	expect(summary.averageInterruptionLatencyMs).toBeUndefined();
	expect(summary.totalAudioBytes).toBe(3000);
	expect(summary.totalErrorCount).toBe(1);
});

test('runTTSAdapterBenchmark returns a saved-style report shape', async () => {
	const report = await runTTSAdapterBenchmark(
		'fake-tts',
		createFakeTTSAdapter(),
		getDefaultTTSBenchmarkFixtures().slice(0, 1)
	);

	expect(report.adapterId).toBe('fake-tts');
	expect(report.fixtures).toHaveLength(1);
	expect(report.summary.passCount).toBe(1);
});
