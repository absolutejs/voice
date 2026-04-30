import { describe, expect, test } from 'bun:test';
import {
	assertVoiceRealtimeChannelEvidence,
	buildVoiceRealtimeChannelRuntimeSamplesFromTrace,
	buildVoiceRealtimeChannelReport,
	createVoiceRealtimeChannelRoutes,
	evaluateVoiceRealtimeChannelEvidence,
	renderVoiceRealtimeChannelMarkdown
} from '../src';

const realtimeFormat = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 24_000
} as const;

describe('realtime channel proof', () => {
	test('buildVoiceRealtimeChannelReport passes with aligned browser and runtime proof', () => {
		const report = buildVoiceRealtimeChannelReport({
			browserCapture: {
				audioContextSampleRateHz: 48_000,
				channelCount: 1,
				processorBufferSize: 4096,
				sampleRateHz: 24_000
			},
			inputFormat: realtimeFormat,
			maxFirstAudioLatencyMs: 800,
			operationsRecordHref: '/voice-operations/session-1',
			outputFormat: realtimeFormat,
			provider: 'openai-realtime',
			readinessHref: '/production-readiness',
			runtimeSamples: [
				{
					format: realtimeFormat,
					kind: 'input-audio',
					ok: true,
					source: 'browser'
				},
				{
					format: realtimeFormat,
					kind: 'assistant-audio',
					latencyMs: 420,
					ok: true,
					source: 'openai'
				}
			]
		});

		expect(report.status).toBe('pass');
		expect(report.browserCapture?.resamplingRequired).toBe(true);
		expect(report.runtime.inputAudioSamples).toBe(1);
		expect(report.runtime.assistantAudioSamples).toBe(1);
		expect(report.runtime.firstAudioLatencyMs).toBe(420);
		expect(
			assertVoiceRealtimeChannelEvidence(report, {
				maxFirstAudioLatencyMs: 800,
				minAssistantAudioSamples: 1,
				minInputAudioSamples: 1,
				requireBrowserCapture: true,
				requireOperationsRecordHref: true,
				requirePass: true,
				requireReadinessHref: true
			}).ok
		).toBe(true);
	});

	test('buildVoiceRealtimeChannelReport warns when runtime samples are missing', () => {
		const report = buildVoiceRealtimeChannelReport({
			browserCapture: {
				audioContextSampleRateHz: 24_000,
				channelCount: 1,
				sampleRateHz: 24_000
			},
			provider: 'openai-realtime'
		});

		expect(report.status).toBe('warn');
		expect(report.issues.map((issue) => issue.code)).toEqual([
			'runtime-input-audio-missing',
			'runtime-assistant-audio-missing'
		]);
		const assertion = evaluateVoiceRealtimeChannelEvidence(report, {
			minAssistantAudioSamples: 1,
			minInputAudioSamples: 1,
			requirePass: true
		});
		expect(assertion.ok).toBe(false);
		expect(assertion.issues).toContain(
			'Expected realtime channel proof to pass, found warn.'
		);
	});

	test('buildVoiceRealtimeChannelReport fails format mismatches', () => {
		const report = buildVoiceRealtimeChannelReport({
			browserCapture: {
				channelCount: 2,
				sampleRateHz: 16_000
			},
			inputFormat: {
				channels: 2,
				container: 'raw',
				encoding: 'pcm_s16le',
				sampleRateHz: 16_000
			},
			provider: 'openai-realtime',
			runtimeSamples: [
				{
					format: {
						channels: 1,
						container: 'raw',
						encoding: 'pcm_s16le',
						sampleRateHz: 16_000
					},
					kind: 'input-audio',
					ok: true
				}
			]
		});

		expect(report.status).toBe('fail');
		expect(report.issues.map((issue) => issue.code)).toContain(
			'input-format-mismatch'
		);
		expect(report.issues.map((issue) => issue.code)).toContain('input-not-mono');
		expect(() =>
			assertVoiceRealtimeChannelEvidence(report, { requirePass: true })
		).toThrow('Voice realtime channel assertion failed');
	});

	test('renderVoiceRealtimeChannelMarkdown includes proof summary', () => {
		const report = buildVoiceRealtimeChannelReport({
			browserCapture: {
				channelCount: 1,
				sampleRateHz: 24_000
			},
			provider: 'openai-realtime',
			runtimeSamples: [
				{ format: realtimeFormat, kind: 'input-audio' },
				{ format: realtimeFormat, kind: 'assistant-audio', latencyMs: 250 }
			]
		});
		const markdown = renderVoiceRealtimeChannelMarkdown(report);

		expect(markdown).toContain('# Voice Realtime Channel Proof');
		expect(markdown).toContain('Provider: openai-realtime');
		expect(markdown).toContain('Status: pass');
	});

	test('createVoiceRealtimeChannelRoutes exposes JSON, HTML, and Markdown', async () => {
		const app = createVoiceRealtimeChannelRoutes({
			browserCapture: {
				channelCount: 1,
				sampleRateHz: 24_000
			},
			path: '/api/realtime-proof',
			provider: 'openai-realtime',
			runtimeSamples: [
				{ format: realtimeFormat, kind: 'input-audio' },
				{ format: realtimeFormat, kind: 'assistant-audio', latencyMs: 300 }
			],
			title: 'Realtime Proof'
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/realtime-proof')
		);
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/realtime-channel')
		);
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/realtime-channel.md')
		);
		const body = (await jsonResponse.json()) as ReturnType<
			typeof buildVoiceRealtimeChannelReport
		>;

		expect(body.status).toBe('pass');
		expect(await htmlResponse.text()).toContain('Realtime Proof');
		expect(await markdownResponse.text()).toContain(
			'Voice Realtime Channel Proof'
		);
	});

	test('buildVoiceRealtimeChannelRuntimeSamplesFromTrace converts persisted realtime traces', () => {
		const samples = buildVoiceRealtimeChannelRuntimeSamplesFromTrace([
			{
				at: 100,
				id: 'commit-stage',
				payload: { stage: 'turn_committed' },
				sessionId: 'session-1',
				turnId: 'turn-1',
				type: 'turn_latency.stage'
			},
			{
				at: 440,
				id: 'audio-stage',
				payload: { stage: 'assistant_audio_received' },
				sessionId: 'session-1',
				turnId: 'turn-1',
				type: 'turn_latency.stage'
			},
			{
				at: 100,
				id: 'committed',
				payload: { text: 'hello' },
				sessionId: 'session-1',
				turnId: 'turn-1',
				type: 'turn.committed'
			},
			{
				at: 120,
				id: 'assistant',
				payload: { mode: 'realtime', status: 'sent' },
				sessionId: 'session-1',
				turnId: 'turn-1',
				type: 'turn.assistant'
			}
		]);

		expect(samples.map((sample) => sample.kind)).toEqual([
			'input-audio',
			'turn-commit',
			'assistant-audio'
		]);
		expect(samples.at(-1)?.latencyMs).toBe(340);
		expect(samples.at(-1)?.source).toBe('trace-store');
	});

	test('createVoiceRealtimeChannelRoutes can build reports from a source function', async () => {
		const app = createVoiceRealtimeChannelRoutes({
			path: '/api/realtime-source',
			provider: 'placeholder',
			source: () => ({
				browserCapture: {
					channelCount: 1,
					sampleRateHz: 24_000
				},
				provider: 'openai-realtime',
				runtimeSamples: [
					{ format: realtimeFormat, kind: 'input-audio' },
					{ format: realtimeFormat, kind: 'assistant-audio', latencyMs: 320 }
				]
			})
		});
		const response = await app.handle(
			new Request('http://localhost/api/realtime-source')
		);
		const body = (await response.json()) as ReturnType<
			typeof buildVoiceRealtimeChannelReport
		>;

		expect(body.provider).toBe('openai-realtime');
		expect(body.status).toBe('pass');
	});
});
