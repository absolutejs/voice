import type { AudioFormat } from './types';

export type VoiceMediaFrameKind =
	| 'assistant-audio'
	| 'input-audio'
	| 'interruption'
	| 'metadata'
	| 'transcript'
	| 'turn-commit';

export type VoiceMediaFrameSource =
	| 'browser'
	| 'provider'
	| 'telephony'
	| 'voice-runtime';

export type VoiceMediaPipelineStatus = 'fail' | 'pass' | 'warn';

export type VoiceMediaFrame = {
	at?: number;
	audio?: ArrayBuffer | ArrayBufferView;
	durationMs?: number;
	format?: AudioFormat;
	id: string;
	kind: VoiceMediaFrameKind;
	latencyMs?: number;
	metadata?: Record<string, unknown>;
	sessionId?: string;
	source: VoiceMediaFrameSource | (string & {});
	traceEventId?: string;
	turnId?: string;
};

export type VoiceMediaPipelineCalibrationInput = {
	expectedInputFormat?: AudioFormat;
	expectedOutputFormat?: AudioFormat;
	frames?: readonly VoiceMediaFrame[];
	inputFormat?: AudioFormat;
	maxBackpressureFrames?: number;
	maxFirstAudioLatencyMs?: number;
	maxJitterMs?: number;
	outputFormat?: AudioFormat;
	requireInterruptionFrame?: boolean;
	requireTraceEvidence?: boolean;
	surface?: string;
};

export type VoiceMediaPipelineCalibrationIssue = {
	code: string;
	message: string;
	severity: 'error' | 'warning';
};

export type VoiceMediaPipelineCalibrationReport = {
	assistantAudioFrames: number;
	backpressureFrames: number;
	checkedAt: number;
	firstAudioLatencyMs?: number;
	inputAudioFrames: number;
	inputFormat?: AudioFormat;
	interruptionFrames: number;
	issues: VoiceMediaPipelineCalibrationIssue[];
	jitterMs?: number;
	outputFormat?: AudioFormat;
	resamplingRequired: boolean;
	resamplingTargetHz?: number;
	status: VoiceMediaPipelineStatus;
	surface: string;
	traceLinkedFrames: number;
	turnCommitFrames: number;
};

const formatLabel = (format: AudioFormat) =>
	`${format.container}/${format.encoding}/${String(format.sampleRateHz)}hz/${String(format.channels)}ch`;

const formatMatches = (actual: AudioFormat, expected: AudioFormat) =>
	actual.container === expected.container &&
	actual.encoding === expected.encoding &&
	actual.sampleRateHz === expected.sampleRateHz &&
	actual.channels === expected.channels;

const pushIssue = (
	issues: VoiceMediaPipelineCalibrationIssue[],
	severity: 'error' | 'warning',
	code: string,
	message: string
) => {
	issues.push({ code, message, severity });
};

const numericMetadata = (
	frame: VoiceMediaFrame,
	key: string
): number | undefined => {
	const value = frame.metadata?.[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const createVoiceMediaFrame = (
	frame: VoiceMediaFrame
): VoiceMediaFrame => frame;

export const buildVoiceMediaPipelineCalibrationReport = (
	input: VoiceMediaPipelineCalibrationInput = {}
): VoiceMediaPipelineCalibrationReport => {
	const frames = input.frames ?? [];
	const issues: VoiceMediaPipelineCalibrationIssue[] = [];
	const inputFrames = frames.filter((frame) => frame.kind === 'input-audio');
	const assistantFrames = frames.filter(
		(frame) => frame.kind === 'assistant-audio'
	);
	const turnCommitFrames = frames.filter((frame) => frame.kind === 'turn-commit');
	const interruptionFrameRecords = frames.filter(
		(frame) => frame.kind === 'interruption'
	);
	const traceLinkedFrames = frames.filter((frame) => frame.traceEventId).length;
	const backpressureFrames = frames.filter((frame) =>
		Boolean(frame.metadata?.backpressure)
	).length;
	const audioLatencies = assistantFrames
		.map((frame) => frame.latencyMs)
		.filter((latency): latency is number => typeof latency === 'number');
	const firstAudioLatencyMs =
		audioLatencies.length > 0 ? Math.min(...audioLatencies) : undefined;
	const jitterValues = frames
		.map((frame) => numericMetadata(frame, 'jitterMs'))
		.filter((value): value is number => value !== undefined);
	const jitterMs = jitterValues.length > 0 ? Math.max(...jitterValues) : undefined;
	const inputFormat = input.inputFormat ?? inputFrames.find((frame) => frame.format)?.format;
	const outputFormat =
		input.outputFormat ?? assistantFrames.find((frame) => frame.format)?.format;
	const resamplingRequired =
		Boolean(
			input.expectedInputFormat &&
				inputFormat &&
				inputFormat.sampleRateHz !== input.expectedInputFormat.sampleRateHz
		) ||
		Boolean(
			input.expectedOutputFormat &&
				outputFormat &&
				outputFormat.sampleRateHz !== input.expectedOutputFormat.sampleRateHz
		);
	const resamplingTargetHz =
		resamplingRequired && input.expectedInputFormat
			? input.expectedInputFormat.sampleRateHz
			: resamplingRequired
				? input.expectedOutputFormat?.sampleRateHz
				: undefined;

	if (inputFrames.length === 0) {
		pushIssue(
			issues,
			'warning',
			'media.input_audio_missing',
			'No input audio frames were observed.'
		);
	}
	if (assistantFrames.length === 0) {
		pushIssue(
			issues,
			'warning',
			'media.assistant_audio_missing',
			'No assistant audio frames were observed.'
		);
	}
	if (
		input.expectedInputFormat &&
		inputFormat &&
		!formatMatches(inputFormat, input.expectedInputFormat)
	) {
		pushIssue(
			issues,
			inputFormat.sampleRateHz === input.expectedInputFormat.sampleRateHz
				? 'warning'
				: 'error',
			'media.input_format_mismatch',
			`Input format ${formatLabel(inputFormat)} does not match expected ${formatLabel(input.expectedInputFormat)}.`
		);
	}
	if (
		input.expectedOutputFormat &&
		outputFormat &&
		!formatMatches(outputFormat, input.expectedOutputFormat)
	) {
		pushIssue(
			issues,
			outputFormat.sampleRateHz === input.expectedOutputFormat.sampleRateHz
				? 'warning'
				: 'error',
			'media.output_format_mismatch',
			`Output format ${formatLabel(outputFormat)} does not match expected ${formatLabel(input.expectedOutputFormat)}.`
		);
	}
	if (
		firstAudioLatencyMs !== undefined &&
		input.maxFirstAudioLatencyMs !== undefined &&
		firstAudioLatencyMs > input.maxFirstAudioLatencyMs
	) {
		pushIssue(
			issues,
			'error',
			'media.first_audio_latency',
			`First audio latency ${String(firstAudioLatencyMs)}ms exceeds budget ${String(input.maxFirstAudioLatencyMs)}ms.`
		);
	}
	if (
		jitterMs !== undefined &&
		input.maxJitterMs !== undefined &&
		jitterMs > input.maxJitterMs
	) {
		pushIssue(
			issues,
			'warning',
			'media.jitter',
			`Media jitter ${String(jitterMs)}ms exceeds budget ${String(input.maxJitterMs)}ms.`
		);
	}
	if (
		input.maxBackpressureFrames !== undefined &&
		backpressureFrames > input.maxBackpressureFrames
	) {
		pushIssue(
			issues,
			'warning',
			'media.backpressure',
			`Backpressure frame count ${String(backpressureFrames)} exceeds budget ${String(input.maxBackpressureFrames)}.`
		);
	}
	if (input.requireInterruptionFrame && interruptionFrameRecords.length === 0) {
		pushIssue(
			issues,
			'warning',
			'media.interruption_missing',
			'No interruption frame was observed.'
		);
	}
	if (input.requireTraceEvidence && traceLinkedFrames === 0) {
		pushIssue(
			issues,
			'warning',
			'media.trace_evidence_missing',
			'No media frames were linked to trace evidence.'
		);
	}

	return {
		assistantAudioFrames: assistantFrames.length,
		backpressureFrames,
		checkedAt: Date.now(),
		firstAudioLatencyMs,
		inputAudioFrames: inputFrames.length,
		inputFormat,
		interruptionFrames: interruptionFrameRecords.length,
		issues,
		jitterMs,
		outputFormat,
		resamplingRequired,
		resamplingTargetHz,
		status: issues.some((issue) => issue.severity === 'error')
			? 'fail'
			: issues.length > 0
				? 'warn'
				: 'pass',
		surface: input.surface ?? 'voice-media-pipeline',
		traceLinkedFrames,
		turnCommitFrames: turnCommitFrames.length
	};
};
