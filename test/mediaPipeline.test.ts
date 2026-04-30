import { describe, expect, test } from 'bun:test';
import {
	buildVoiceMediaInterruptionReport,
	buildVoiceMediaPipelineCalibrationReport,
	buildVoiceMediaResamplingPlan,
	buildVoiceMediaVadReport,
	createVoiceMediaFrame,
	createVoiceMediaFrameTransformPipeline
} from '../src';

const raw24k = {
	channels: 1,
	container: 'raw',
	encoding: 'pcm_s16le',
	sampleRateHz: 24_000
} as const;

const browser48k = {
	...raw24k,
	sampleRateHz: 48_000
} as const;

describe('media pipeline calibration', () => {
	test('passes calibrated media frames with trace evidence', () => {
		const report = buildVoiceMediaPipelineCalibrationReport({
			expectedInputFormat: raw24k,
			expectedOutputFormat: raw24k,
			frames: [
				createVoiceMediaFrame({
					format: raw24k,
					id: 'input-1',
					kind: 'input-audio',
					source: 'browser',
					traceEventId: 'trace-input-1'
				}),
				createVoiceMediaFrame({
					format: raw24k,
					id: 'assistant-1',
					kind: 'assistant-audio',
					latencyMs: 420,
					metadata: { jitterMs: 12 },
					source: 'provider',
					traceEventId: 'trace-output-1'
				}),
				createVoiceMediaFrame({
					id: 'interrupt-1',
					kind: 'interruption',
					source: 'voice-runtime',
					traceEventId: 'trace-interrupt-1'
				}),
				createVoiceMediaFrame({
					id: 'turn-1',
					kind: 'turn-commit',
					source: 'voice-runtime',
					traceEventId: 'trace-turn-1'
				})
			],
			maxFirstAudioLatencyMs: 800,
			maxJitterMs: 40,
			requireInterruptionFrame: true,
			requireTraceEvidence: true,
			surface: 'browser-realtime'
		});

		expect(report.status).toBe('pass');
		expect(report.inputAudioFrames).toBe(1);
		expect(report.assistantAudioFrames).toBe(1);
		expect(report.interruptionFrames).toBe(1);
		expect(report.turnCommitFrames).toBe(1);
		expect(report.traceLinkedFrames).toBe(4);
		expect(report.firstAudioLatencyMs).toBe(420);
		expect(report.resamplingRequired).toBe(false);
	});

	test('fails when media format needs unhandled resampling', () => {
		const report = buildVoiceMediaPipelineCalibrationReport({
			expectedInputFormat: raw24k,
			frames: [
				createVoiceMediaFrame({
					format: browser48k,
					id: 'input-1',
					kind: 'input-audio',
					source: 'browser'
				})
			],
			requireTraceEvidence: true
		});

		expect(report.status).toBe('fail');
		expect(report.resamplingRequired).toBe(true);
		expect(report.resamplingTargetHz).toBe(24_000);
		expect(report.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'media.input_format_mismatch' }),
				expect.objectContaining({ code: 'media.assistant_audio_missing' }),
				expect.objectContaining({ code: 'media.trace_evidence_missing' })
			])
		);
	});

	test('plans media resampling without hiding format mismatches', () => {
		const plan = buildVoiceMediaResamplingPlan({
			inputFormat: browser48k,
			outputFormat: raw24k
		});

		expect(plan.required).toBe(true);
		expect(plan.ratio).toBe(0.5);
		expect(plan.status).toBe('pass');
	});

	test('runs frame transform pipelines in order', async () => {
		const pipeline = createVoiceMediaFrameTransformPipeline({
			transforms: [
				{
					name: 'tag-input',
					transform: (frame) => ({
						...frame,
						metadata: { ...frame.metadata, tagged: true }
					})
				},
				{
					name: 'drop-metadata',
					transform: (frame) =>
						frame.kind === 'metadata' ? undefined : frame
				}
			]
		});

		const output = await pipeline.pushMany([
			createVoiceMediaFrame({
				format: raw24k,
				id: 'input-1',
				kind: 'input-audio',
				source: 'browser'
			}),
			createVoiceMediaFrame({
				id: 'metadata-1',
				kind: 'metadata',
				source: 'voice-runtime'
			})
		]);

		expect(output).toHaveLength(1);
		expect(output[0]?.metadata?.tagged).toBe(true);
	});

	test('derives VAD speech segments from input frames', () => {
		const report = buildVoiceMediaVadReport({
			frames: [
				createVoiceMediaFrame({
					at: 0,
					durationMs: 20,
					format: raw24k,
					id: 'silence-1',
					kind: 'input-audio',
					metadata: { speechProbability: 0.1 },
					source: 'browser'
				}),
				createVoiceMediaFrame({
					at: 20,
					durationMs: 20,
					format: raw24k,
					id: 'speech-1',
					kind: 'input-audio',
					metadata: { speechProbability: 0.8 },
					source: 'browser',
					turnId: 'turn-1'
				}),
				createVoiceMediaFrame({
					at: 40,
					durationMs: 20,
					format: raw24k,
					id: 'speech-2',
					kind: 'input-audio',
					metadata: { speechProbability: 0.7 },
					source: 'browser',
					turnId: 'turn-1'
				}),
				createVoiceMediaFrame({
					at: 60,
					durationMs: 20,
					format: raw24k,
					id: 'silence-2',
					kind: 'input-audio',
					metadata: { speechProbability: 0.1 },
					source: 'browser',
					turnId: 'turn-1'
				})
			],
			maxSilenceFrames: 0,
			minSpeechFrames: 2
		});

		expect(report.status).toBe('pass');
		expect(report.segments).toEqual([
			expect.objectContaining({
				durationMs: 60,
				frameCount: 3,
				startAt: 20,
				turnId: 'turn-1'
			})
		]);
	});

	test('reports interruption latency failures', () => {
		const report = buildVoiceMediaInterruptionReport({
			frames: [
				createVoiceMediaFrame({
					id: 'interrupt-1',
					kind: 'interruption',
					latencyMs: 340,
					source: 'voice-runtime'
				})
			],
			maxInterruptionLatencyMs: 250
		});

		expect(report.status).toBe('fail');
		expect(report.interruptionFrames).toBe(1);
		expect(report.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'media.interruption_latency' })
			])
		);
	});
});
