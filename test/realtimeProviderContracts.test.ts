import { describe, expect, test } from 'bun:test';
import {
	buildVoiceRealtimeChannelReport,
	buildVoiceRealtimeProviderContractMatrix,
	createVoiceRealtimeProviderContractRoutes,
	evaluateVoiceRealtimeProviderContractEvidence
} from '../src';

const realtimeFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 24_000
} as const;

const realtimeChannel = buildVoiceRealtimeChannelReport({
	browserCapture: {
		audioContextSampleRateHz: 48_000,
		channelCount: 1,
		sampleRateHz: 24_000
	},
	inputFormat: realtimeFormat,
	maxFirstAudioLatencyMs: 800,
	outputFormat: realtimeFormat,
	provider: 'openai-realtime',
	runtimeSamples: [
		{ format: realtimeFormat, kind: 'input-audio', source: 'trace-store' },
		{
			format: realtimeFormat,
			kind: 'assistant-audio',
			latencyMs: 420,
			source: 'trace-store'
		}
	]
});

describe('realtime provider contracts', () => {
	test('buildVoiceRealtimeProviderContractMatrix passes a complete realtime provider', () => {
		const report = buildVoiceRealtimeProviderContractMatrix({
			contracts: [
				{
					capabilities: [
						'browser-format-negotiation',
						'raw-pcm',
						'duplex-audio',
						'turn-commit',
						'first-audio-latency',
						'trace-evidence',
						'reconnect',
						'barge-in'
					],
					env: { OPENAI_API_KEY: 'test' },
					fallbackProviders: ['cascaded-stt-llm-tts'],
					latencyBudgetMs: 800,
					provider: 'openai-realtime',
					readinessHref: '/production-readiness',
					realtimeChannel,
					selected: true,
					traceHref: '/traces?sessionId=proof-realtime-channel'
				}
			]
		});

		expect(report.status).toBe('pass');
		expect(report.passed).toBe(1);
		expect(
			evaluateVoiceRealtimeProviderContractEvidence(report, {
				maxFailed: 0,
				maxWarned: 0,
				requiredProviders: ['openai-realtime'],
				requiredCheckKeys: [
					'configured',
					'env',
					'capabilities',
					'realtimeChannel',
					'traceEvidence',
					'readiness'
				]
			}).ok
		).toBe(true);
	});

	test('buildVoiceRealtimeProviderContractMatrix reports missing contract pieces', () => {
		const report = buildVoiceRealtimeProviderContractMatrix({
			contracts: [
				{
					configured: false,
					provider: 'openai-realtime'
				}
			]
		});

		expect(report.status).toBe('fail');
		expect(report.failed).toBe(1);
		const assertion = evaluateVoiceRealtimeProviderContractEvidence(report, {
			maxFailed: 0,
			maxWarned: 0
		});
		expect(assertion.ok).toBe(false);
		expect(assertion.issues).toContain(
			'Expected realtime provider contract status at most pass, found fail.'
		);
	});

	test('createVoiceRealtimeProviderContractRoutes exposes JSON and HTML', async () => {
		const app = createVoiceRealtimeProviderContractRoutes({
			matrix: {
				contracts: [
					{
						capabilities: [
							'browser-format-negotiation',
							'raw-pcm',
							'duplex-audio',
							'turn-commit',
							'first-audio-latency',
							'trace-evidence',
							'reconnect',
							'barge-in'
						],
						env: { OPENAI_API_KEY: 'test' },
						fallbackProviders: ['cascaded-stt-llm-tts'],
						latencyBudgetMs: 800,
						provider: 'openai-realtime',
						readinessHref: '/production-readiness',
						realtimeChannel,
						selected: true,
						traceHref: '/traces?sessionId=proof-realtime-channel'
					}
				]
			},
			title: 'Realtime Contracts'
		});
		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/realtime-provider-contracts')
		);
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/realtime-provider-contracts')
		);
		const json = (await jsonResponse.json()) as ReturnType<
			typeof buildVoiceRealtimeProviderContractMatrix
		>;

		expect(json.status).toBe('pass');
		expect(await htmlResponse.text()).toContain('Realtime Contracts');
	});
});
