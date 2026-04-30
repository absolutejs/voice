import { Elysia } from 'elysia';

export type VoiceProofTrendStatus = 'empty' | 'fail' | 'pass' | 'stale';

export type VoiceProofTrendSummary = {
	cycles?: number;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
	maxTurnP95Ms?: number;
};

export type VoiceProofTrendRuntimeChannelSummary = {
	maxBackpressureEvents?: number;
	maxFirstAudioLatencyMs?: number;
	maxInterruptionP95Ms?: number;
	maxJitterMs?: number;
	maxTimestampDriftMs?: number;
	samples?: number;
	status?: string;
};

export type VoiceProofTrendCycle = {
	at?: string;
	cycle?: number;
	liveLatency?: {
		p95Ms?: number;
		samples?: number;
	};
	ok?: boolean;
	opsRecovery?: {
		issues?: number;
		status?: string;
	};
	productionReadiness?: {
		status?: string;
	};
	providerSlo?: {
		events?: number;
		eventsWithLatency?: number;
		status?: string;
	};
	runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
	turnLatency?: {
		p95Ms?: number;
		samples?: number;
		status?: string;
	};
};

export type VoiceProofTrendReportInput = {
	baseUrl?: string;
	cycles?: VoiceProofTrendCycle[];
	generatedAt?: string;
	maxAgeMs?: number;
	now?: Date | number | string;
	ok?: boolean;
	outputDir?: string;
	runId?: string;
	source?: string;
	status?: VoiceProofTrendStatus;
	summary?: VoiceProofTrendSummary;
};

export type VoiceProofTrendReport = {
	ageMs?: number;
	baseUrl?: string;
	cycles: VoiceProofTrendCycle[];
	freshUntil?: string;
	generatedAt?: string;
	maxAgeMs: number;
	ok: boolean;
	outputDir?: string;
	runId?: string;
	source: string;
	status: VoiceProofTrendStatus;
	summary: VoiceProofTrendSummary;
};

export type VoiceProofTrendAssertionInput = {
	maxAgeMs?: number;
	maxRuntimeBackpressureEvents?: number;
	maxRuntimeFirstAudioLatencyMs?: number;
	maxRuntimeInterruptionP95Ms?: number;
	maxRuntimeJitterMs?: number;
	maxRuntimeTimestampDriftMs?: number;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxTurnP95Ms?: number;
	minCycles?: number;
	minLiveLatencySamples?: number;
	minProviderSloEventsWithLatency?: number;
	minRuntimeChannelSamples?: number;
	minTurnLatencySamples?: number;
	requireAllCyclesOk?: boolean;
	requireStatus?: VoiceProofTrendStatus;
};

export type VoiceProofTrendAssertionReport = {
	ageMs?: number;
	cycles: number;
	failedCycles: number;
	issues: string[];
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
	maxTurnP95Ms?: number;
	ok: boolean;
	status: VoiceProofTrendStatus;
};

export type VoiceProofTrendRoutesOptions = {
	headers?: HeadersInit;
	jsonPath?: string;
	maxAgeMs?: number;
	name?: string;
	path?: string;
	source?:
		| (() =>
				| Promise<VoiceProofTrendReport | VoiceProofTrendReportInput>
				| VoiceProofTrendReport
				| VoiceProofTrendReportInput)
		| VoiceProofTrendReport
		| VoiceProofTrendReportInput;
};

export type VoiceProofTrendRecommendationStatus = 'fail' | 'pass' | 'warn';

export type VoiceProofTrendRecommendationSurface =
	| 'live-latency'
	| 'provider-path'
	| 'runtime-channel'
	| 'turn-latency';

export type VoiceProofTrendRecommendation = {
	evidence: Record<string, number | string | undefined>;
	nextMove: string;
	recommendation: string;
	status: VoiceProofTrendRecommendationStatus;
	surface: VoiceProofTrendRecommendationSurface;
};

export type VoiceProofTrendRecommendationReport = {
	generatedAt: string;
	issues: string[];
	ok: boolean;
	recommendations: VoiceProofTrendRecommendation[];
	source: string;
	status: VoiceProofTrendRecommendationStatus;
	summary: {
		keepCurrentProviderPath: boolean;
		keepCurrentRuntimeChannel: boolean;
		recommendedActions: number;
	};
};

export type VoiceProofTrendRecommendationOptions = {
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxRuntimeBackpressureEvents?: number;
	maxRuntimeFirstAudioLatencyMs?: number;
	maxRuntimeInterruptionP95Ms?: number;
	maxRuntimeJitterMs?: number;
	maxRuntimeTimestampDriftMs?: number;
	maxTurnP95Ms?: number;
};

export type VoiceProofTrendRecommendationRoutesOptions =
	VoiceProofTrendRecommendationOptions & {
		headers?: HeadersInit;
		htmlPath?: false | string;
		jsonPath?: string;
		maxAgeMs?: number;
		markdownPath?: false | string;
		name?: string;
		path?: string;
		source?:
			| (() =>
					| Promise<VoiceProofTrendReport | VoiceProofTrendReportInput>
					| VoiceProofTrendReport
					| VoiceProofTrendReportInput)
			| VoiceProofTrendReport
			| VoiceProofTrendReportInput;
		title?: string;
	};

export const DEFAULT_VOICE_PROOF_TRENDS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const normalizeMaxAgeMs = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_VOICE_PROOF_TRENDS_MAX_AGE_MS;

const toTimeMs = (value: Date | number | string | undefined) => {
	if (value instanceof Date) {
		return value.getTime();
	}
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		return Date.parse(value);
	}
	return Date.now();
};

export const buildVoiceProofTrendReport = (
	input: VoiceProofTrendReportInput = {}
): VoiceProofTrendReport => {
	const maxAgeMs = normalizeMaxAgeMs(input.maxAgeMs);
	const nowMs = toTimeMs(input.now);
	const generatedAtMs =
		typeof input.generatedAt === 'string'
			? Date.parse(input.generatedAt)
			: Number.NaN;
	const ageMs =
		Number.isFinite(generatedAtMs) && Number.isFinite(nowMs)
			? Math.max(0, nowMs - generatedAtMs)
			: undefined;
	const freshUntil =
		Number.isFinite(generatedAtMs) && Number.isFinite(maxAgeMs)
			? new Date(generatedAtMs + maxAgeMs).toISOString()
			: undefined;
	const isFresh = ageMs !== undefined && ageMs <= maxAgeMs;
	const status: VoiceProofTrendStatus =
		input.status === 'empty'
			? 'empty'
			: !isFresh
				? 'stale'
				: input.ok === true
					? 'pass'
					: 'fail';

	return {
		ageMs,
		baseUrl: input.baseUrl,
		cycles: input.cycles ?? [],
		freshUntil,
		generatedAt: input.generatedAt,
		maxAgeMs,
		ok: input.ok === true && status === 'pass',
		outputDir: input.outputDir,
		runId: input.runId,
		source: input.source ?? '',
		status,
		summary: input.summary ?? {}
	};
};

export const buildEmptyVoiceProofTrendReport = (
	source = '',
	maxAgeMs?: number
): VoiceProofTrendReport =>
	buildVoiceProofTrendReport({
		maxAgeMs,
		source,
		status: 'empty'
	});

export const normalizeVoiceProofTrendReport = (
	value: VoiceProofTrendReport | VoiceProofTrendReportInput,
	options: { maxAgeMs?: number; source?: string } = {}
): VoiceProofTrendReport => {
	if ('status' in value && value.status === 'empty') {
		return buildEmptyVoiceProofTrendReport(
			value.source || options.source || '',
			options.maxAgeMs ?? value.maxAgeMs
		);
	}

	return buildVoiceProofTrendReport({
		...value,
		maxAgeMs: options.maxAgeMs ?? value.maxAgeMs,
		source: value.source ?? options.source
	});
};

export const readVoiceProofTrendReportFile = async (
	path: string,
	options: { maxAgeMs?: number } = {}
): Promise<VoiceProofTrendReport> => {
	const file = Bun.file(path);

	if (!(await file.exists())) {
		return buildEmptyVoiceProofTrendReport(path, options.maxAgeMs);
	}

	try {
		const parsed = (await file.json()) as VoiceProofTrendReportInput;
		return normalizeVoiceProofTrendReport(parsed, {
			maxAgeMs: options.maxAgeMs,
			source: path
		});
	} catch {
		return buildVoiceProofTrendReport({
			maxAgeMs: options.maxAgeMs,
			source: path
		});
	}
};

const maxNumber = (values: Array<number | undefined>) => {
	const finite = values.filter(
		(value): value is number => typeof value === 'number' && Number.isFinite(value)
	);
	return finite.length > 0 ? Math.max(...finite) : undefined;
};

const readProofTrendMaxLiveP95 = (report: VoiceProofTrendReport) =>
	report.summary.maxLiveP95Ms ??
	maxNumber(report.cycles.map((cycle) => cycle.liveLatency?.p95Ms));

const readProofTrendMaxProviderP95 = (report: VoiceProofTrendReport) =>
	report.summary.maxProviderP95Ms;

const readProofTrendMaxTurnP95 = (report: VoiceProofTrendReport) =>
	report.summary.maxTurnP95Ms ??
	maxNumber(report.cycles.map((cycle) => cycle.turnLatency?.p95Ms));

const readRuntimeChannelMetric = (
	report: VoiceProofTrendReport,
	key: Exclude<keyof VoiceProofTrendRuntimeChannelSummary, 'status'>
) => {
	const summaryValue = report.summary.runtimeChannel?.[key];
	return typeof summaryValue === 'number'
		? summaryValue
		: maxNumber(
			report.cycles.map((cycle) => {
				const value = cycle.runtimeChannel?.[key];
				return typeof value === 'number' ? value : undefined;
			})
		);
};

const readProofTrendRuntimeChannel = (
	report: VoiceProofTrendReport
): VoiceProofTrendRuntimeChannelSummary => ({
	maxBackpressureEvents: readRuntimeChannelMetric(
		report,
		'maxBackpressureEvents'
	),
	maxFirstAudioLatencyMs: readRuntimeChannelMetric(
		report,
		'maxFirstAudioLatencyMs'
	),
	maxInterruptionP95Ms: readRuntimeChannelMetric(
		report,
		'maxInterruptionP95Ms'
	),
	maxJitterMs: readRuntimeChannelMetric(report, 'maxJitterMs'),
	maxTimestampDriftMs: readRuntimeChannelMetric(
		report,
		'maxTimestampDriftMs'
	),
	samples:
		report.summary.runtimeChannel?.samples ??
		maxNumber(report.cycles.map((cycle) => cycle.runtimeChannel?.samples)),
	status: report.summary.runtimeChannel?.status
});

export const evaluateVoiceProofTrendEvidence = (
	report: VoiceProofTrendReport,
	input: VoiceProofTrendAssertionInput = {}
): VoiceProofTrendAssertionReport => {
	const issues: string[] = [];
	const requiredStatus = input.requireStatus ?? 'pass';
	const minCycles = input.minCycles ?? 1;
	const requireAllCyclesOk = input.requireAllCyclesOk ?? true;
	const cycles = report.summary.cycles ?? report.cycles.length;
	const failedCycles = report.cycles.filter((cycle) => cycle.ok !== true).length;
	const maxLiveP95Ms = readProofTrendMaxLiveP95(report);
	const maxProviderP95Ms = readProofTrendMaxProviderP95(report);
	const runtimeChannel = readProofTrendRuntimeChannel(report);
	const maxTurnP95Ms = readProofTrendMaxTurnP95(report);

	if (report.status !== requiredStatus) {
		issues.push(
			`Expected proof trends status ${requiredStatus}, found ${report.status}.`
		);
	}
	if (report.ok !== true) {
		issues.push('Expected proof trends ok to be true.');
	}
	if (cycles < minCycles) {
		issues.push(
			`Expected at least ${String(minCycles)} proof trend cycle(s), found ${String(cycles)}.`
		);
	}
	if (requireAllCyclesOk && failedCycles > 0) {
		issues.push(
			`Expected all proof trend cycles to pass, found ${String(failedCycles)} failing cycle(s).`
		);
	}
	if (
		input.maxAgeMs !== undefined &&
		(report.ageMs === undefined || report.ageMs > input.maxAgeMs)
	) {
		issues.push(
			report.ageMs === undefined
				? 'Missing proof trends artifact age.'
				: `Expected proof trends age at most ${String(input.maxAgeMs)}ms, found ${String(report.ageMs)}ms.`
		);
	}
	if (
		input.maxLiveP95Ms !== undefined &&
		(maxLiveP95Ms === undefined || maxLiveP95Ms > input.maxLiveP95Ms)
	) {
		issues.push(
			maxLiveP95Ms === undefined
				? 'Missing proof trends live latency p95.'
				: `Expected proof trends live latency p95 at most ${String(input.maxLiveP95Ms)}ms, found ${String(maxLiveP95Ms)}ms.`
		);
	}
	if (
		input.maxProviderP95Ms !== undefined &&
		(maxProviderP95Ms === undefined || maxProviderP95Ms > input.maxProviderP95Ms)
	) {
		issues.push(
			maxProviderP95Ms === undefined
				? 'Missing proof trends provider p95.'
				: `Expected proof trends provider p95 at most ${String(input.maxProviderP95Ms)}ms, found ${String(maxProviderP95Ms)}ms.`
		);
	}
	if (
		input.maxTurnP95Ms !== undefined &&
		(maxTurnP95Ms === undefined || maxTurnP95Ms > input.maxTurnP95Ms)
	) {
		issues.push(
			maxTurnP95Ms === undefined
				? 'Missing proof trends turn latency p95.'
				: `Expected proof trends turn latency p95 at most ${String(input.maxTurnP95Ms)}ms, found ${String(maxTurnP95Ms)}ms.`
		);
	}
	if (
		input.maxRuntimeFirstAudioLatencyMs !== undefined &&
		(runtimeChannel.maxFirstAudioLatencyMs === undefined ||
			runtimeChannel.maxFirstAudioLatencyMs >
				input.maxRuntimeFirstAudioLatencyMs)
	) {
		issues.push(
			runtimeChannel.maxFirstAudioLatencyMs === undefined
				? 'Missing proof trends runtime-channel first audio latency.'
				: `Expected proof trends runtime-channel first audio latency at most ${String(input.maxRuntimeFirstAudioLatencyMs)}ms, found ${String(runtimeChannel.maxFirstAudioLatencyMs)}ms.`
		);
	}
	if (
		input.maxRuntimeInterruptionP95Ms !== undefined &&
		(runtimeChannel.maxInterruptionP95Ms === undefined ||
			runtimeChannel.maxInterruptionP95Ms > input.maxRuntimeInterruptionP95Ms)
	) {
		issues.push(
			runtimeChannel.maxInterruptionP95Ms === undefined
				? 'Missing proof trends runtime-channel interruption p95.'
				: `Expected proof trends runtime-channel interruption p95 at most ${String(input.maxRuntimeInterruptionP95Ms)}ms, found ${String(runtimeChannel.maxInterruptionP95Ms)}ms.`
		);
	}
	if (
		input.maxRuntimeJitterMs !== undefined &&
		(runtimeChannel.maxJitterMs === undefined ||
			runtimeChannel.maxJitterMs > input.maxRuntimeJitterMs)
	) {
		issues.push(
			runtimeChannel.maxJitterMs === undefined
				? 'Missing proof trends runtime-channel jitter.'
				: `Expected proof trends runtime-channel jitter at most ${String(input.maxRuntimeJitterMs)}ms, found ${String(runtimeChannel.maxJitterMs)}ms.`
		);
	}
	if (
		input.maxRuntimeTimestampDriftMs !== undefined &&
		(runtimeChannel.maxTimestampDriftMs === undefined ||
			runtimeChannel.maxTimestampDriftMs > input.maxRuntimeTimestampDriftMs)
	) {
		issues.push(
			runtimeChannel.maxTimestampDriftMs === undefined
				? 'Missing proof trends runtime-channel timestamp drift.'
				: `Expected proof trends runtime-channel timestamp drift at most ${String(input.maxRuntimeTimestampDriftMs)}ms, found ${String(runtimeChannel.maxTimestampDriftMs)}ms.`
		);
	}
	if (
		input.maxRuntimeBackpressureEvents !== undefined &&
		(runtimeChannel.maxBackpressureEvents === undefined ||
			runtimeChannel.maxBackpressureEvents > input.maxRuntimeBackpressureEvents)
	) {
		issues.push(
			runtimeChannel.maxBackpressureEvents === undefined
				? 'Missing proof trends runtime-channel backpressure events.'
				: `Expected proof trends runtime-channel backpressure events at most ${String(input.maxRuntimeBackpressureEvents)}, found ${String(runtimeChannel.maxBackpressureEvents)}.`
		);
	}
	if (input.minLiveLatencySamples !== undefined) {
		const lowSamples = report.cycles.filter(
			(cycle) =>
				(cycle.liveLatency?.samples ?? 0) < input.minLiveLatencySamples!
		).length;
		if (lowSamples > 0) {
			issues.push(
				`Expected every proof trend cycle to have at least ${String(input.minLiveLatencySamples)} live latency sample(s), found ${String(lowSamples)} low-sample cycle(s).`
			);
		}
	}
	if (input.minProviderSloEventsWithLatency !== undefined) {
		const lowSamples = report.cycles.filter(
			(cycle) =>
				(cycle.providerSlo?.eventsWithLatency ?? 0) <
				input.minProviderSloEventsWithLatency!
		).length;
		if (lowSamples > 0) {
			issues.push(
				`Expected every proof trend cycle to have at least ${String(input.minProviderSloEventsWithLatency)} provider latency event(s), found ${String(lowSamples)} low-sample cycle(s).`
			);
		}
	}
	if (input.minTurnLatencySamples !== undefined) {
		const lowSamples = report.cycles.filter(
			(cycle) => (cycle.turnLatency?.samples ?? 0) < input.minTurnLatencySamples!
		).length;
		if (lowSamples > 0) {
			issues.push(
				`Expected every proof trend cycle to have at least ${String(input.minTurnLatencySamples)} turn latency sample(s), found ${String(lowSamples)} low-sample cycle(s).`
			);
		}
	}
	if (
		input.minRuntimeChannelSamples !== undefined &&
		(runtimeChannel.samples === undefined ||
			runtimeChannel.samples < input.minRuntimeChannelSamples)
	) {
		issues.push(
			runtimeChannel.samples === undefined
				? 'Missing proof trends runtime-channel samples.'
				: `Expected proof trends runtime-channel samples at least ${String(input.minRuntimeChannelSamples)}, found ${String(runtimeChannel.samples)}.`
		);
	}

	return {
		ageMs: report.ageMs,
		cycles,
		failedCycles,
		issues,
		maxLiveP95Ms,
		maxProviderP95Ms,
		runtimeChannel,
		maxTurnP95Ms,
		ok: issues.length === 0,
		status: report.status
	};
};

export const assertVoiceProofTrendEvidence = (
	report: VoiceProofTrendReport,
	input: VoiceProofTrendAssertionInput = {}
): VoiceProofTrendAssertionReport => {
	const assertion = evaluateVoiceProofTrendEvidence(report, input);
	if (!assertion.ok) {
		throw new Error(
			`Voice proof trends assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const DEFAULT_RECOMMENDATION_BUDGETS = {
	maxLiveP95Ms: 800,
	maxProviderP95Ms: 1_000,
	maxRuntimeBackpressureEvents: 0,
	maxRuntimeFirstAudioLatencyMs: 600,
	maxRuntimeInterruptionP95Ms: 300,
	maxRuntimeJitterMs: 30,
	maxRuntimeTimestampDriftMs: 800,
	maxTurnP95Ms: 700
};

const withinBudget = (value: number | undefined, budget: number) =>
	typeof value === 'number' && Number.isFinite(value) && value <= budget;

const recommendationStatusRank: Record<VoiceProofTrendRecommendationStatus, number> = {
	pass: 0,
	warn: 1,
	fail: 2
};

const worstRecommendationStatus = (
	recommendations: readonly VoiceProofTrendRecommendation[]
): VoiceProofTrendRecommendationStatus =>
	recommendations.reduce(
		(status, recommendation) =>
			recommendationStatusRank[recommendation.status] >
			recommendationStatusRank[status]
				? recommendation.status
				: status,
		'pass' as VoiceProofTrendRecommendationStatus
	);

export const buildVoiceProofTrendRecommendationReport = (
	report: VoiceProofTrendReport,
	options: VoiceProofTrendRecommendationOptions = {}
): VoiceProofTrendRecommendationReport => {
	const budgets = { ...DEFAULT_RECOMMENDATION_BUDGETS, ...options };
	const maxLiveP95Ms = readProofTrendMaxLiveP95(report);
	const maxProviderP95Ms = readProofTrendMaxProviderP95(report);
	const maxTurnP95Ms = readProofTrendMaxTurnP95(report);
	const runtimeChannel = readProofTrendRuntimeChannel(report);
	const recommendations: VoiceProofTrendRecommendation[] = [];
	const issues: string[] = [];

	if (report.ok !== true) {
		issues.push(`Proof trend report is ${report.status}; recommendations need a fresh passing trend artifact.`);
	}

	recommendations.push({
		evidence: {
			budgetMs: budgets.maxProviderP95Ms,
			providerP95Ms: maxProviderP95Ms
		},
		nextMove: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
			? 'Keep the current provider route for latency-sensitive turns and keep collecting sustained proof.'
			: 'Route latency-sensitive turns to a faster provider profile or tighten fallback/circuit-breaker budgets before promotion.',
		recommendation: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
			? 'Keep current provider path'
			: 'Change provider routing for latency-sensitive traffic',
		status: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
			? 'pass'
			: maxProviderP95Ms === undefined
				? 'fail'
				: 'warn',
		surface: 'provider-path'
	});

	const runtimePass =
		withinBudget(
			runtimeChannel.maxFirstAudioLatencyMs,
			budgets.maxRuntimeFirstAudioLatencyMs
		) &&
		withinBudget(
			runtimeChannel.maxInterruptionP95Ms,
			budgets.maxRuntimeInterruptionP95Ms
		) &&
		withinBudget(runtimeChannel.maxJitterMs, budgets.maxRuntimeJitterMs) &&
		withinBudget(
			runtimeChannel.maxTimestampDriftMs,
			budgets.maxRuntimeTimestampDriftMs
		) &&
		withinBudget(
			runtimeChannel.maxBackpressureEvents,
			budgets.maxRuntimeBackpressureEvents
		);
	recommendations.push({
		evidence: {
			backpressureEvents: runtimeChannel.maxBackpressureEvents,
			firstAudioBudgetMs: budgets.maxRuntimeFirstAudioLatencyMs,
			firstAudioMs: runtimeChannel.maxFirstAudioLatencyMs,
			interruptionBudgetMs: budgets.maxRuntimeInterruptionP95Ms,
			interruptionP95Ms: runtimeChannel.maxInterruptionP95Ms,
			jitterBudgetMs: budgets.maxRuntimeJitterMs,
			jitterMs: runtimeChannel.maxJitterMs,
			samples: runtimeChannel.samples,
			timestampDriftMs: runtimeChannel.maxTimestampDriftMs
		},
		nextMove: runtimePass
			? 'Keep the current runtime-channel settings and use this artifact as the deploy gate baseline.'
			: 'Tune capture/output format, buffering, interruption threshold, or transport backpressure before promoting this runtime path.',
		recommendation: runtimePass
			? 'Keep current runtime channel'
			: 'Tune runtime channel before promotion',
		status: runtimePass ? 'pass' : runtimeChannel.samples === undefined ? 'fail' : 'warn',
		surface: 'runtime-channel'
	});

	recommendations.push({
		evidence: {
			budgetMs: budgets.maxLiveP95Ms,
			liveP95Ms: maxLiveP95Ms
		},
		nextMove: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
			? 'Keep browser live-latency defaults and continue watching long-window drift.'
			: 'Tune browser streaming, chunking, or readiness thresholds before release.',
		recommendation: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
			? 'Keep live-latency settings'
			: 'Tune live-latency path',
		status: withinBudget(maxLiveP95Ms, budgets.maxLiveP95Ms)
			? 'pass'
			: maxLiveP95Ms === undefined
				? 'fail'
				: 'warn',
		surface: 'live-latency'
	});

	recommendations.push({
		evidence: {
			budgetMs: budgets.maxTurnP95Ms,
			turnP95Ms: maxTurnP95Ms
		},
		nextMove: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
			? 'Keep current turn pipeline defaults.'
			: 'Reduce tool/provider latency or split the turn pipeline before promotion.',
		recommendation: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
			? 'Keep turn pipeline'
			: 'Tune turn pipeline',
		status: withinBudget(maxTurnP95Ms, budgets.maxTurnP95Ms)
			? 'pass'
			: maxTurnP95Ms === undefined
				? 'fail'
				: 'warn',
		surface: 'turn-latency'
	});

	const status = issues.length > 0 ? 'fail' : worstRecommendationStatus(recommendations);

	return {
		generatedAt: new Date().toISOString(),
		issues,
		ok: status !== 'fail',
		recommendations,
		source: report.source || report.outputDir || report.runId || 'proof-trends',
		status,
		summary: {
			keepCurrentProviderPath:
				recommendations.find((item) => item.surface === 'provider-path')?.status ===
				'pass',
			keepCurrentRuntimeChannel:
				recommendations.find((item) => item.surface === 'runtime-channel')
					?.status === 'pass',
			recommendedActions: recommendations.filter((item) => item.status !== 'pass')
				.length
		}
	};
};

const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const escapeMarkdown = (value: string) => value.replaceAll('|', '\\|');

export const renderVoiceProofTrendRecommendationMarkdown = (
	report: VoiceProofTrendRecommendationReport,
	title = 'Voice Provider Runtime Recommendations'
) => [
	`# ${title}`,
	'',
	`- Status: ${report.status}`,
	`- Source: ${report.source}`,
	`- Recommended actions: ${String(report.summary.recommendedActions)}`,
	'',
	'| Surface | Status | Recommendation | Next move |',
	'| --- | --- | --- | --- |',
	...report.recommendations.map(
		(recommendation) =>
			`| ${escapeMarkdown(recommendation.surface)} | ${recommendation.status} | ${escapeMarkdown(recommendation.recommendation)} | ${escapeMarkdown(recommendation.nextMove)} |`
	),
	'',
	'## Issues',
	'',
	...(report.issues.length ? report.issues.map((issue) => `- ${issue}`) : ['- None'])
].join('\n');

export const renderVoiceProofTrendRecommendationHTML = (
	report: VoiceProofTrendRecommendationReport,
	title = 'Voice Provider Runtime Recommendations'
) => {
	const cards = report.recommendations
		.map(
			(recommendation) =>
				`<article class="${escapeHtml(recommendation.status)}"><p class="eyebrow">${escapeHtml(recommendation.surface)} · ${escapeHtml(recommendation.status)}</p><h2>${escapeHtml(recommendation.recommendation)}</h2><p>${escapeHtml(recommendation.nextMove)}</p><pre>${escapeHtml(JSON.stringify(recommendation.evidence, null, 2))}</pre></article>`
		)
		.join('');
	const issues =
		report.issues.length === 0
			? '<li>None</li>'
			: report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,article{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.7rem);letter-spacing:-.06em;line-height:.92;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{border:1px solid #42534a;border-radius:999px;padding:8px 12px}.pass{border-color:rgba(34,197,94,.55)}.warn{border-color:rgba(245,158,11,.7)}.fail{border-color:rgba(239,68,68,.75)}pre{background:#0b1110;border-radius:14px;overflow:auto;padding:12px}a{color:#5eead4}</style></head><body><main><section class="hero"><p class="eyebrow">Sustained proof recommendations</p><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.source)}.</p><div class="summary"><span class="pill">Status ${escapeHtml(report.status)}</span><span class="pill">Provider ${report.summary.keepCurrentProviderPath ? 'keep' : 'change'}</span><span class="pill">Runtime ${report.summary.keepCurrentRuntimeChannel ? 'keep' : 'tune'}</span><span class="pill">${String(report.summary.recommendedActions)} action(s)</span></div></section>${cards}<section class="hero"><h2>Issues</h2><ul>${issues}</ul></section></main></body></html>`;
};

export const createVoiceProofTrendRecommendationRoutes = (
	options: VoiceProofTrendRecommendationRoutesOptions
) => {
	const path = options.path ?? '/api/voice/proof-trend-recommendations';
	const htmlPath =
		options.htmlPath === undefined
			? '/voice/proof-trend-recommendations'
			: options.htmlPath;
	const markdownPath =
		options.markdownPath === undefined
			? '/voice/proof-trend-recommendations.md'
			: options.markdownPath;
	const title = options.title ?? 'Voice Provider Runtime Recommendations';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-proof-trend-recommendations'
	});
	const loadReport = async () => {
		const value =
			options.source !== undefined
				? typeof options.source === 'function'
					? await options.source()
					: options.source
				: options.jsonPath
					? await readVoiceProofTrendReportFile(options.jsonPath, {
							maxAgeMs: options.maxAgeMs
						})
					: buildEmptyVoiceProofTrendReport('', options.maxAgeMs);
		return buildVoiceProofTrendRecommendationReport(
			normalizeVoiceProofTrendReport(value, {
				maxAgeMs: options.maxAgeMs,
				source: options.jsonPath
			}),
			options
		);
	};

	routes.get(path, async () =>
		Response.json(await loadReport(), { headers: options.headers })
	);

	if (htmlPath !== false) {
		routes.get(htmlPath, async () => {
			const report = await loadReport();
			return new Response(renderVoiceProofTrendRecommendationHTML(report, title), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					...Object.fromEntries(new Headers(options.headers))
				}
			});
		});
	}

	if (markdownPath !== false) {
		routes.get(markdownPath, async () => {
			const report = await loadReport();
			return new Response(
				renderVoiceProofTrendRecommendationMarkdown(report, title),
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

export const createVoiceProofTrendRoutes = (
	options: VoiceProofTrendRoutesOptions
) => {
	const path = options.path ?? '/api/voice/proof-trends';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-proof-trends'
	});

	routes.get(path, async () => {
		const value =
			options.source !== undefined
				? typeof options.source === 'function'
					? await options.source()
					: options.source
				: options.jsonPath
					? await readVoiceProofTrendReportFile(options.jsonPath, {
							maxAgeMs: options.maxAgeMs
						})
					: buildEmptyVoiceProofTrendReport('', options.maxAgeMs);

		return Response.json(
			normalizeVoiceProofTrendReport(value, {
				maxAgeMs: options.maxAgeMs,
				source: options.jsonPath
			}),
			{ headers: options.headers }
		);
	});

	return routes;
};

export const formatVoiceProofTrendAge = (ageMs: unknown) => {
	if (typeof ageMs !== 'number' || !Number.isFinite(ageMs)) {
		return 'unknown';
	}

	const minutes = Math.floor(ageMs / 60_000);
	if (minutes < 1) {
		return 'less than 1m';
	}
	if (minutes < 60) {
		return `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 48) {
		return `${hours}h ${minutes % 60}m`;
	}

	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
};
