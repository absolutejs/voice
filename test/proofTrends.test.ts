import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	assertVoiceProofTrendEvidence,
	buildEmptyVoiceProofTrendReport,
	buildVoiceProofTrendProfileSummaries,
	buildVoiceProofTrendRecommendationReport,
	buildVoiceProofTrendReportFromRealCallProfiles,
	buildVoiceProofTrendReport,
	buildVoiceRealCallProfileDefaults,
	buildVoiceRealCallProfileEvidenceFromTraceEvents,
	buildVoiceRealCallProfileHistoryReport,
	buildVoiceRealCallProfileReadinessCheck,
	buildVoiceRealCallProfileRecoveryJobHistoryCheck,
	buildVoiceRealCallProfileRecoveryActions,
	createVoiceInMemoryRealCallProfileRecoveryJobStore,
	createVoiceRealCallProfileTraceCollector,
	createVoiceSQLiteRealCallProfileRecoveryJobStore,
	createVoiceProofTrendRecommendationRoutes,
	createVoiceProofTrendRoutes,
	createVoiceRealCallProfileHistoryRoutes,
	createVoiceRealCallProfileRecoveryActionRoutes,
	evaluateVoiceProofTrendEvidence,
	formatVoiceProofTrendAge,
	loadVoiceRealCallProfileEvidenceFromTraceStore,
	runVoiceRealCallProfileRecoveryLoop,
	resolveVoiceRealCallProfileProviderRoute
} from '../src/proofTrends';
import type { VoiceProofTrendProviderSummary } from '../src/proofTrends';
import {
	createVoiceMemoryTraceEventStore,
	createVoiceTraceEvent
} from '../src/trace';

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
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 420,
						maxInterruptionP95Ms: 180,
						maxJitterMs: 12,
						maxTimestampDriftMs: 24,
						samples: 8,
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
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 410,
						maxInterruptionP95Ms: 170,
						maxJitterMs: 10,
						maxTimestampDriftMs: 20,
						samples: 8,
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
				runtimeChannel: {
					maxBackpressureEvents: 0,
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 180,
					maxJitterMs: 12,
					maxTimestampDriftMs: 24,
					samples: 16,
					status: 'pass'
				},
				maxTurnP95Ms: 140
			}
		});

		expect(
			evaluateVoiceProofTrendEvidence(report, {
				maxAgeMs: 60_000,
				maxLiveP95Ms: 800,
				maxProviderP95Ms: 1_500,
				maxRuntimeBackpressureEvents: 0,
				maxRuntimeFirstAudioLatencyMs: 600,
				maxRuntimeInterruptionP95Ms: 250,
				maxRuntimeJitterMs: 30,
				maxRuntimeTimestampDriftMs: 50,
				maxTurnP95Ms: 500,
				minCycles: 2,
				minLiveLatencySamples: 50,
				minProviderSloEventsWithLatency: 6,
				minRuntimeChannelSamples: 10,
				minTurnLatencySamples: 10
			})
		).toMatchObject({
			cycles: 2,
			failedCycles: 0,
			ok: true,
			runtimeChannel: {
				maxFirstAudioLatencyMs: 420,
				maxInterruptionP95Ms: 180
			},
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
				runtimeChannel: {
					maxBackpressureEvents: 3,
					maxFirstAudioLatencyMs: 1_500,
					maxInterruptionP95Ms: 700,
					maxJitterMs: 120,
					maxTimestampDriftMs: 200,
					samples: 1,
					status: 'fail'
				},
				maxTurnP95Ms: 900
			}
		});
		const assertion = evaluateVoiceProofTrendEvidence(report, {
			maxAgeMs: 60_000,
			maxLiveP95Ms: 800,
			maxProviderP95Ms: 1_500,
			maxRuntimeBackpressureEvents: 0,
			maxRuntimeFirstAudioLatencyMs: 600,
			maxRuntimeInterruptionP95Ms: 250,
			maxRuntimeJitterMs: 30,
			maxRuntimeTimestampDriftMs: 50,
			maxTurnP95Ms: 500,
			minCycles: 2,
			minLiveLatencySamples: 50,
			minProviderSloEventsWithLatency: 6,
			minRuntimeChannelSamples: 10,
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
				expect.stringContaining('runtime-channel first audio latency'),
				expect.stringContaining('runtime-channel interruption p95'),
				expect.stringContaining('runtime-channel jitter'),
				expect.stringContaining('runtime-channel timestamp drift'),
				expect.stringContaining('runtime-channel backpressure events'),
				expect.stringContaining('runtime-channel samples'),
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

	test('buildVoiceProofTrendRecommendationReport turns sustained history into provider and runtime guidance', () => {
		const providers = [
			{
				id: 'openai-llm',
				label: 'OpenAI LLM',
				p95Ms: 640,
				role: 'llm',
				samples: 18,
				status: 'pass'
			},
			{
				id: 'deepgram-stt',
				label: 'Deepgram STT',
				p95Ms: 210,
				role: 'stt',
				samples: 18,
				status: 'pass'
			},
			{
				id: 'openai-tts',
				label: 'OpenAI TTS',
				p95Ms: 340,
				role: 'tts',
				samples: 18,
				status: 'pass'
			}
		] satisfies VoiceProofTrendProviderSummary[];
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			outputDir: '.voice-runtime/proof-trends/recommend',
			summary: {
				cycles: 6,
				maxLiveP95Ms: 531,
				maxProviderP95Ms: 700,
				profiles: [
					{
						id: 'meeting-recorder',
						label: 'Meeting recorder',
						maxLiveP95Ms: 531,
						maxProviderP95Ms: 700,
						maxTurnP95Ms: 690,
						providers,
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 420,
							maxInterruptionP95Ms: 190,
							maxJitterMs: 12,
							maxTimestampDriftMs: 500,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					},
					{
						id: 'support-agent',
						label: 'Support agent',
						maxLiveP95Ms: 548,
						maxProviderP95Ms: 720,
						maxTurnP95Ms: 693,
						providers,
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 430,
							maxInterruptionP95Ms: 196,
							maxJitterMs: 14,
							maxTimestampDriftMs: 510,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					},
					{
						id: 'appointment-scheduler',
						label: 'Appointment scheduler',
						maxLiveP95Ms: 560,
						maxProviderP95Ms: 735,
						maxTurnP95Ms: 695,
						providers,
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 436,
							maxInterruptionP95Ms: 202,
							maxJitterMs: 15,
							maxTimestampDriftMs: 520,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					},
					{
						id: 'noisy-phone-call',
						label: 'Noisy phone call',
						maxLiveP95Ms: 571,
						maxProviderP95Ms: 760,
						maxTurnP95Ms: 697,
						providers,
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 442,
							maxInterruptionP95Ms: 210,
							maxJitterMs: 18,
							maxTimestampDriftMs: 540,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					}
				],
				providers,
				runtimeChannel: {
					maxBackpressureEvents: 0,
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 190,
					maxJitterMs: 12,
					maxTimestampDriftMs: 500,
					samples: 4,
					status: 'pass'
				},
				maxTurnP95Ms: 690
			}
		});

		const recommendations = buildVoiceProofTrendRecommendationReport(report);

		expect(recommendations.ok).toBe(true);
		expect(recommendations.status).toBe('pass');
		expect(recommendations.bestProvider?.id).toBe('deepgram-stt');
		expect(recommendations.bestProviders.map((provider) => provider.role)).toEqual([
			'llm',
			'stt',
			'tts'
		]);
		expect(recommendations.summary.providerComparisonCount).toBe(3);
		expect(recommendations.summary.keepCurrentProviderPath).toBe(true);
		expect(recommendations.summary.keepCurrentRuntimeChannel).toBe(true);
		expect(recommendations.profiles).toHaveLength(4);
		expect(recommendations.profiles.every((profile) => profile.status === 'pass')).toBe(
			true
		);
		expect(recommendations.profiles.map((profile) => profile.id)).toEqual([
			'meeting-recorder',
			'support-agent',
			'appointment-scheduler',
			'noisy-phone-call'
		]);
		expect(recommendations.recommendations.map((item) => item.surface)).toEqual([
			'provider-path',
			'runtime-channel',
			'live-latency',
			'turn-latency'
		]);
	});

	test('buildVoiceProofTrendProfileSummaries aggregates profile history before using fallback derivation', () => {
		const older = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				maxLiveP95Ms: 520,
				maxProviderP95Ms: 690,
				maxTurnP95Ms: 680,
				profiles: [
					{
						id: 'support-agent',
						label: 'Support agent',
						maxLiveP95Ms: 540,
						maxProviderP95Ms: 710,
						maxTurnP95Ms: 690,
						providers: [
							{
								id: 'stt:deepgram',
								label: 'STT deepgram',
								p95Ms: 82,
								role: 'stt',
								samples: 6,
								status: 'pass'
							}
						],
						runtimeChannel: {
							maxFirstAudioLatencyMs: 430,
							maxInterruptionP95Ms: 195,
							maxJitterMs: 14,
							maxTimestampDriftMs: 510,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					}
				],
				providers: [
					{
						id: 'llm:openai',
						label: 'LLM openai',
						p95Ms: 690,
						role: 'llm',
						samples: 12,
						status: 'pass'
					}
				],
				runtimeChannel: {
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 190,
					maxJitterMs: 12,
					maxTimestampDriftMs: 500,
					samples: 4,
					status: 'pass'
				}
			}
		});
		const newer = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:01:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:01:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				maxLiveP95Ms: 531,
				maxProviderP95Ms: 700,
				maxTurnP95Ms: 690,
				profiles: [
					{
						id: 'support-agent',
						label: 'Support agent',
						maxLiveP95Ms: 548,
						maxProviderP95Ms: 720,
						maxTurnP95Ms: 693,
						providers: [
							{
								id: 'stt:deepgram',
								label: 'STT deepgram',
								p95Ms: 82,
								role: 'stt',
								samples: 6,
								status: 'pass'
							},
							{
								id: 'tts:openai',
								label: 'TTS openai',
								p95Ms: 45,
								role: 'tts',
								samples: 6,
								status: 'pass'
							}
						],
						runtimeChannel: {
							maxFirstAudioLatencyMs: 435,
							maxInterruptionP95Ms: 198,
							maxJitterMs: 15,
							maxTimestampDriftMs: 520,
							samples: 4,
							status: 'pass'
						},
						status: 'pass'
					}
				],
				providers: [
					{
						id: 'llm:openai',
						label: 'LLM openai',
						p95Ms: 700,
						role: 'llm',
						samples: 12,
						status: 'pass'
					}
				],
				runtimeChannel: {
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 190,
					maxJitterMs: 12,
					maxTimestampDriftMs: 500,
					samples: 4,
					status: 'pass'
				}
			}
		});
		const unprofiled = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:02:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:02:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				maxLiveP95Ms: 535,
				maxProviderP95Ms: 710,
				maxTurnP95Ms: 691,
				providers: [
					{
						id: 'stt:deepgram',
						label: 'STT deepgram',
						p95Ms: 82,
						role: 'stt',
						samples: 4,
						status: 'pass'
					}
				],
				runtimeChannel: {
					maxFirstAudioLatencyMs: 421,
					maxInterruptionP95Ms: 191,
					maxJitterMs: 13,
					maxTimestampDriftMs: 501,
					samples: 4,
					status: 'pass'
				}
			}
		});

		const profiles = buildVoiceProofTrendProfileSummaries([
			older,
			newer,
			unprofiled
		]);
		const supportAgent = profiles.find((profile) => profile.id === 'support-agent');
		const meetingRecorder = profiles.find(
			(profile) => profile.id === 'meeting-recorder'
		);

		expect(supportAgent).toMatchObject({
			maxLiveP95Ms: 552,
			maxProviderP95Ms: 730,
			maxTurnP95Ms: 694,
			runtimeChannel: {
				maxFirstAudioLatencyMs: 435,
				maxInterruptionP95Ms: 198
			},
			status: 'pass'
		});
		expect(
			supportAgent?.providers.find((provider) => provider.id === 'stt:deepgram')
				?.samples
		).toBe(16);
		expect(meetingRecorder).toMatchObject({
			maxLiveP95Ms: 535,
			maxProviderP95Ms: 710,
			maxTurnP95Ms: 691,
			status: 'pass'
		});
	});

	test('buildVoiceProofTrendProfileSummaries recomputes stale failed profile statuses from budgets', () => {
		const staleFailedProfile = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				profiles: [
					{
						id: 'support-agent',
						label: 'Support agent',
						maxLiveP95Ms: 800,
						maxProviderP95Ms: 720,
						maxTurnP95Ms: 693,
						providers: [
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 700,
								role: 'llm',
								samples: 12,
								status: 'pass'
							},
							{
								id: 'stt:deepgram',
								label: 'STT deepgram',
								p95Ms: 82,
								role: 'stt',
								samples: 6,
								status: 'pass'
							},
							{
								id: 'tts:openai',
								label: 'TTS openai',
								p95Ms: 45,
								role: 'tts',
								samples: 6,
								status: 'pass'
							}
						],
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 430,
							maxInterruptionP95Ms: 195,
							maxJitterMs: 15,
							maxTimestampDriftMs: 510,
							samples: 4,
							status: 'pass'
						},
						status: 'fail'
					}
				]
			}
		});
		const current = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:01:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:01:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				maxLiveP95Ms: 531,
				maxProviderP95Ms: 700,
				maxTurnP95Ms: 690,
				providers: [
					{
						id: 'llm:openai',
						label: 'LLM openai',
						p95Ms: 700,
						role: 'llm',
						samples: 12,
						status: 'pass'
					}
				],
				runtimeChannel: {
					maxBackpressureEvents: 0,
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 190,
					maxJitterMs: 12,
					maxTimestampDriftMs: 500,
					samples: 4,
					status: 'pass'
				}
			}
		});

		const supportAgent = buildVoiceProofTrendProfileSummaries([
			staleFailedProfile,
			current
		]).find((profile) => profile.id === 'support-agent');

		expect(supportAgent).toMatchObject({
			maxLiveP95Ms: 800,
			maxProviderP95Ms: 720,
			maxTurnP95Ms: 693,
			status: 'pass'
		});
	});

	test('buildVoiceProofTrendProfileSummaries ignores zero-sample stale provider rows', () => {
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				profiles: [
					{
						id: 'support-agent',
						label: 'Support agent',
						maxProviderP95Ms: 700,
						providers: [
							{
								id: 'llm',
								label: 'LLM llm',
								role: 'llm',
								samples: 0,
								status: 'fail'
							},
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 700,
								role: 'llm',
								samples: 12,
								status: 'pass'
							}
						],
						status: 'pass'
					}
				]
			}
		});

		const supportAgent = buildVoiceProofTrendProfileSummaries([report]).find(
			(profile) => profile.id === 'support-agent'
		);

		expect(supportAgent?.providers?.map((provider) => provider.id)).toEqual([
			'llm:openai'
		]);
		expect(supportAgent?.status).toBe('pass');
	});

	test('buildVoiceProofTrendReportFromRealCallProfiles emits history-compatible profile proof from session evidence', () => {
		const report = buildVoiceProofTrendReportFromRealCallProfiles({
			evidence: [
				{
					generatedAt: '2026-04-29T12:00:00.000Z',
					liveP95Ms: 510,
					ok: true,
					profileId: 'meeting-recorder',
					providerP95Ms: 680,
					providers: [
						{
							id: 'llm:openai',
							label: 'LLM openai',
							p95Ms: 680,
							role: 'llm',
							samples: 1,
							status: 'pass'
						},
						{
							id: 'stt:deepgram',
							label: 'STT deepgram',
							p95Ms: 82,
							role: 'stt',
							samples: 1,
							status: 'pass'
						},
						{
							id: 'tts:openai',
							label: 'TTS openai',
							p95Ms: 45,
							role: 'tts',
							samples: 1,
							status: 'pass'
						}
					],
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 410,
						maxInterruptionP95Ms: 180,
						maxJitterMs: 12,
						maxTimestampDriftMs: 500,
						samples: 1,
						status: 'pass'
					},
					sessionId: 'real-call-1',
					turnP95Ms: 650
				},
				{
					generatedAt: '2026-04-29T12:02:00.000Z',
					liveP95Ms: 540,
					ok: true,
					profileId: 'meeting-recorder',
					providerP95Ms: 700,
					providers: [
						{
							id: 'llm:openai',
							label: 'LLM openai',
							p95Ms: 700,
							role: 'llm',
							samples: 1,
							status: 'pass'
						}
					],
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 420,
						maxInterruptionP95Ms: 190,
						maxJitterMs: 14,
						maxTimestampDriftMs: 510,
						samples: 1,
						status: 'pass'
					},
					sessionId: 'real-call-2',
					turnP95Ms: 670
				}
			],
			generatedAt: '2026-04-29T12:03:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:03:30.000Z',
			source: '.voice-runtime/real-call-profiles/latest.json'
		});

		expect(report).toMatchObject({
			ok: true,
			source: '.voice-runtime/real-call-profiles/latest.json',
			summary: {
				cycles: 2,
				maxLiveP95Ms: 540,
				maxProviderP95Ms: 700,
				maxTurnP95Ms: 670,
				profiles: [
					{
						id: 'meeting-recorder',
						maxLiveP95Ms: 540,
						maxProviderP95Ms: 700,
						maxTurnP95Ms: 670,
						status: 'pass'
					}
				]
			}
		});
		expect(report.summary.profiles?.[0]?.providers?.[0]).toMatchObject({
			id: 'tts:openai',
			status: 'pass'
		});
	});

	test('buildVoiceRealCallProfileEvidenceFromTraceEvents converts stored traces into profile evidence', () => {
		const evidence = buildVoiceRealCallProfileEvidenceFromTraceEvents(
			[
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 0),
					metadata: { profileId: 'support-agent' },
					payload: {
						elapsedMs: 620,
						kind: 'llm',
						provider: 'openai',
						providerStatus: 'success'
					},
					sessionId: 'real-session-1',
					type: 'session.error'
				}),
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 1),
					payload: {
						elapsedMs: 84,
						kind: 'stt',
						selectedProvider: 'deepgram',
						status: 'success'
					},
					sessionId: 'real-session-1',
					type: 'provider.decision'
				}),
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 2),
					payload: {
						latencyMs: 510,
						status: 'assistant_audio_started'
					},
					sessionId: 'real-session-1',
					type: 'client.live_latency'
				}),
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 3),
					payload: {
						firstAudioLatencyMs: 410,
						jitterMs: 12,
						timestampDriftMs: 300
					},
					sessionId: 'real-session-1',
					type: 'client.browser_media'
				}),
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 4),
					payload: { stage: 'committed' },
					sessionId: 'real-session-1',
					turnId: 'turn-1',
					type: 'turn_latency.stage'
				}),
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 12, 0, 4) + 670,
					payload: { stage: 'assistant_audio_started' },
					sessionId: 'real-session-1',
					turnId: 'turn-1',
					type: 'turn_latency.stage'
				})
			],
			{
				profileLabels: {
					'support-agent': 'Support agent'
				}
			}
		);

		expect(evidence).toHaveLength(1);
		expect(evidence[0]).toMatchObject({
			liveP95Ms: 510,
			ok: true,
			operationsRecordHref: '/voice-operations/real-session-1',
			profileId: 'support-agent',
			profileLabel: 'Support agent',
			providerP95Ms: 620,
			runtimeChannel: {
				maxFirstAudioLatencyMs: 410,
				maxJitterMs: 12,
				maxTimestampDriftMs: 300,
				samples: 1,
				status: 'pass'
			},
			sessionId: 'real-session-1',
			surfaces: ['browser', 'live'],
			turnP95Ms: 670
		});
		expect(evidence[0]?.providers?.map((provider) => provider.id)).toEqual([
			'llm:openai',
			'stt:deepgram'
		]);
	});

	test('loadVoiceRealCallProfileEvidenceFromTraceStore loads repeated call evidence from a trace store', async () => {
		const store = createVoiceMemoryTraceEventStore();
		await store.append(
			createVoiceTraceEvent({
				at: Date.UTC(2026, 3, 29, 13, 0, 0),
				payload: {
					elapsedMs: 480,
					kind: 'tts',
					profileId: 'meeting-recorder',
					provider: 'openai',
					status: 'success'
				},
				sessionId: 'stored-real-session',
				type: 'session.error'
			})
		);
		await store.append(
			createVoiceTraceEvent({
				at: Date.UTC(2026, 3, 29, 13, 0, 1),
				payload: { latencyMs: 530 },
				sessionId: 'stored-real-session',
				type: 'client.live_latency'
			})
		);

		const evidence = await loadVoiceRealCallProfileEvidenceFromTraceStore({
			store
		});
		const history = buildVoiceRealCallProfileHistoryReport({
			evidence,
			generatedAt: '2026-04-29T13:01:00.000Z',
			now: '2026-04-29T13:01:30.000Z',
			source: 'trace-store'
		});

		expect(evidence).toHaveLength(1);
		expect(history.ok).toBe(true);
		expect(
			history.summary.profiles?.some((profile) => profile.id === 'meeting-recorder')
		).toBe(true);
		expect(history.defaults.profiles[0]).toMatchObject({
			profileId: 'meeting-recorder',
			providerRoutes: {
				tts: 'tts:openai'
			},
			status: 'warn'
		});
	});

	test('createVoiceRealCallProfileTraceCollector turns appended real traffic into profile history', async () => {
		const collector = createVoiceRealCallProfileTraceCollector({
			defaultProfileId: 'support-agent',
			defaultProfileLabel: 'Support agent',
			store: createVoiceMemoryTraceEventStore()
		});

		await collector.append({
			at: Date.UTC(2026, 3, 29, 14, 0, 0),
			payload: {
				elapsedMs: 360,
				kind: 'llm',
				provider: 'openai',
				status: 'success'
			},
			sessionId: 'auto-real-session',
			type: 'provider.decision'
		});
		await collector.append({
			at: Date.UTC(2026, 3, 29, 14, 0, 1),
			payload: {
				firstAudioLatencyMs: 390,
				jitterMs: 9,
				status: 'pass'
			},
			sessionId: 'auto-real-session',
			type: 'client.browser_media'
		});

		const evidence = await collector.listEvidence();
		const history = await collector.buildHistoryReport({
			generatedAt: '2026-04-29T14:01:00.000Z',
			now: '2026-04-29T14:01:15.000Z',
			source: 'real-call-trace-collector'
		});

		expect(collector.listCapturedSessionIds()).toEqual(['auto-real-session']);
		expect(evidence).toHaveLength(1);
		expect(evidence[0]).toMatchObject({
			ok: true,
			profileId: 'support-agent',
			profileLabel: 'Support agent',
			providerP95Ms: 360,
			runtimeChannel: {
				maxFirstAudioLatencyMs: 390,
				maxJitterMs: 9,
				samples: 1,
				status: 'pass'
			},
			sessionId: 'auto-real-session',
			surfaces: ['browser']
		});
		expect(
			history.summary.profiles?.find((profile) => profile.id === 'support-agent')
		).toMatchObject({
			cycles: 1,
			id: 'support-agent',
			label: 'Support agent',
			maxProviderP95Ms: 360,
			sessionCount: 1,
			surfaces: ['browser'],
			status: 'pass'
		});
		expect(history.defaults.profiles[0]?.providerRoutes).toMatchObject({
			llm: 'llm:openai'
		});
	});

	test('createVoiceRealCallProfileTraceCollector ignores unprofiled traffic until a profile is present', async () => {
		const collector = createVoiceRealCallProfileTraceCollector({
			store: createVoiceMemoryTraceEventStore()
		});

		await collector.append({
			at: Date.UTC(2026, 3, 29, 15, 0, 0),
			payload: {
				elapsedMs: 420,
				kind: 'stt',
				provider: 'deepgram',
				status: 'success'
			},
			sessionId: 'unprofiled-session',
			type: 'provider.decision'
		});
		await collector.append({
			at: Date.UTC(2026, 3, 29, 15, 1, 0),
			metadata: { profileId: 'meeting-recorder' },
			payload: {
				elapsedMs: 280,
				kind: 'stt',
				provider: 'deepgram',
				status: 'success'
			},
			sessionId: 'profiled-session',
			type: 'provider.decision'
		});

		const evidence = await collector.listEvidence();

		expect(collector.listCapturedSessionIds()).toEqual(['profiled-session']);
		expect(evidence.map((item) => item.sessionId)).toEqual(['profiled-session']);
		expect(evidence[0]).toMatchObject({
			profileId: 'meeting-recorder',
			providerP95Ms: 280
		});
	});

	test('buildVoiceRealCallProfileReadinessCheck gates required real-call profile evidence', async () => {
		const store = createVoiceMemoryTraceEventStore();
		for (const [sessionId, profileId, role, provider] of [
			['meeting-session', 'meeting-recorder', 'llm', 'openai'],
			['meeting-session', 'meeting-recorder', 'stt', 'deepgram'],
			['meeting-session', 'meeting-recorder', 'tts', 'openai'],
			['support-session', 'support-agent', 'llm', 'anthropic'],
			['support-session', 'support-agent', 'stt', 'deepgram'],
			['support-session', 'support-agent', 'tts', 'openai']
		] as const) {
			await store.append(
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 13, 0, 0),
					metadata: { profileId },
					payload: {
						elapsedMs: role === 'llm' ? 480 : 90,
						kind: role,
						provider,
						status: 'success'
					},
					sessionId,
					type: 'session.error'
				})
			);
			await store.append(
				createVoiceTraceEvent({
					at: Date.UTC(2026, 3, 29, 13, 0, 1),
					payload: { latencyMs: 530 },
					sessionId,
					type: 'client.live_latency'
				})
			);
		}

		const history = buildVoiceRealCallProfileHistoryReport({
			evidence: await loadVoiceRealCallProfileEvidenceFromTraceStore({
				store
			}),
			generatedAt: '2026-04-29T13:01:00.000Z',
			now: '2026-04-29T13:01:30.000Z',
			requiredProviderRoles: ['llm'],
			source: 'trace-store'
		});

		expect(
			buildVoiceRealCallProfileReadinessCheck(history, {
				minActionableProfiles: 2,
				minCycles: 2,
				minProfileCycles: 1,
				minProfileSessions: 1,
				requiredProfileIds: ['meeting-recorder', 'support-agent'],
				requiredProfileSurfaces: ['live'],
				requiredProviderRoles: ['llm', 'stt', 'tts']
			})
		).toMatchObject({
			label: 'Real-call profile history',
			status: 'pass',
			value: '4/4 actionable'
		});
		expect(
			buildVoiceRealCallProfileReadinessCheck(history, {
				failOnWarnings: true,
				minProfileCycles: 3,
				requiredProfileIds: ['meeting-recorder'],
				requiredProfileSurfaces: ['browser']
			})
		).toMatchObject({
			status: 'fail'
		});
		expect(
			buildVoiceRealCallProfileRecoveryActions(history, {
				minActionableProfiles: 5,
				minProfileCycles: 3,
				requiredProfileIds: ['custom-profile'],
				requiredProfileSurfaces: ['browser'],
				requiredProviderRoles: ['llm', 'stt', 'tts']
			}).map((action) => action.label)
		).toEqual([
			'Open real-call profile history',
			'Refresh production readiness',
			'Run browser profile proof for custom-profile',
			'Run phone profile proof for custom-profile',
			'Collect missing provider-role evidence'
		]);
		expect(
			buildVoiceRealCallProfileRecoveryActions(history, {
				minProfileCycles: 3,
				requiredProfileIds: ['custom-profile'],
				requiredProfileSurfaces: ['browser']
			}).find((action) => action.id === 'collect-browser-proof')
		).toMatchObject({
			href: '/voice/browser-call-profiles?profileId=custom-profile',
			method: 'POST',
			profileId: 'custom-profile'
		});
	});

	test('buildVoiceRealCallProfileHistoryReport keeps fresh profile depth when evidence is not passing', () => {
		const historical = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 1,
				profiles: [
					{
						cycles: 0,
						id: 'support-agent',
						label: 'Support agent',
						providers: [
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 400,
								role: 'llm',
								samples: 1,
								status: 'pass'
							}
						],
						sessionCount: 0,
						status: 'pass',
						surfaces: []
					}
				]
			}
		});
		const history = buildVoiceRealCallProfileHistoryReport({
			evidence: [
				{
					generatedAt: '2026-04-29T12:01:00.000Z',
					ok: false,
					profileId: 'support-agent',
					profileLabel: 'Support agent',
					providers: [
						{
							id: 'llm:openai',
							label: 'LLM openai',
							p95Ms: 400,
							role: 'llm',
							samples: 1,
							status: 'pass'
						}
					],
					sessionId: 'fresh-support-session',
					surfaces: ['browser', 'live']
				}
			],
			generatedAt: '2026-04-29T12:01:30.000Z',
			now: '2026-04-29T12:02:00.000Z',
			reports: [historical],
			source: 'real-call-profile-history'
		});
		const supportProfile = history.summary.profiles?.find(
			(profile) => profile.id === 'support-agent'
		);
		const readiness = buildVoiceRealCallProfileReadinessCheck(history, {
			minProfileCycles: 1,
			minProfileSessions: 1,
			requiredProfileIds: ['support-agent'],
			requiredProfileSurfaces: ['browser', 'live']
		});

		expect(supportProfile).toMatchObject({
			cycles: 1,
			sessionCount: 1,
			surfaces: ['browser', 'live']
		});
		expect(readiness.detail).not.toContain('has 0 cycle');
		expect(readiness.detail).not.toContain('missing browser surface evidence');
	});

	test('buildVoiceProofTrendRecommendationReport recommends provider switches from sustained comparisons', () => {
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			summary: {
				cycles: 6,
				maxLiveP95Ms: 531,
				providers: [
					{
						id: 'current-stt',
						label: 'Current STT',
						p95Ms: 980,
						role: 'stt',
						samples: 30,
						status: 'pass'
					},
					{
						id: 'faster-stt',
						label: 'Faster STT',
						p95Ms: 650,
						role: 'stt',
						samples: 30,
						status: 'pass'
					}
				],
				runtimeChannel: {
					maxBackpressureEvents: 0,
					maxFirstAudioLatencyMs: 420,
					maxInterruptionP95Ms: 190,
					maxJitterMs: 12,
					maxTimestampDriftMs: 500,
					samples: 4,
					status: 'pass'
				},
				maxTurnP95Ms: 690
			}
		});

		const recommendations = buildVoiceProofTrendRecommendationReport(report, {
			currentProviderId: 'current-stt'
		});

		expect(recommendations.ok).toBe(true);
		expect(recommendations.status).toBe('warn');
		expect(recommendations.bestProvider?.id).toBe('faster-stt');
		expect(recommendations.summary.switchRecommended).toBe(true);
		expect(recommendations.summary.keepCurrentProviderPath).toBe(false);
		expect(recommendations.recommendations[0].recommendation).toContain(
			'Faster STT'
		);
	});

	test('createVoiceProofTrendRecommendationRoutes exposes JSON, HTML, and Markdown guidance', async () => {
		const app = createVoiceProofTrendRecommendationRoutes({
			source: {
				generatedAt: '2026-04-29T12:00:00.000Z',
				maxAgeMs: 60_000,
				now: '2026-04-29T12:00:30.000Z',
				ok: true,
				summary: {
					cycles: 6,
					maxLiveP95Ms: 531,
					maxProviderP95Ms: 700,
					profiles: [
						{
							id: 'meeting-recorder',
							label: 'Meeting recorder',
							maxLiveP95Ms: 531,
							maxProviderP95Ms: 700,
							maxTurnP95Ms: 690,
							providers: [
								{
									id: 'openai-llm',
									label: 'OpenAI LLM',
									p95Ms: 640,
									role: 'llm',
									samples: 18,
									status: 'pass'
								},
								{
									id: 'deepgram-stt',
									label: 'Deepgram STT',
									p95Ms: 210,
									role: 'stt',
									samples: 18,
									status: 'pass'
								},
								{
									id: 'openai-tts',
									label: 'OpenAI TTS',
									p95Ms: 340,
									role: 'tts',
									samples: 18,
									status: 'pass'
								}
							],
							runtimeChannel: {
								maxBackpressureEvents: 0,
								maxFirstAudioLatencyMs: 420,
								maxInterruptionP95Ms: 190,
								maxJitterMs: 12,
								maxTimestampDriftMs: 500,
								samples: 4,
								status: 'pass'
							},
							status: 'pass'
						}
					],
					providers: [
						{
							id: 'openai-realtime',
							label: 'OpenAI Realtime',
							p95Ms: 700,
							role: 'realtime',
							samples: 18,
							status: 'pass'
						}
					],
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 420,
						maxInterruptionP95Ms: 190,
						maxJitterMs: 12,
						maxTimestampDriftMs: 500,
						samples: 4,
						status: 'pass'
					},
					maxTurnP95Ms: 690
				}
			}
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/proof-trend-recommendations')
		);
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/proof-trend-recommendations')
		);
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/proof-trend-recommendations.md')
		);
		const json = await jsonResponse.json();
		const html = await htmlResponse.text();
		const markdown = await markdownResponse.text();

		expect(jsonResponse.status).toBe(200);
		expect(json.summary.keepCurrentProviderPath).toBe(true);
		expect(json.bestProvider.id).toBe('openai-realtime');
		expect(htmlResponse.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('Prefer the fastest proven provider mix');
		expect(html).toContain('Provider Comparison');
		expect(html).toContain('Benchmark Profiles');
		expect(html).toContain('Meeting recorder');
		expect(markdownResponse.headers.get('content-type')).toContain(
			'text/markdown'
		);
		expect(markdown).toContain('Voice Provider Runtime Recommendations');
		expect(markdown).toContain('OpenAI Realtime');
		expect(markdown).toContain('Benchmark Profiles');
	});

	test('buildVoiceRealCallProfileHistoryReport aggregates historical profile reports into recommendations', () => {
		const older = buildVoiceProofTrendReportFromRealCallProfiles({
			evidence: [
				{
					generatedAt: '2026-04-29T12:00:00.000Z',
					liveP95Ms: 510,
					ok: true,
					profileId: 'meeting-recorder',
					providerP95Ms: 680,
					providers: [
						{
							id: 'llm:openai',
							label: 'LLM openai',
							p95Ms: 680,
							role: 'llm',
							samples: 1,
							status: 'pass'
						}
					],
					runtimeChannel: {
						maxBackpressureEvents: 0,
						maxFirstAudioLatencyMs: 410,
						maxInterruptionP95Ms: 180,
						maxJitterMs: 12,
						maxTimestampDriftMs: 500,
						samples: 1,
						status: 'pass'
					},
					sessionId: 'real-call-1',
					turnP95Ms: 650
				}
			],
			generatedAt: '2026-04-29T12:01:00.000Z',
			now: '2026-04-29T12:01:30.000Z'
		});
		const history = buildVoiceRealCallProfileHistoryReport({
			generatedAt: '2026-04-29T12:04:00.000Z',
			now: '2026-04-29T12:04:30.000Z',
			reports: [older],
			source: '.voice-runtime/real-call-profiles'
		});

		expect(history.ok).toBe(true);
		expect(history.reports).toBe(1);
		expect(history.summary.profileCount).toBeGreaterThanOrEqual(1);
		expect(history.summary.profiles?.[0]).toMatchObject({
			id: 'meeting-recorder',
			status: 'pass'
		});
		expect(history.recommendations.profiles[0]?.label).toBe('Meeting recorder');
		expect(history.defaults.profiles[0]).toMatchObject({
			profileId: 'meeting-recorder',
			providerRoutes: {
				llm: 'llm:openai'
			},
			status: 'warn'
		});
		expect(history.defaults.profiles[0]?.latencyBudgets).toMatchObject({
			maxLiveP95Ms: 662,
			maxProviderP95Ms: 866,
			maxTurnP95Ms: 830
		});
	});

	test('buildVoiceRealCallProfileDefaults emits complete profile routing defaults from real-call history', () => {
		const report = buildVoiceProofTrendReport({
			generatedAt: '2026-04-29T12:00:00.000Z',
			maxAgeMs: 60_000,
			now: '2026-04-29T12:00:30.000Z',
			ok: true,
			source: '.voice-runtime/real-call-profiles/latest.json',
			summary: {
				cycles: 3,
				profiles: [
					{
						id: 'support-agent',
						label: 'Support agent',
						maxLiveP95Ms: 420,
						maxProviderP95Ms: 610,
						maxTurnP95Ms: 640,
						providers: [
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 610,
								role: 'llm',
								samples: 3,
								status: 'pass'
							},
							{
								id: 'stt:deepgram',
								label: 'STT deepgram',
								p95Ms: 110,
								role: 'stt',
								samples: 3,
								status: 'pass'
							},
							{
								id: 'tts:elevenlabs',
								label: 'TTS elevenlabs',
								p95Ms: 240,
								role: 'tts',
								samples: 3,
								status: 'pass'
							}
						],
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 330,
							maxInterruptionP95Ms: 140,
							maxJitterMs: 8,
							maxTimestampDriftMs: 430,
							samples: 3,
							status: 'pass'
						},
						status: 'pass'
					}
				]
			}
		});

		const defaults = buildVoiceRealCallProfileDefaults(report, {
			latencyBudgetHeadroomMs: 25,
			latencyBudgetHeadroomRatio: 1.1
		});

		expect(defaults.ok).toBe(true);
		expect(defaults.status).toBe('pass');
		expect(defaults.summary.actionableProfiles).toBe(1);
		expect(defaults.profiles[0]).toMatchObject({
			latencyBudgets: {
				maxLiveP95Ms: 488,
				maxProviderP95Ms: 696,
				maxTurnP95Ms: 729
			},
			profileId: 'support-agent',
			providerRoutes: {
				llm: 'llm:openai',
				stt: 'stt:deepgram',
				tts: 'tts:elevenlabs'
			},
			status: 'pass'
		});
		expect(defaults.profiles[0]?.runtimeChannel).toMatchObject({
			maxFirstAudioLatencyMs: 389,
			maxInterruptionP95Ms: 179,
			maxJitterMs: 34,
			maxTimestampDriftMs: 499
		});
	});

	test('resolveVoiceRealCallProfileProviderRoute maps measured routes to available providers', () => {
		const defaults = buildVoiceRealCallProfileDefaults(
			buildVoiceProofTrendReport({
				generatedAt: '2026-04-29T12:00:00.000Z',
				maxAgeMs: 60_000,
				now: '2026-04-29T12:00:30.000Z',
				ok: true,
				summary: {
					profiles: [
						{
							id: 'support-agent',
							label: 'Support agent',
							providers: [
								{
									id: 'llm:deterministic+openai',
									p95Ms: 610,
									role: 'llm',
									samples: 3,
									status: 'pass'
								},
								{
									id: 'stt:deepgram',
									p95Ms: 110,
									role: 'stt',
									samples: 3,
									status: 'pass'
								}
							],
							status: 'pass'
						}
					]
				}
			}),
			{ requiredProviderRoles: ['llm', 'stt'] }
		);

		expect(
			resolveVoiceRealCallProfileProviderRoute({
				availableProviders: ['openai', 'anthropic'],
				defaults,
				profileId: 'support-agent',
				providerAliases: {
					'llm:deterministic+openai': 'openai'
				},
				role: 'llm'
			})
		).toBe('openai');
		expect(
			resolveVoiceRealCallProfileProviderRoute({
				availableProviders: ['deepgram', 'assemblyai'],
				defaults,
				profileId: 'support-agent',
				role: 'stt'
			})
		).toBe('deepgram');
	});

	test('createVoiceRealCallProfileHistoryRoutes exposes JSON, HTML, and Markdown history', async () => {
		const app = createVoiceRealCallProfileHistoryRoutes({
			source: {
				generatedAt: '2026-04-29T12:00:00.000Z',
				now: '2026-04-29T12:00:30.000Z',
				evidence: [
					{
						generatedAt: '2026-04-29T12:00:00.000Z',
						liveP95Ms: 510,
						ok: true,
						profileId: 'support-agent',
						profileLabel: 'Support agent',
						providerP95Ms: 680,
						providers: [
							{
								id: 'openai-realtime',
								label: 'OpenAI Realtime',
								p95Ms: 680,
								role: 'realtime',
								samples: 1,
								status: 'pass'
							}
						],
						runtimeChannel: {
							maxBackpressureEvents: 0,
							maxFirstAudioLatencyMs: 410,
							maxInterruptionP95Ms: 180,
							maxJitterMs: 12,
							maxTimestampDriftMs: 500,
							samples: 1,
							status: 'pass'
						},
						sessionId: 'support-real-call',
						turnP95Ms: 650
					}
				],
				source: '.voice-runtime/real-call-profiles/latest.json'
			}
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/real-call-profile-history')
		);
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/real-call-profile-history')
		);
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/real-call-profile-history.md')
		);
		const json = await jsonResponse.json();
		const html = await htmlResponse.text();
		const markdown = await markdownResponse.text();

		expect(jsonResponse.status).toBe(200);
		expect(json.ok).toBe(true);
		expect(json.summary.profileCount).toBeGreaterThanOrEqual(1);
		expect(
			json.defaults.profiles.some(
				(profile: { profileId?: string }) => profile.profileId === 'support-agent'
			)
		).toBe(true);
		expect(html).toContain('Real-call benchmark history');
		expect(html).toContain('Actionable Defaults');
		expect(html).toContain('Support agent');
		expect(markdown).toContain('Voice Real-Call Profile History');
		expect(markdown).toContain('Actionable Defaults');
		expect(markdown).toContain('Support agent');
	});

	test('createVoiceRealCallProfileRecoveryActionRoutes exposes actions and executable handlers', async () => {
		const calls: string[] = [];
		const app = createVoiceRealCallProfileRecoveryActionRoutes({
			handlers: {
				'collect-browser-proof': ({ actionId }) => {
					calls.push(actionId);
					return {
						message: 'browser proof queued'
					};
				}
			},
			minActionableProfiles: 2,
			path: '/api/voice/real-call-profile-history',
			requiredProfileIds: ['support-agent'],
			source: {
				evidence: [
					{
						generatedAt: '2026-04-29T12:00:00.000Z',
						ok: true,
						profileId: 'support-agent',
						profileLabel: 'Support agent',
						providers: [
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 450,
								role: 'llm',
								samples: 1,
								status: 'pass'
							}
						],
						sessionId: 'support-real-call'
					}
				],
				source: '.voice-runtime/real-call-profiles/latest.json'
			}
		});

		const actionsResponse = await app.handle(
			new Request('http://localhost/api/voice/real-call-profile-history/actions')
		);
		const actions = await actionsResponse.json();
		const browserResponse = await app.handle(
			new Request(
				'http://localhost/api/voice/real-call-profile-history/collect-browser-proof',
				{ method: 'POST' }
			)
		);
		const browser = await browserResponse.json();
		const phoneResponse = await app.handle(
			new Request(
				'http://localhost/api/voice/real-call-profile-history/collect-phone-proof',
				{ method: 'POST' }
			)
		);
		const phone = await phoneResponse.json();

		expect(actionsResponse.status).toBe(200);
		expect(actions.actions.map((action: { href: string; method?: string }) => action.href)).toContain(
			'/api/voice/real-call-profile-history/collect-browser-proof?profileId=support-agent'
		);
		expect(browserResponse.status).toBe(200);
		expect(browser).toMatchObject({
			actionId: 'collect-browser-proof',
			message: 'browser proof queued',
			ok: true,
			status: 'pass'
		});
		expect(phoneResponse.status).toBe(501);
		expect(phone).toMatchObject({
			actionId: 'collect-phone-proof',
			ok: false,
			status: 'fail'
		});
		expect(calls).toEqual(['collect-browser-proof']);
	});

	test('createVoiceRealCallProfileRecoveryActionRoutes can queue and poll recovery jobs', async () => {
		const jobStore = createVoiceInMemoryRealCallProfileRecoveryJobStore({
			idPrefix: 'test-recovery-job'
		});
		const app = createVoiceRealCallProfileRecoveryActionRoutes({
			asyncActionIds: ['collect-browser-proof'],
			handlers: {
				'collect-browser-proof': async () => ({
					message: 'browser proof finished'
				})
			},
			jobStore,
			minActionableProfiles: 2,
			path: '/api/voice/real-call-profile-history',
			requiredProfileIds: ['support-agent'],
			source: {
				evidence: [
					{
						generatedAt: '2026-04-29T12:00:00.000Z',
						ok: true,
						profileId: 'support-agent',
						profileLabel: 'Support agent',
						providers: [
							{
								id: 'llm:openai',
								label: 'LLM openai',
								p95Ms: 450,
								role: 'llm',
								samples: 1,
								status: 'pass'
							}
						],
						sessionId: 'support-real-call'
					}
				],
				source: '.voice-runtime/real-call-profiles/latest.json'
			}
		});

		const queuedResponse = await app.handle(
			new Request(
				'http://localhost/api/voice/real-call-profile-history/collect-browser-proof',
				{ method: 'POST' }
			)
		);
		const queued = await queuedResponse.json();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const jobResponse = await app.handle(
			new Request(
				`http://localhost/api/voice/real-call-profile-history/actions/${queued.jobId}`
			)
		);
		const job = await jobResponse.json();
		const jobsResponse = await app.handle(
			new Request('http://localhost/api/voice/real-call-profile-history/actions/jobs')
		);
		const jobs = await jobsResponse.json();
		const missingResponse = await app.handle(
			new Request(
				'http://localhost/api/voice/real-call-profile-history/actions/missing-job'
			)
		);

		expect(queuedResponse.status).toBe(200);
		expect(queued).toMatchObject({
			actionId: 'collect-browser-proof',
			jobStatus: 'queued',
			ok: true
		});
		expect(queued.jobId).toStartWith('test-recovery-job-');
		expect(jobResponse.status).toBe(200);
		expect(job.job).toMatchObject({
			actionId: 'collect-browser-proof',
			id: queued.jobId,
			message: 'browser proof finished',
			ok: true,
			status: 'pass'
		});
		expect(jobsResponse.status).toBe(200);
		expect(jobs.jobs).toHaveLength(1);
		expect(jobs.jobs[0]).toMatchObject({
			id: queued.jobId,
			status: 'pass'
		});
		expect(missingResponse.status).toBe(404);
	});

	test('runVoiceRealCallProfileRecoveryLoop runs real-call recovery actions in parallel', async () => {
		const calls: string[] = [];
		let activeStarts = 0;
		let maxActiveStarts = 0;
		const wait = (ms: number) =>
			new Promise((resolve) => setTimeout(resolve, ms));
		const fakeFetch: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
			if (url.pathname === '/api/production-readiness/recovery-actions') {
				return Response.json({
					actions: [
						{
							href: '/recover/browser?profileId=meeting-recorder',
							label: 'Browser meeting',
							method: 'POST',
							profileId: 'meeting-recorder',
							sourceCheckLabel: 'Real-call profile history'
						},
						{
							href: '/recover/browser?profileId=meeting-recorder',
							label: 'Duplicate browser meeting',
							method: 'POST',
							profileId: 'meeting-recorder',
							sourceCheckLabel: 'Real-call profile history'
						},
						{
							href: '/recover/browser?profileId=support-agent',
							label: 'Browser support',
							method: 'POST',
							profileId: 'support-agent',
							sourceCheckLabel: 'Real-call profile history'
						},
						{
							href: '/recover/open',
							label: 'Open report',
							method: 'GET',
							sourceCheckLabel: 'Real-call profile history'
						}
					]
				});
			}
			if (url.pathname === '/recover/browser') {
				activeStarts += 1;
				maxActiveStarts = Math.max(maxActiveStarts, activeStarts);
				await wait(5);
				activeStarts -= 1;
				return Response.json({
					jobId: `job-${url.searchParams.get('profileId')}`
				});
			}
			if (
				url.pathname ===
				'/api/voice/real-call-profile-history/actions/job-meeting-recorder'
			) {
				return Response.json({
					job: { id: 'job-meeting-recorder', status: 'pass' }
				});
			}
			if (
				url.pathname ===
				'/api/voice/real-call-profile-history/actions/job-support-agent'
			) {
				return Response.json({
					job: { id: 'job-support-agent', status: 'pass' }
				});
			}
			if (url.pathname === '/api/voice/real-call-profile-history/refresh') {
				return Response.json({ ok: true });
			}
			if (url.pathname === '/api/production-readiness') {
				return Response.json({
					checks: [
						{
							detail: '2 profile(s), 2 cycle(s), 2 actionable default(s).',
							label: 'Real-call profile history',
							status: 'pass',
							value: '2/2 actionable'
						}
					]
				});
			}
			return new Response('missing', { status: 404 });
		};

		const report = await runVoiceRealCallProfileRecoveryLoop({
			baseUrl: 'http://localhost',
			fetch: fakeFetch,
			jobPollMs: 1
		});

		expect(report.ok).toBe(true);
		expect(report.actionCount).toBe(2);
		expect(report.startFailures).toEqual([]);
		expect(report.jobs.map((job) => job.result.status)).toEqual(['pass', 'pass']);
		expect(report.realCallProfileGate).toMatchObject({
			label: 'Real-call profile history',
			status: 'pass'
		});
		expect(maxActiveStarts).toBe(2);
		expect(
			calls.filter((call) => call.startsWith('POST /recover/browser'))
		).toHaveLength(2);
	});

	test('buildVoiceRealCallProfileRecoveryJobHistoryCheck gates persisted recovery job history', async () => {
		const store = createVoiceInMemoryRealCallProfileRecoveryJobStore({
			idPrefix: 'readiness-recovery-job'
		});
		const passingJob = await store.create({
			actionId: 'collect-phone-proof',
			createdAt: '2026-04-30T12:00:00.000Z',
			message: 'phone proof queued',
			status: 'queued'
		});
		await store.update(passingJob.id, {
			completedAt: '2026-04-30T12:01:00.000Z',
			message: 'phone proof passed',
			ok: true,
			status: 'pass',
			updatedAt: '2026-04-30T12:01:00.000Z'
		});
		const runningJob = await store.create({
			actionId: 'collect-browser-proof',
			createdAt: '2026-04-30T12:02:00.000Z',
			message: 'browser proof queued',
			status: 'queued'
		});
		await store.update(runningJob.id, {
			message: 'browser proof running',
			status: 'running',
			updatedAt: '2026-04-30T12:02:30.000Z'
		});

		await expect(
			buildVoiceRealCallProfileRecoveryJobHistoryCheck(undefined)
		).resolves.toMatchObject({
			status: 'fail',
			value: 'missing'
		});
		await expect(
			buildVoiceRealCallProfileRecoveryJobHistoryCheck(store, {
				minCompletedJobs: 1
			})
		).resolves.toMatchObject({
			label: 'Real-call recovery job history',
			status: 'warn',
			value: '1 completed / 0 failed / 1 running'
		});
		await expect(
			buildVoiceRealCallProfileRecoveryJobHistoryCheck(store, {
				failOnRunningJobs: true,
				minCompletedJobs: 1
			})
		).resolves.toMatchObject({
			status: 'fail'
		});
	});

	test('createVoiceSQLiteRealCallProfileRecoveryJobStore persists recovery jobs across instances', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'voice-recovery-jobs-'));
		const path = join(directory, 'jobs.sqlite');
		const firstStore = createVoiceSQLiteRealCallProfileRecoveryJobStore({
			idPrefix: 'sqlite-recovery-job',
			path
		});
		const queued = await firstStore.create({
			actionId: 'collect-phone-proof',
			message: 'queued phone proof',
			status: 'queued'
		});
		const running = await firstStore.update(queued.id, {
			message: 'running phone proof',
			status: 'running'
		});

		const secondStore = createVoiceSQLiteRealCallProfileRecoveryJobStore({
			path
		});
		const persisted = await secondStore.get(queued.id);
		const completed = await secondStore.update(queued.id, {
			completedAt: '2026-04-30T12:00:00.000Z',
			message: 'phone proof passed',
			ok: true,
			status: 'pass',
			updatedAt: '2026-04-30T12:00:00.000Z'
		});
		const thirdStore = createVoiceSQLiteRealCallProfileRecoveryJobStore({
			path
		});
		const other = await thirdStore.create({
			actionId: 'collect-browser-proof',
			message: 'queued browser proof',
			status: 'queued'
		});
		const listed = await thirdStore.list?.({ limit: 10 });
		const listedPhone = await thirdStore.list?.({
			actionId: 'collect-phone-proof',
			status: 'pass'
		});

		expect(queued.id).toStartWith('sqlite-recovery-job-');
		expect(running).toMatchObject({
			actionId: 'collect-phone-proof',
			message: 'running phone proof',
			status: 'running'
		});
		expect(persisted).toMatchObject({
			id: queued.id,
			message: 'running phone proof',
			status: 'running'
		});
		expect(completed).toMatchObject({
			completedAt: '2026-04-30T12:00:00.000Z',
			message: 'phone proof passed',
			ok: true,
			status: 'pass'
		});
		expect(await thirdStore.get(queued.id)).toMatchObject({
			id: queued.id,
			message: 'phone proof passed',
			status: 'pass'
		});
		expect(other.status).toBe('queued');
		expect(listed?.map((job) => job.id)).toContain(queued.id);
		expect(listed?.map((job) => job.id)).toContain(other.id);
		expect(listedPhone).toHaveLength(1);
		expect(listedPhone?.[0]).toMatchObject({
			actionId: 'collect-phone-proof',
			id: queued.id,
			status: 'pass'
		});
	});
});
