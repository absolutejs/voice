import { Elysia } from 'elysia';
import {
	buildMediaInterruptionReport,
	buildMediaPipelineCalibrationReport,
	buildMediaResamplingPlan,
	buildMediaVadReport,
	type MediaFrame,
	type MediaInterruptionReport,
	type MediaPipelineCalibrationInput,
	type MediaPipelineCalibrationReport,
	type MediaPipelineStatus,
	type MediaProcessorGraphReport,
	type MediaResamplingPlan,
	type MediaTransportReport,
	type MediaVadReport
} from '@absolutejs/media';

export type VoiceMediaPipelineReportOptions = MediaPipelineCalibrationInput & {
	frames?: readonly MediaFrame[];
	maxInterruptionLatencyMs?: number;
	maxSilenceFrames?: number;
	minSpeechFrames?: number;
	processorGraph?: MediaProcessorGraphReport;
	speechEndThreshold?: number;
	speechStartThreshold?: number;
	transport?: MediaTransportReport;
};

export type VoiceMediaPipelineReport = {
	calibration: MediaPipelineCalibrationReport;
	checkedAt: number;
	frames: number;
	interruption: MediaInterruptionReport;
	ok: boolean;
	resampling?: MediaResamplingPlan;
	processorGraph?: MediaProcessorGraphReport;
	status: MediaPipelineStatus;
	surface: string;
	transport?: MediaTransportReport;
	vad: MediaVadReport;
};

export type VoiceMediaPipelineAssertionInput = {
	maxFirstAudioLatencyMs?: number;
	maxInterruptionLatencyMs?: number;
	minAssistantAudioFrames?: number;
	minInputAudioFrames?: number;
	minProcessorGraphEmittedFrames?: number;
	minProcessorGraphNodes?: number;
	minTransportInputFrames?: number;
	minTransportOutputFrames?: number;
	minTraceLinkedFrames?: number;
	minVadSegments?: number;
	maxTransportBackpressureEvents?: number;
	requireInterruptionFrame?: boolean;
	requirePass?: boolean;
	requireProcessorGraph?: boolean;
	requireResamplingReady?: boolean;
	requireTransportConnected?: boolean;
};

export type VoiceMediaPipelineAssertionReport = {
	issues: string[];
	ok: boolean;
	status: MediaPipelineStatus;
	surface: string;
};

export type VoiceMediaPipelineRoutesOptions = VoiceMediaPipelineReportOptions & {
	headers?: HeadersInit;
	htmlPath?: false | string;
	markdownPath?: false | string;
	name?: string;
	path?: string;
	render?: (report: VoiceMediaPipelineReport) => Promise<string> | string;
	source?:
		| (() => Promise<VoiceMediaPipelineReportOptions> | VoiceMediaPipelineReportOptions)
		| VoiceMediaPipelineReportOptions;
	title?: string;
};

const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const statusRank: Record<MediaPipelineStatus, number> = {
	pass: 0,
	warn: 1,
	fail: 2
};

const worstStatus = (
	statuses: readonly MediaPipelineStatus[]
): MediaPipelineStatus =>
	statuses.reduce(
		(worst, status) => (statusRank[status] > statusRank[worst] ? status : worst),
		'pass'
	);

export const buildVoiceMediaPipelineReport = (
	options: VoiceMediaPipelineReportOptions = {}
): VoiceMediaPipelineReport => {
	const frames = options.frames ?? [];
	const calibration = buildMediaPipelineCalibrationReport(options);
	const vad = buildMediaVadReport({
		frames,
		maxSilenceFrames: options.maxSilenceFrames,
		minSpeechFrames: options.minSpeechFrames,
		speechEndThreshold: options.speechEndThreshold,
		speechStartThreshold: options.speechStartThreshold
	});
	const interruption = buildMediaInterruptionReport({
		frames,
		maxInterruptionLatencyMs: options.maxInterruptionLatencyMs
	});
	const resampling =
		calibration.inputFormat && calibration.outputFormat
			? buildMediaResamplingPlan({
					inputFormat: calibration.inputFormat,
					outputFormat: calibration.outputFormat
				})
			: undefined;
	const status = worstStatus([
		calibration.status,
		vad.status,
		interruption.status,
		resampling?.status ?? 'pass',
		options.processorGraph?.status ?? 'pass',
		options.transport?.status ?? 'pass'
	]);

	return {
		calibration,
		checkedAt: Date.now(),
		frames: frames.length,
		interruption,
		ok: status === 'pass',
		processorGraph: options.processorGraph,
		resampling,
		status,
		surface: options.surface ?? 'voice-media-pipeline',
		transport: options.transport,
		vad
	};
};

export const evaluateVoiceMediaPipelineEvidence = (
	report: VoiceMediaPipelineReport,
	input: VoiceMediaPipelineAssertionInput = {}
): VoiceMediaPipelineAssertionReport => {
	const issues: string[] = [];
	if ((input.requirePass ?? false) && report.status !== 'pass') {
		issues.push(`Expected media pipeline proof to pass, found ${report.status}.`);
	}
	if (
		input.minInputAudioFrames !== undefined &&
		report.calibration.inputAudioFrames < input.minInputAudioFrames
	) {
		issues.push(
			`Expected at least ${String(input.minInputAudioFrames)} input audio frame(s), found ${String(report.calibration.inputAudioFrames)}.`
		);
	}
	if (
		input.minAssistantAudioFrames !== undefined &&
		report.calibration.assistantAudioFrames < input.minAssistantAudioFrames
	) {
		issues.push(
			`Expected at least ${String(input.minAssistantAudioFrames)} assistant audio frame(s), found ${String(report.calibration.assistantAudioFrames)}.`
		);
	}
	if (
		input.minTraceLinkedFrames !== undefined &&
		report.calibration.traceLinkedFrames < input.minTraceLinkedFrames
	) {
		issues.push(
			`Expected at least ${String(input.minTraceLinkedFrames)} trace-linked frame(s), found ${String(report.calibration.traceLinkedFrames)}.`
		);
	}
	if (
		input.maxFirstAudioLatencyMs !== undefined &&
		(report.calibration.firstAudioLatencyMs === undefined ||
			report.calibration.firstAudioLatencyMs > input.maxFirstAudioLatencyMs)
	) {
		issues.push(
			`Expected first assistant audio at or below ${String(input.maxFirstAudioLatencyMs)}ms, found ${String(report.calibration.firstAudioLatencyMs ?? 'missing')}ms.`
		);
	}
	if (
		input.minVadSegments !== undefined &&
		report.vad.segments.length < input.minVadSegments
	) {
		issues.push(
			`Expected at least ${String(input.minVadSegments)} VAD segment(s), found ${String(report.vad.segments.length)}.`
		);
	}
	if (
		input.requireInterruptionFrame &&
		report.interruption.interruptionFrames < 1
	) {
		issues.push('Expected at least one interruption frame.');
	}
	if (
		input.maxInterruptionLatencyMs !== undefined &&
		report.interruption.latenciesMs.some(
			(latency) => latency > input.maxInterruptionLatencyMs!
		)
	) {
		issues.push(
			`Expected interruption latency at or below ${String(input.maxInterruptionLatencyMs)}ms.`
		);
	}
	if (
		input.requireResamplingReady &&
		report.calibration.resamplingRequired &&
		!report.resampling
	) {
		issues.push('Expected resampling plan when calibration requires resampling.');
	}
	if (input.requireProcessorGraph && !report.processorGraph) {
		issues.push('Expected media processor graph evidence.');
	}
	if (
		input.minProcessorGraphNodes !== undefined &&
		(report.processorGraph?.nodes.length ?? 0) < input.minProcessorGraphNodes
	) {
		issues.push(
			`Expected at least ${String(input.minProcessorGraphNodes)} media processor node(s), found ${String(report.processorGraph?.nodes.length ?? 0)}.`
		);
	}
	if (
		input.minProcessorGraphEmittedFrames !== undefined &&
		(report.processorGraph?.emittedFrames ?? 0) <
			input.minProcessorGraphEmittedFrames
	) {
		issues.push(
			`Expected at least ${String(input.minProcessorGraphEmittedFrames)} processor graph output frame(s), found ${String(report.processorGraph?.emittedFrames ?? 0)}.`
		);
	}
	if (input.requireTransportConnected && !report.transport?.connected) {
		issues.push('Expected connected media transport evidence.');
	}
	if (
		input.minTransportInputFrames !== undefined &&
		(report.transport?.inputFrames ?? 0) < input.minTransportInputFrames
	) {
		issues.push(
			`Expected at least ${String(input.minTransportInputFrames)} transport input frame(s), found ${String(report.transport?.inputFrames ?? 0)}.`
		);
	}
	if (
		input.minTransportOutputFrames !== undefined &&
		(report.transport?.outputFrames ?? 0) < input.minTransportOutputFrames
	) {
		issues.push(
			`Expected at least ${String(input.minTransportOutputFrames)} transport output frame(s), found ${String(report.transport?.outputFrames ?? 0)}.`
		);
	}
	if (
		input.maxTransportBackpressureEvents !== undefined &&
		(report.transport?.backpressureEvents ?? 0) >
			input.maxTransportBackpressureEvents
	) {
		issues.push(
			`Expected at most ${String(input.maxTransportBackpressureEvents)} transport backpressure event(s), found ${String(report.transport?.backpressureEvents ?? 0)}.`
		);
	}

	return {
		issues,
		ok: issues.length === 0,
		status: report.status,
		surface: report.surface
	};
};

export const assertVoiceMediaPipelineEvidence = (
	report: VoiceMediaPipelineReport,
	input: VoiceMediaPipelineAssertionInput = {}
): VoiceMediaPipelineAssertionReport => {
	const assertion = evaluateVoiceMediaPipelineEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice media pipeline assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

export const renderVoiceMediaPipelineMarkdown = (
	report: VoiceMediaPipelineReport
) => [
	'# Voice Media Pipeline Proof',
	'',
	`- Status: ${report.status}`,
	`- Surface: ${report.surface}`,
	`- Frames: ${String(report.frames)}`,
	`- Input audio frames: ${String(report.calibration.inputAudioFrames)}`,
	`- Assistant audio frames: ${String(report.calibration.assistantAudioFrames)}`,
	`- Trace-linked frames: ${String(report.calibration.traceLinkedFrames)}`,
	`- First audio latency: ${String(report.calibration.firstAudioLatencyMs ?? 'n/a')}ms`,
	`- Resampling required: ${report.calibration.resamplingRequired ? 'yes' : 'no'}`,
	`- VAD segments: ${String(report.vad.segments.length)}`,
	`- Interruption frames: ${String(report.interruption.interruptionFrames)}`,
	`- Processor graph: ${report.processorGraph ? `${report.processorGraph.name} (${String(report.processorGraph.nodes.length)} nodes)` : 'n/a'}`,
	`- Processor graph emitted frames: ${String(report.processorGraph?.emittedFrames ?? 0)}`,
	`- Processor graph dropped frames: ${String(report.processorGraph?.droppedFrames ?? 0)}`,
	`- Transport: ${report.transport ? `${report.transport.name} (${report.transport.state})` : 'n/a'}`,
	`- Transport input frames: ${String(report.transport?.inputFrames ?? 0)}`,
	`- Transport output frames: ${String(report.transport?.outputFrames ?? 0)}`,
	`- Transport backpressure events: ${String(report.transport?.backpressureEvents ?? 0)}`,
	'',
	'## Issues',
	'',
	...[
		...report.calibration.issues,
		...report.interruption.issues
	].map((issue) => `- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`),
	...(report.calibration.issues.length + report.interruption.issues.length === 0
		? ['- None']
		: [])
].join('\n');

export const renderVoiceMediaPipelineHTML = (
	report: VoiceMediaPipelineReport,
	title = 'Voice Media Pipeline Proof'
) => {
	const issues = [...report.calibration.issues, ...report.interruption.issues]
		.map(
			(issue) =>
				`<li class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.code)}</strong>: ${escapeHtml(issue.message)}</li>`
		)
		.join('');
	const segments = report.vad.segments
		.map(
			(segment) =>
				`<tr><td>${escapeHtml(segment.segmentId)}</td><td>${escapeHtml(segment.frameCount)}</td><td>${escapeHtml(segment.durationMs ?? 'n/a')}</td><td>${escapeHtml(segment.turnId ?? 'n/a')}</td></tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1100px;padding:32px}.hero,.card{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.summary{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.metric{background:#101814;border:1px solid #2e3d36;border-radius:18px;padding:14px}.metric span{color:#a8b5ad;display:block;font-size:.78rem;text-transform:uppercase}.metric strong{display:block;font-size:1.65rem;margin-top:5px}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:7px 11px}.pass{color:#86efac}.warn,.warning{color:#fde68a}.fail,.error{color:#fecaca}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2e3d36;padding:10px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Native media pipeline</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</p><p>${escapeHtml(report.surface)}</p><section class="summary"><div class="metric"><span>Frames</span><strong>${String(report.frames)}</strong></div><div class="metric"><span>Input audio</span><strong>${String(report.calibration.inputAudioFrames)}</strong></div><div class="metric"><span>Assistant audio</span><strong>${String(report.calibration.assistantAudioFrames)}</strong></div><div class="metric"><span>Trace linked</span><strong>${String(report.calibration.traceLinkedFrames)}</strong></div><div class="metric"><span>First audio</span><strong>${escapeHtml(report.calibration.firstAudioLatencyMs ?? 'n/a')}ms</strong></div><div class="metric"><span>VAD segments</span><strong>${String(report.vad.segments.length)}</strong></div><div class="metric"><span>Interruptions</span><strong>${String(report.interruption.interruptionFrames)}</strong></div><div class="metric"><span>Processor graph</span><strong>${String(report.processorGraph?.nodes.length ?? 0)} nodes</strong></div><div class="metric"><span>Graph out/drop</span><strong>${String(report.processorGraph?.emittedFrames ?? 0)}/${String(report.processorGraph?.droppedFrames ?? 0)}</strong></div><div class="metric"><span>Resampling</span><strong>${report.calibration.resamplingRequired ? 'required' : 'not required'}</strong></div><div class="metric"><span>Transport</span><strong>${escapeHtml(report.transport?.state ?? 'n/a')}</strong></div><div class="metric"><span>Transport in/out</span><strong>${String(report.transport?.inputFrames ?? 0)}/${String(report.transport?.outputFrames ?? 0)}</strong></div><div class="metric"><span>Backpressure</span><strong>${String(report.transport?.backpressureEvents ?? 0)}</strong></div></section></section><section class="card"><h2>Issues</h2><ul>${issues || '<li class="pass">No media pipeline issues.</li>'}</ul></section><section class="card"><h2>VAD Segments</h2><table><thead><tr><th>Segment</th><th>Frames</th><th>Duration ms</th><th>Turn</th></tr></thead><tbody>${segments || '<tr><td colspan="4">No VAD segments.</td></tr>'}</tbody></table></section></main></body></html>`;
};

export const createVoiceMediaPipelineRoutes = (
	options: VoiceMediaPipelineRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice/media-pipeline';
	const htmlPath = options.htmlPath ?? '/voice/media-pipeline';
	const markdownPath = options.markdownPath ?? '/voice/media-pipeline.md';
	const headers = options.headers ?? {};
	const title = options.title ?? 'Voice Media Pipeline Proof';
	const resolveOptions = async () => {
		const source =
			typeof options.source === 'function'
				? await options.source()
				: (options.source ?? options);
		const {
			headers: _headers,
			htmlPath: _htmlPath,
			markdownPath: _markdownPath,
			name: _name,
			path: _path,
			render: _render,
			source: _source,
			title: _title,
			...reportOptions
		} = {
			...options,
			...source
		};
		return reportOptions satisfies VoiceMediaPipelineReportOptions;
	};
	const report = async () => buildVoiceMediaPipelineReport(await resolveOptions());
	const app = new Elysia({ name: options.name ?? 'voice-media-pipeline' }).get(
		path,
		async () =>
			new Response(JSON.stringify(await report(), null, 2), {
				headers: {
					'content-type': 'application/json; charset=utf-8',
					...headers
				}
			})
	);

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const current = await report();
			const body = options.render
				? await options.render(current)
				: renderVoiceMediaPipelineHTML(current, title);
			return new Response(body, {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...headers
				}
			});
		});
	}

	if (markdownPath !== false) {
		app.get(
			markdownPath,
			async () =>
				new Response(renderVoiceMediaPipelineMarkdown(await report()), {
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						...headers
					}
				})
		);
	}

	return app;
};
