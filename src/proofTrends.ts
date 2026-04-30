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
