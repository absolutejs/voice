import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	assertVoiceProofTrendEvidence,
	buildEmptyVoiceProofTrendReport,
	buildVoiceProofTrendReport,
	createVoiceProofTrendRoutes,
	evaluateVoiceProofTrendEvidence,
	formatVoiceProofTrendAge
} from '../src/proofTrends';

describe('proof trends', () => {
	test('buildVoiceProofTrendReport marks fresh passing artifacts as pass', () => {
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			source: '.voice-runtime/proof-trends/latest.json',
			summary: {
				cycles: 6,
				maxLiveP95Ms: 420
			}
		});

		expect(report.ok).toBe(true);
		expect(report.status).toBe('pass');
		expect(report.ageMs).toBe(30_000);
		expect(report.freshUntil).toBe('2026-04-29T12:01:00.000Z');
		expect(report.summary.cycles).toBe(6);
	});

	test('buildVoiceProofTrendReport marks old artifacts as stale', () => {
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:02:00.000Z',
			ok: true
		});

		expect(report.ok).toBe(false);
		expect(report.status).toBe('stale');
		expect(report.ageMs).toBe(120_000);
	});

	test('buildEmptyVoiceProofTrendReport exposes empty status', () => {
		const report = buildEmptyVoiceProofTrendReport('latest.json', 60_000);

		expect(report.ok).toBe(false);
		expect(report.status).toBe('empty');
		expect(report.source).toBe('latest.json');
	});

	test('formatVoiceProofTrendAge formats human-readable ages', () => {
		expect(formatVoiceProofTrendAge(undefined)).toBe('unknown');
		expect(formatVoiceProofTrendAge(10_000)).toBe('less than 1m');
		expect(formatVoiceProofTrendAge(9 * 60_000)).toBe('9m');
		expect(formatVoiceProofTrendAge(3 * 60 * 60_000 + 4 * 60_000)).toBe(
			'3h 4m'
		);
		expect(formatVoiceProofTrendAge(3 * 24 * 60 * 60_000)).toBe('3d 0h');
	});

	test('evaluateVoiceProofTrendEvidence verifies fresh passing sustained trends', () => {
		const report = buildVoiceProofTrendReport({
			cycles: [
				{
					cycle: 1,
					liveLatency: { p95Ms: 420, samples: 100 },
					ok: true,
					providerSlo: {
						eventsWithLatency: 12,
						status: 'pass'
					},
					turnLatency: { p95Ms: 140, samples: 27, status: 'pass' }
				},
				{
					cycle: 2,
					liveLatency: { p95Ms: 410, samples: 100 },
					ok: true,
					providerSlo: {
						eventsWithLatency: 18,
						status: 'pass'
					},
					turnLatency: { p95Ms: 130, samples: 27, status: 'pass' }
				}
			],
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 2,
				maxLiveP95Ms: 420,
				maxProviderP95Ms: 700,
				maxTurnP95Ms: 140
			}
		});

		expect(
			evaluateVoiceProofTrendEvidence(report, {
				maxAgeMs: 60_000,
				maxLiveP95Ms: 800,
				maxProviderP95Ms: 1_500,
				maxTurnP95Ms: 500,
				minCycles: 2,
				minLiveLatencySamples: 50,
				minProviderSloEventsWithLatency: 6,
				minTurnLatencySamples: 10
			})
		).toMatchObject({
			cycles: 2,
			failedCycles: 0,
			ok: true,
			status: 'pass'
		});
		expect(assertVoiceProofTrendEvidence(report, { minCycles: 2 }).ok).toBe(
			true
		);
	});

	test('evaluateVoiceProofTrendEvidence catches stale failing or under-sampled trends', () => {
		const report = buildVoiceProofTrendReport({
			cycles: [
				{
					cycle: 1,
					liveLatency: { p95Ms: 1_200, samples: 2 },
					ok: false,
					providerSlo: {
						eventsWithLatency: 1,
						status: 'fail'
					},
					turnLatency: { p95Ms: 900, samples: 3, status: 'fail' }
				}
			],
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:02:00.000Z',
			ok: false,
			summary: {
				cycles: 1,
				maxLiveP95Ms: 1_200,
				maxProviderP95Ms: 5_500,
				maxTurnP95Ms: 900
			}
		});
		const assertion = evaluateVoiceProofTrendEvidence(report, {
			maxAgeMs: 60_000,
			maxLiveP95Ms: 800,
			maxProviderP95Ms: 1_500,
			maxTurnP95Ms: 500,
			minCycles: 2,
			minLiveLatencySamples: 50,
			minProviderSloEventsWithLatency: 6,
			minTurnLatencySamples: 10
		});

		expect(assertion).toMatchObject({
			cycles: 1,
			failedCycles: 1,
			ok: false,
			status: 'stale'
		});
		expect(assertion.issues).toEqual(
			expect.arrayContaining([
				expect.stringContaining('status pass'),
				expect.stringContaining('ok to be true'),
				expect.stringContaining('at least 2 proof trend cycle'),
				expect.stringContaining('all proof trend cycles to pass'),
				expect.stringContaining('age at most 60000ms'),
				expect.stringContaining('live latency p95'),
				expect.stringContaining('provider p95'),
				expect.stringContaining('turn latency p95'),
				expect.stringContaining('live latency sample'),
				expect.stringContaining('provider latency event'),
				expect.stringContaining('turn latency sample')
			])
		);
		expect(() => assertVoiceProofTrendEvidence(report)).toThrow(
			'Voice proof trends assertion failed'
		);
	});

	test('createVoiceProofTrendRoutes exposes current proof trends JSON', async () => {
		const app = createVoiceProofTrendRoutes({
			maxAgeMs: 60_000,
			source: {
				generatedAt: '2026-04-29T12:00:00.000Z',
				now: '2026-04-29T12:00:30.000Z',
				ok: true,
				summary: { cycles: 2 }
			}
		});

		const response = await app.handle(
			new Request('http://localhost/api/voice/proof-trends')
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.status).toBe('pass');
		expect(body.summary.cycles).toBe(2);
	});

	test('createVoiceProofTrendRoutes can read latest proof trends from a file', async () => {
		const dir = await mkdtemp('/tmp/voice-proof-trends-');
		const path = join(dir, 'latest.json');
		await writeFile(
			path,
			`${JSON.stringify({
				generatedAt: new Date().toISOString(),
				ok: true,
				summary: { cycles: 3 }
			})}\n`
		);
		const app = createVoiceProofTrendRoutes({
			jsonPath: path,
			maxAgeMs: 60_000
		});

		const response = await app.handle(
			new Request('http://localhost/api/voice/proof-trends')
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.source).toBe(path);
		expect(body.summary.cycles).toBe(3);
	});
});
