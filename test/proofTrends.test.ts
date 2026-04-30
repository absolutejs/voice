import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
	buildVoiceRealCallProfileRecoveryActions,
	createVoiceProofTrendRecommendationRoutes,
	createVoiceProofTrendRoutes,
	createVoiceRealCallProfileHistoryRoutes,
	createVoiceRealCallProfileRecoveryActionRoutes,
	evaluateVoiceProofTrendEvidence,
	formatVoiceProofTrendAge,
	loadVoiceRealCallProfileEvidenceFromTraceStore,
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
				requiredProfileIds: ['meeting-recorder', 'support-agent'],
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
				requiredProfileIds: ['custom-profile']
			})
		).toMatchObject({
			status: 'fail'
		});
		expect(
			buildVoiceRealCallProfileRecoveryActions(history, {
				minActionableProfiles: 5,
				requiredProfileIds: ['custom-profile'],
				requiredProviderRoles: ['llm', 'stt', 'tts']
			}).map((action) => action.label)
		).toEqual([
			'Open real-call profile history',
			'Refresh production readiness',
			'Run browser profile proof',
			'Run phone profile proof',
			'Collect missing provider-role evidence'
		]);
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
			'/api/voice/real-call-profile-history/collect-browser-proof'
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
});
