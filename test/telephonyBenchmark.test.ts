import { expect, test } from 'bun:test';
import {
	getDefaultVoiceTelephonyBenchmarkScenarios,
	runVoiceTelephonyBenchmark,
	runVoiceTelephonyBenchmarkScenario,
	summarizeVoiceTelephonyBenchmark
} from '../src/testing/telephony';

test('getDefaultVoiceTelephonyBenchmarkScenarios returns bundled bridge scenarios', () => {
	const scenarios = getDefaultVoiceTelephonyBenchmarkScenarios();

	expect(scenarios).toHaveLength(3);
	expect(scenarios.some((scenario) => scenario.expectClear)).toBe(true);
	expect(scenarios.every((scenario) => scenario.expectOutboundMedia)).toBe(true);
});

test('runVoiceTelephonyBenchmarkScenario measures first outbound media and mark', async () => {
	const result = await runVoiceTelephonyBenchmarkScenario({
		expectClear: false,
		expectMark: true,
		expectOutboundMedia: true,
		id: 'telephony-turn-test',
		title: 'Turn test'
	});

	expect(result.passes).toBe(true);
	expect(result.outboundMediaCount).toBeGreaterThan(0);
	expect(result.markCount).toBeGreaterThan(0);
	expect(result.firstOutboundMediaLatencyMs).toBeGreaterThanOrEqual(0);
	expect(result.markLatencyMs).toBeGreaterThanOrEqual(0);
});

test('runVoiceTelephonyBenchmarkScenario measures clear on inbound barge-in', async () => {
	const result = await runVoiceTelephonyBenchmarkScenario({
		expectClear: true,
		expectMark: true,
		expectOutboundMedia: true,
		id: 'telephony-clear-test',
		secondInboundDelayMs: 1,
		title: 'Clear test',
		ttsChunkCount: 2,
		ttsChunkDelayMs: 2
	});

	expect(result.passes).toBe(true);
	expect(result.clearCount).toBeGreaterThan(0);
	expect(result.clearLatencyMs).toBeGreaterThanOrEqual(0);
});

test('summarizeVoiceTelephonyBenchmark aggregates pass rate and latency metrics', () => {
	const summary = summarizeVoiceTelephonyBenchmark([
		{
			clearCount: 1,
			clearLatencyMs: 3,
			elapsedMs: 10,
			expectClear: true,
			expectMark: true,
			expectOutboundMedia: true,
			fixtureId: 'a',
			firstOutboundMediaLatencyMs: 4,
			markCount: 1,
			markLatencyMs: 5,
			outboundMediaCount: 2,
			passes: true,
			receivedAudioBytes: 100,
			title: 'A'
		},
		{
			clearCount: 0,
			elapsedMs: 20,
			expectClear: false,
			expectMark: true,
			expectOutboundMedia: true,
			fixtureId: 'b',
			firstOutboundMediaLatencyMs: 6,
			markCount: 1,
			markLatencyMs: 7,
			outboundMediaCount: 1,
			passes: false,
			receivedAudioBytes: 120,
			title: 'B'
		}
	]);

	expect(summary.passRate).toBe(0.5);
	expect(summary.averageElapsedMs).toBe(15);
	expect(summary.averageFirstOutboundMediaLatencyMs).toBe(5);
	expect(summary.averageMarkLatencyMs).toBe(6);
	expect(summary.averageClearLatencyMs).toBe(3);
	expect(summary.totalOutboundMediaCount).toBe(3);
});

test('runVoiceTelephonyBenchmark returns a saved-style report shape', async () => {
	const report = await runVoiceTelephonyBenchmark(
		getDefaultVoiceTelephonyBenchmarkScenarios().slice(0, 1)
	);

	expect(report.fixtures).toHaveLength(1);
	expect(report.summary.passCount).toBe(1);
	expect(report.generatedAt).toBeGreaterThan(0);
});
