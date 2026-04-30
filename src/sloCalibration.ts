import { Elysia } from 'elysia';
import type { VoiceProviderSloThresholdConfig } from './providerSlo';
import type { VoiceProductionReadinessRoutesOptions } from './productionReadiness';
import type { VoiceProofTrendReport } from './proofTrends';

export type VoiceSloCalibrationStatus = 'fail' | 'pass' | 'warn';

export type VoiceSloCalibrationMetricKey =
	| 'interruption'
	| 'liveLatency'
	| 'monitorRun'
	| 'notifierDelivery'
	| 'provider'
	| 'reconnect'
	| 'turnLatency';

export type VoiceSloCalibrationSample = {
	generatedAt?: string;
	interruptionP95Ms?: number;
	liveP95Ms?: number;
	monitorRunP95Ms?: number;
	notifierDeliveryP95Ms?: number;
	ok?: boolean;
	providerP95Ms?: number;
	reconnectP95Ms?: number;
	runId?: string;
	source?: string;
	turnP95Ms?: number;
};

export type VoiceSloCalibrationThreshold = {
	baselineP95Ms?: number;
	failAfterMs?: number;
	headroomMultiplier: number;
	maxObservedMs?: number;
	metric: VoiceSloCalibrationMetricKey;
	minimumMs: number;
	recommendedMs?: number;
	samples: number;
	status: VoiceSloCalibrationStatus;
	warnAfterMs?: number;
};

export type VoiceSloCalibrationThresholds = {
	interruption: VoiceSloCalibrationThreshold;
	liveLatency: VoiceSloCalibrationThreshold;
	monitorRun: VoiceSloCalibrationThreshold;
	notifierDelivery: VoiceSloCalibrationThreshold;
	provider: VoiceSloCalibrationThreshold;
	reconnect: VoiceSloCalibrationThreshold;
	turnLatency: VoiceSloCalibrationThreshold;
};

export type VoiceSloCalibrationReport = {
	generatedAt: string;
	issues: string[];
	minPassingRuns: number;
	ok: boolean;
	passingRuns: number;
	recommendedProviderSloThresholds: VoiceProviderSloThresholdConfig;
	runs: number;
	sources: string[];
	status: VoiceSloCalibrationStatus;
	thresholds: VoiceSloCalibrationThresholds;
};

export type VoiceSloThresholdProfile = {
	bargeIn: {
		thresholdMs?: number;
	};
	issues: string[];
	liveLatency: {
		failAfterMs?: number;
		warnAfterMs?: number;
	};
	monitoring: {
		monitorRunFailAfterMs?: number;
		notifierDeliveryFailAfterMs?: number;
	};
	providerSlo: VoiceProviderSloThresholdConfig;
	reconnect: {
		failAfterMs?: number;
	};
	status: VoiceSloCalibrationStatus;
};

export type VoiceSloReadinessThresholdOptions = Pick<
	VoiceProductionReadinessRoutesOptions,
	| 'liveLatencyFailAfterMs'
	| 'liveLatencyWarnAfterMs'
	| 'monitoringNotifierDeliveryFailAfterMs'
	| 'monitoringRunFailAfterMs'
	| 'reconnectResumeFailAfterMs'
>;

export type VoiceSloReadinessThresholdReport = {
	bargeIn: VoiceSloThresholdProfile['bargeIn'];
	generatedAt: string;
	issues: string[];
	liveLatencyMaxAgeMs?: number;
	ok: boolean;
	providerSlo: VoiceProviderSloThresholdConfig;
	readinessOptions: VoiceSloReadinessThresholdOptions;
	sources: string[];
	status: VoiceSloCalibrationStatus;
};

export type VoiceSloCalibrationOptions = {
	headroomMultiplier?: number;
	liveLatencyMinimumMs?: number;
	minPassingRuns?: number;
	monitorRunMinimumMs?: number;
	notifierDeliveryMinimumMs?: number;
	providerMinimumMs?: number;
	reconnectMinimumMs?: number;
	interruptionMinimumMs?: number;
	turnLatencyMinimumMs?: number;
	warnRatio?: number;
};

export type VoiceSloCalibrationRoutesOptions = VoiceSloCalibrationOptions & {
	headers?: HeadersInit;
	markdownPath?: false | string;
	name?: string;
	path?: string;
	source:
		| ((
				) =>
					| Promise<Array<VoiceProofTrendReport | VoiceSloCalibrationSample>>
					| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>)
		| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>;
	title?: string;
};

export type VoiceSloReadinessThresholdReportOptions =
	VoiceSloCalibrationOptions & {
		liveLatencyMaxAgeMs?: number;
	};

export type VoiceSloReadinessThresholdRoutesOptions =
	VoiceSloReadinessThresholdReportOptions & {
		headers?: HeadersInit;
		htmlPath?: false | string;
		markdownPath?: false | string;
		name?: string;
		path?: string;
		source:
			| ((
					) =>
						| Promise<
								| VoiceSloCalibrationReport
								| VoiceSloThresholdProfile
								| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>
						  >
						| VoiceSloCalibrationReport
						| VoiceSloThresholdProfile
						| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>)
			| VoiceSloCalibrationReport
			| VoiceSloThresholdProfile
			| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>;
		title?: string;
	};

const DEFAULT_HEADROOM_MULTIPLIER = 1.5;
const DEFAULT_WARN_RATIO = 0.8;
const DEFAULT_MIN_PASSING_RUNS = 3;

const roundMs = (value: number) => Math.max(1, Math.ceil(value));

const finiteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;

const percentile = (values: number[], rank: number) => {
	if (values.length === 0) {
		return undefined;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1)
	);
	return sorted[index];
};

const normalizeSample = (
	input: VoiceProofTrendReport | VoiceSloCalibrationSample
): VoiceSloCalibrationSample => {
	if ('summary' in input) {
		return {
			generatedAt: input.generatedAt,
			liveP95Ms: input.summary.maxLiveP95Ms,
			interruptionP95Ms: input.summary.runtimeChannel?.maxInterruptionP95Ms,
			ok: input.ok,
			providerP95Ms: input.summary.maxProviderP95Ms,
			runId: input.runId,
			source: input.source || input.outputDir,
			turnP95Ms: input.summary.maxTurnP95Ms
		};
	}

	return input;
};

const createThreshold = (
	metric: VoiceSloCalibrationMetricKey,
	values: number[],
	options: {
		headroomMultiplier: number;
		minimumMs: number;
		warnRatio: number;
	}
): VoiceSloCalibrationThreshold => {
	const baselineP95Ms = percentile(values, 95);
	const maxObservedMs = values.length > 0 ? Math.max(...values) : undefined;
	const recommendedMs =
		baselineP95Ms === undefined
			? undefined
			: roundMs(
					Math.max(options.minimumMs, baselineP95Ms * options.headroomMultiplier)
				);
	const warnAfterMs =
		recommendedMs === undefined
			? undefined
			: roundMs(Math.max(options.minimumMs, recommendedMs * options.warnRatio));

	return {
		baselineP95Ms,
		failAfterMs: recommendedMs,
		headroomMultiplier: options.headroomMultiplier,
		maxObservedMs,
		metric,
		minimumMs: options.minimumMs,
		recommendedMs,
		samples: values.length,
		status: values.length > 0 ? 'pass' : 'warn',
		warnAfterMs
	};
};

export const buildVoiceSloCalibrationReport = (
	input: Array<VoiceProofTrendReport | VoiceSloCalibrationSample>,
	options: VoiceSloCalibrationOptions = {}
): VoiceSloCalibrationReport => {
	const headroomMultiplier =
		finiteNumber(options.headroomMultiplier) && options.headroomMultiplier >= 1
			? options.headroomMultiplier
			: DEFAULT_HEADROOM_MULTIPLIER;
	const warnRatio =
		finiteNumber(options.warnRatio) && options.warnRatio > 0 && options.warnRatio < 1
			? options.warnRatio
			: DEFAULT_WARN_RATIO;
	const minPassingRuns = Math.max(
		1,
		Math.floor(options.minPassingRuns ?? DEFAULT_MIN_PASSING_RUNS)
	);
	const samples = input.map(normalizeSample);
	const passingSamples = samples.filter((sample) => sample.ok === true);
	const issues: string[] = [];

	if (passingSamples.length < minPassingRuns) {
		issues.push(
			`Expected at least ${String(minPassingRuns)} passing SLO calibration run(s), found ${String(passingSamples.length)}.`
		);
	}

	const valuesFor = (key: keyof VoiceSloCalibrationSample) =>
		passingSamples
			.map((sample) => sample[key])
			.filter((value): value is number => finiteNumber(value));

	const thresholds: VoiceSloCalibrationThresholds = {
		interruption: createThreshold('interruption', valuesFor('interruptionP95Ms'), {
			headroomMultiplier,
			minimumMs: options.interruptionMinimumMs ?? 250,
			warnRatio
		}),
		liveLatency: createThreshold('liveLatency', valuesFor('liveP95Ms'), {
			headroomMultiplier,
			minimumMs: options.liveLatencyMinimumMs ?? 600,
			warnRatio
		}),
		monitorRun: createThreshold('monitorRun', valuesFor('monitorRunP95Ms'), {
			headroomMultiplier,
			minimumMs: options.monitorRunMinimumMs ?? 1_000,
			warnRatio
		}),
		notifierDelivery: createThreshold(
			'notifierDelivery',
			valuesFor('notifierDeliveryP95Ms'),
			{
				headroomMultiplier,
				minimumMs: options.notifierDeliveryMinimumMs ?? 2_000,
				warnRatio
			}
		),
		provider: createThreshold('provider', valuesFor('providerP95Ms'), {
			headroomMultiplier,
			minimumMs: options.providerMinimumMs ?? 1_000,
			warnRatio
		}),
		reconnect: createThreshold('reconnect', valuesFor('reconnectP95Ms'), {
			headroomMultiplier,
			minimumMs: options.reconnectMinimumMs ?? 1_500,
			warnRatio
		}),
		turnLatency: createThreshold('turnLatency', valuesFor('turnP95Ms'), {
			headroomMultiplier,
			minimumMs: options.turnLatencyMinimumMs ?? 250,
			warnRatio
		})
	};

	for (const threshold of Object.values(thresholds)) {
		if (threshold.status !== 'pass') {
			issues.push(
				`Missing ${threshold.metric} samples for SLO threshold calibration.`
			);
		}
	}

	const providerP95 = thresholds.provider.recommendedMs;
	const recommendedProviderSloThresholds: VoiceProviderSloThresholdConfig =
		providerP95 === undefined
			? {}
			: {
					llm: { maxP95ElapsedMs: providerP95 },
					stt: { maxP95ElapsedMs: providerP95 },
					tts: { maxP95ElapsedMs: providerP95 }
				};
	const blockingIssues = issues.filter(
		(issue) =>
			!issue.startsWith('Missing interruption') &&
			!issue.startsWith('Missing monitorRun') &&
			!issue.startsWith('Missing notifierDelivery') &&
			!issue.startsWith('Missing reconnect')
	);
	const ok = blockingIssues.length === 0;

	return {
		generatedAt: new Date().toISOString(),
		issues,
		minPassingRuns,
		ok,
		passingRuns: passingSamples.length,
		recommendedProviderSloThresholds,
		runs: samples.length,
		sources: [
			...new Set(
				samples
					.map((sample) => sample.source || sample.runId)
					.filter((value): value is string => typeof value === 'string')
			)
		],
		status: ok ? (issues.length > 0 ? 'warn' : 'pass') : 'fail',
		thresholds
	};
};

export const assertVoiceSloCalibration = (
	input: Array<VoiceProofTrendReport | VoiceSloCalibrationSample>,
	options: VoiceSloCalibrationOptions = {}
): VoiceSloCalibrationReport => {
	const report = buildVoiceSloCalibrationReport(input, options);
	if (!report.ok) {
		throw new Error(
			`Voice SLO calibration failed: ${report.issues.join(' ')}`
		);
	}
	return report;
};

const thresholdValue = (threshold: VoiceSloCalibrationThreshold) =>
	threshold.recommendedMs ?? threshold.failAfterMs;

export const createVoiceSloThresholdProfile = (
	input:
		| VoiceSloCalibrationReport
		| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>,
	options: VoiceSloCalibrationOptions = {}
): VoiceSloThresholdProfile => {
	const report = Array.isArray(input)
		? buildVoiceSloCalibrationReport(input, options)
		: input;
	const liveLatencyFailAfterMs = thresholdValue(report.thresholds.liveLatency);
	const interruptionFailAfterMs = thresholdValue(report.thresholds.interruption);

	return {
		bargeIn: {
			thresholdMs: interruptionFailAfterMs
		},
		issues: report.issues,
		liveLatency: {
			failAfterMs: liveLatencyFailAfterMs,
			warnAfterMs: report.thresholds.liveLatency.warnAfterMs
		},
		monitoring: {
			monitorRunFailAfterMs: thresholdValue(report.thresholds.monitorRun),
			notifierDeliveryFailAfterMs: thresholdValue(
				report.thresholds.notifierDelivery
			)
		},
		providerSlo: report.recommendedProviderSloThresholds,
		reconnect: {
			failAfterMs: thresholdValue(report.thresholds.reconnect)
		},
		status: report.status
	};
};

export const createVoiceSloReadinessThresholdOptions = (
	input:
		| VoiceSloCalibrationReport
		| VoiceSloThresholdProfile
		| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>,
	options: VoiceSloCalibrationOptions = {}
): VoiceSloReadinessThresholdOptions => {
	const profile =
		'providerSlo' in input
			? input
			: createVoiceSloThresholdProfile(input, options);

	return {
		liveLatencyFailAfterMs: profile.liveLatency.failAfterMs,
		liveLatencyWarnAfterMs: profile.liveLatency.warnAfterMs,
		monitoringNotifierDeliveryFailAfterMs:
			profile.monitoring.notifierDeliveryFailAfterMs,
		monitoringRunFailAfterMs: profile.monitoring.monitorRunFailAfterMs,
		reconnectResumeFailAfterMs: profile.reconnect.failAfterMs
	};
};

export const buildVoiceSloReadinessThresholdReport = (
	input:
		| VoiceSloCalibrationReport
		| VoiceSloThresholdProfile
		| Array<VoiceProofTrendReport | VoiceSloCalibrationSample>,
	options: VoiceSloReadinessThresholdReportOptions = {}
): VoiceSloReadinessThresholdReport => {
	const report = Array.isArray(input)
		? buildVoiceSloCalibrationReport(input, options)
		: 'thresholds' in input
			? input
			: undefined;
	const profile: VoiceSloThresholdProfile =
		report === undefined
			? (input as VoiceSloThresholdProfile)
			: createVoiceSloThresholdProfile(report, options);

	return {
		bargeIn: profile.bargeIn,
		generatedAt: new Date().toISOString(),
		issues: profile.issues,
		liveLatencyMaxAgeMs: options.liveLatencyMaxAgeMs,
		ok: profile.status !== 'fail',
		providerSlo: profile.providerSlo,
		readinessOptions: createVoiceSloReadinessThresholdOptions(profile),
		sources: report?.sources ?? [],
		status: profile.status
	};
};

const escapeMarkdown = (value: string) => value.replaceAll('|', '\\|');

const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const formatMs = (value: number | undefined) =>
	value === undefined ? 'n/a' : `${value.toLocaleString()} ms`;

const readinessThresholdRows = (report: VoiceSloReadinessThresholdReport) => [
	{
		control: 'Provider SLO p95',
		value: report.providerSlo.llm?.maxP95ElapsedMs,
		usedBy: 'Provider SLO gates for STT, LLM, and TTS'
	},
	{
		control: 'Live latency warn',
		value: report.readinessOptions.liveLatencyWarnAfterMs,
		usedBy: 'Production readiness live latency warning gate'
	},
	{
		control: 'Live latency fail',
		value: report.readinessOptions.liveLatencyFailAfterMs,
		usedBy: 'Production readiness live latency fail gate'
	},
	{
		control: 'Live latency freshness',
		value: report.liveLatencyMaxAgeMs,
		usedBy: 'Maximum age for latency evidence before readiness ignores it'
	},
	{
		control: 'Barge-in interruption',
		value: report.bargeIn.thresholdMs,
		usedBy: 'Runtime interruption classification threshold'
	},
	{
		control: 'Reconnect resume p95',
		value: report.readinessOptions.reconnectResumeFailAfterMs,
		usedBy: 'Production readiness reconnect-resume gate'
	},
	{
		control: 'Monitor run elapsed',
		value: report.readinessOptions.monitoringRunFailAfterMs,
		usedBy: 'Production readiness monitoring run gate'
	},
	{
		control: 'Notifier delivery elapsed',
		value: report.readinessOptions.monitoringNotifierDeliveryFailAfterMs,
		usedBy: 'Production readiness notifier delivery gate'
	}
];

export const renderVoiceSloCalibrationMarkdown = (
	report: VoiceSloCalibrationReport,
	options: { title?: string } = {}
) => {
	const rows = Object.values(report.thresholds)
		.map(
			(threshold) =>
				`| ${escapeMarkdown(threshold.metric)} | ${threshold.status} | ${threshold.samples} | ${threshold.baselineP95Ms ?? 'n/a'} | ${threshold.warnAfterMs ?? 'n/a'} | ${threshold.failAfterMs ?? 'n/a'} |`
		)
		.join('\n');

	return `# ${options.title ?? 'Voice SLO Calibration'}

Generated: ${report.generatedAt}

Status: **${report.status}**

Passing runs: ${report.passingRuns}/${report.runs}

| Metric | Status | Samples | Baseline p95 | Warn after | Fail after |
| --- | --- | ---: | ---: | ---: | ---: |
${rows}

Issues:

${report.issues.map((issue) => `- ${issue}`).join('\n') || '- None'}
`;
};

export const renderVoiceSloReadinessThresholdMarkdown = (
	report: VoiceSloReadinessThresholdReport,
	options: { title?: string } = {}
) => {
	const rows = readinessThresholdRows(report)
		.map(
			(row) =>
				`| ${escapeMarkdown(row.control)} | ${formatMs(row.value)} | ${escapeMarkdown(row.usedBy)} |`
		)
		.join('\n');

	return `# ${options.title ?? 'Calibration -> Active Readiness Gate'}

Generated: ${report.generatedAt}

Status: **${report.status}**

| Threshold | Active value | Used by |
| --- | ---: | --- |
${rows}

Sources:

${report.sources.map((source) => `- ${source}`).join('\n') || '- n/a'}

Issues:

${report.issues.map((issue) => `- ${issue}`).join('\n') || '- None'}
`;
};

export const renderVoiceSloReadinessThresholdHTML = (
	report: VoiceSloReadinessThresholdReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Calibration -> Active Readiness Gate';
	const rows = readinessThresholdRows(report)
		.map(
			(row) =>
				`<tr><td>${escapeHtml(row.control)}</td><td>${escapeHtml(formatMs(row.value))}</td><td>${escapeHtml(row.usedBy)}</td></tr>`
		)
		.join('');
	const issues =
		report.issues.length === 0
			? '<li>None</li>'
			: report.issues
					.map((issue) => `<li>${escapeHtml(issue)}</li>`)
					.join('');
	const sources =
		report.sources.length === 0
			? '<li>n/a</li>'
			: report.sources
					.map((source) => `<li><code>${escapeHtml(source)}</code></li>`)
					.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#f8f7f2;color:#181713;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.45;margin:2rem}main{max-width:1040px;margin:auto}.summary{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:1rem 0}.card,table{background:white;border:1px solid #ddd6c8;border-radius:14px}.card{padding:1rem}table{border-collapse:collapse;width:100%;overflow:hidden}td,th{border-bottom:1px solid #eee8dc;padding:.7rem;text-align:left;vertical-align:top}code{white-space:pre-wrap;word-break:break-word}.status{font-size:1.6rem;font-weight:800;text-transform:uppercase}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>This page shows the calibrated thresholds currently driving production readiness gates.</p><section class="summary"><div class="card"><strong>Status</strong><br><span class="status">${escapeHtml(report.status)}</span></div><div class="card"><strong>Live evidence max age</strong><br>${escapeHtml(formatMs(report.liveLatencyMaxAgeMs))}</div><div class="card"><strong>Provider p95 gate</strong><br>${escapeHtml(formatMs(report.providerSlo.llm?.maxP95ElapsedMs))}</div><div class="card"><strong>Barge-in gate</strong><br>${escapeHtml(formatMs(report.bargeIn.thresholdMs))}</div></section><h2>Active Readiness Thresholds</h2><table><thead><tr><th>Threshold</th><th>Active value</th><th>Used by</th></tr></thead><tbody>${rows}</tbody></table><h2>Sources</h2><ul>${sources}</ul><h2>Issues</h2><ul>${issues}</ul></main></body></html>`;
};

export const createVoiceSloCalibrationRoutes = (
	options: VoiceSloCalibrationRoutesOptions
) => {
	const path = options.path ?? '/api/voice/slo-calibration';
	const markdownPath =
		options.markdownPath === undefined
			? '/voice/slo-calibration.md'
			: options.markdownPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-slo-calibration'
	});
	const loadReport = async () =>
		buildVoiceSloCalibrationReport(
			typeof options.source === 'function'
				? await options.source()
				: options.source,
			options
		);

	routes.get(path, async () =>
		Response.json(await loadReport(), { headers: options.headers })
	);

	if (markdownPath !== false) {
		routes.get(markdownPath, async () => {
			const report = await loadReport();
			return new Response(
				renderVoiceSloCalibrationMarkdown(report, {
					title: options.title
				}),
				{
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						...Object.fromEntries(new Headers(options.headers))
					}
				}
			);
		});
	}

	return routes;
};

export const createVoiceSloReadinessThresholdRoutes = (
	options: VoiceSloReadinessThresholdRoutesOptions
) => {
	const path = options.path ?? '/api/voice/slo-readiness-thresholds';
	const htmlPath =
		options.htmlPath === undefined
			? '/voice/slo-readiness-thresholds'
			: options.htmlPath;
	const markdownPath =
		options.markdownPath === undefined
			? '/voice/slo-readiness-thresholds.md'
			: options.markdownPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-slo-readiness-thresholds'
	});
	const loadReport = async () =>
		buildVoiceSloReadinessThresholdReport(
			typeof options.source === 'function'
				? await options.source()
				: options.source,
			options
		);

	routes.get(path, async () =>
		Response.json(await loadReport(), { headers: options.headers })
	);

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const report = await loadReport();
			return new Response(
				renderVoiceSloReadinessThresholdHTML(report, {
					title: options.title
				}),
				{
					headers: {
						'content-type': 'text/html; charset=utf-8',
						...Object.fromEntries(new Headers(options.headers))
					}
				}
			);
		});
	}

	if (markdownPath !== false) {
		routes.get(markdownPath, async () => {
			const report = await loadReport();
			return new Response(
				renderVoiceSloReadinessThresholdMarkdown(report, {
					title: options.title
				}),
				{
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						...Object.fromEntries(new Headers(options.headers))
					}
				}
			);
		});
	}

	return routes;
};
