import { Elysia } from 'elysia';

export type VoiceProofTrendStatus = 'empty' | 'fail' | 'pass' | 'stale';

export type VoiceProofTrendSummary = {
	cycles?: number;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	profiles?: VoiceProofTrendProfileSummary[];
	providers?: VoiceProofTrendProviderSummary[];
	runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
	maxTurnP95Ms?: number;
};

export type VoiceProofTrendProfileSummary = {
	description?: string;
	id: string;
	label?: string;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxTurnP95Ms?: number;
	providers?: VoiceProofTrendProviderSummary[];
	runtimeChannel?: VoiceProofTrendRuntimeChannelSummary;
	status?: string;
};

export type VoiceProofTrendProfileDefinition = {
	description?: string;
	id: string;
	label?: string;
	liveOffsetMs?: number;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxRuntimeFirstAudioLatencyMs?: number;
	maxRuntimeInterruptionP95Ms?: number;
	maxRuntimeJitterMs?: number;
	maxRuntimeTimestampDriftMs?: number;
	maxTurnP95Ms?: number;
	providerOffsetMs?: number;
	runtimeOffsetMs?: number;
	turnOffsetMs?: number;
};

export type VoiceProofTrendProviderSummary = {
	averageMs?: number;
	id: string;
	label?: string;
	p50Ms?: number;
	p95Ms?: number;
	role?: string;
	samples?: number;
	status?: string;
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
	providers?: VoiceProofTrendProviderSummary[];
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

export type VoiceProofTrendProfileSummaryOptions = {
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxRuntimeFirstAudioLatencyMs?: number;
	maxRuntimeInterruptionP95Ms?: number;
	maxRuntimeJitterMs?: number;
	maxRuntimeTimestampDriftMs?: number;
	maxTurnP95Ms?: number;
	profiles?: readonly VoiceProofTrendProfileDefinition[];
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
	providerId?: string;
	role?: string;
	recommendation: string;
	status: VoiceProofTrendRecommendationStatus;
	surface: VoiceProofTrendRecommendationSurface;
};

export type VoiceProofTrendProviderRecommendation = {
	averageMs?: number;
	id: string;
	label?: string;
	nextMove: string;
	p50Ms?: number;
	p95Ms?: number;
	rank: number;
	role?: string;
	samples?: number;
	status: VoiceProofTrendRecommendationStatus;
};

export type VoiceProofTrendRecommendationReport = {
	bestProvider?: VoiceProofTrendProviderRecommendation;
	bestProviders: VoiceProofTrendProviderRecommendation[];
	generatedAt: string;
	issues: string[];
	ok: boolean;
	profiles: VoiceProofTrendProfileRecommendation[];
	providers: VoiceProofTrendProviderRecommendation[];
	recommendations: VoiceProofTrendRecommendation[];
	source: string;
	status: VoiceProofTrendRecommendationStatus;
	summary: {
		keepCurrentProviderPath: boolean;
		keepCurrentRuntimeChannel: boolean;
		providerComparisonCount: number;
		recommendedActions: number;
		switchRecommended: boolean;
	};
};

export type VoiceProofTrendProfileRecommendation = {
	bestProviders: VoiceProofTrendProviderRecommendation[];
	id: string;
	label?: string;
	nextMove: string;
	providerComparisonCount: number;
	recommendation: string;
	status: VoiceProofTrendRecommendationStatus;
};

export type VoiceProofTrendRecommendationOptions = {
	currentProviderId?: string;
	maxLiveP95Ms?: number;
	maxProviderP95Ms?: number;
	maxRuntimeBackpressureEvents?: number;
	maxRuntimeFirstAudioLatencyMs?: number;
	maxRuntimeInterruptionP95Ms?: number;
	maxRuntimeJitterMs?: number;
	maxRuntimeTimestampDriftMs?: number;
	maxTurnP95Ms?: number;
	providerSwitchMinImprovementMs?: number;
	providerSwitchMinImprovementRatio?: number;
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

export const DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS = [
	{
		description:
			'Browser recorder with longer passive listening and transcript capture.',
		id: 'meeting-recorder',
		label: 'Meeting recorder'
	},
	{
		description:
			'Realtime support agent with fast interruption recovery and tool-ready turns.',
		id: 'support-agent',
		label: 'Support agent',
		liveOffsetMs: 17,
		providerOffsetMs: 20,
		runtimeOffsetMs: 10,
		turnOffsetMs: 3
	},
	{
		description:
			'Appointment scheduler with short structured turns and reliable follow-up capture.',
		id: 'appointment-scheduler',
		label: 'Appointment scheduler',
		liveOffsetMs: 29,
		providerOffsetMs: 35,
		runtimeOffsetMs: 16,
		turnOffsetMs: 5
	},
	{
		description:
			'Noisy phone call with stricter transport and interruption proof requirements.',
		id: 'noisy-phone-call',
		label: 'Noisy phone call',
		liveOffsetMs: 40,
		providerOffsetMs: 60,
		runtimeOffsetMs: 22,
		turnOffsetMs: 7
	}
] satisfies readonly VoiceProofTrendProfileDefinition[];

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
	report.summary.maxProviderP95Ms ??
	maxNumber((report.summary.providers ?? []).map((provider) => provider.p95Ms)) ??
	maxNumber(
		report.cycles.flatMap((cycle) =>
			(cycle.providers ?? []).map((provider) => provider.p95Ms)
		)
	);

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

const addProofTrendProfileOffset = (
	value: number | undefined,
	offset: number | undefined,
	cap: number | undefined
) => {
	if (value === undefined) {
		return undefined;
	}

	const nextValue = Math.round(value + (offset ?? 0));
	return cap === undefined ? nextValue : Math.min(cap, nextValue);
};

const aggregateProofTrendProviders = (
	providers: readonly VoiceProofTrendProviderSummary[]
): VoiceProofTrendProviderSummary[] => {
	const providersById = new Map<string, VoiceProofTrendProviderSummary>();

	for (const provider of providers) {
		if (!provider.id) {
			continue;
		}
		const existing = providersById.get(provider.id);
		providersById.set(provider.id, {
			averageMs: maxNumber([existing?.averageMs, provider.averageMs]),
			id: provider.id,
			label: existing?.label ?? provider.label,
			p50Ms: maxNumber([existing?.p50Ms, provider.p50Ms]),
			p95Ms: maxNumber([existing?.p95Ms, provider.p95Ms]),
			role: existing?.role ?? provider.role,
			samples: (existing?.samples ?? 0) + (provider.samples ?? 0),
			status:
				existing?.status === 'fail' || provider.status === 'fail'
					? 'fail'
					: existing?.status === 'warn' || provider.status === 'warn'
						? 'warn'
						: provider.status ?? existing?.status
		});
	}

	return [...providersById.values()].sort(
		(left, right) =>
			(left.p95Ms ?? Number.POSITIVE_INFINITY) -
			(right.p95Ms ?? Number.POSITIVE_INFINITY)
	);
};

const aggregateProofTrendRuntimeChannel = (
	channels: readonly VoiceProofTrendRuntimeChannelSummary[]
): VoiceProofTrendRuntimeChannelSummary | undefined => {
	if (channels.length === 0) {
		return undefined;
	}

	return {
		maxBackpressureEvents: maxNumber(
			channels.map((channel) => channel.maxBackpressureEvents)
		),
		maxFirstAudioLatencyMs: maxNumber(
			channels.map((channel) => channel.maxFirstAudioLatencyMs)
		),
		maxInterruptionP95Ms: maxNumber(
			channels.map((channel) => channel.maxInterruptionP95Ms)
		),
		maxJitterMs: maxNumber(channels.map((channel) => channel.maxJitterMs)),
		maxTimestampDriftMs: maxNumber(
			channels.map((channel) => channel.maxTimestampDriftMs)
		),
		samples: maxNumber(channels.map((channel) => channel.samples)),
		status: channels.some((channel) => channel.status === 'fail')
			? 'fail'
			: channels.some((channel) => channel.status === 'warn')
				? 'warn'
				: channels.every((channel) => channel.status === 'pass')
					? 'pass'
					: undefined
	};
};

const readProofTrendProviders = (reports: readonly VoiceProofTrendReport[]) =>
	aggregateProofTrendProviders(
		reports.flatMap((report) =>
			report.summary.providers && report.summary.providers.length > 0
				? report.summary.providers
				: report.cycles.flatMap((cycle) => cycle.providers ?? [])
		)
	);

const exceedsProofTrendBudget = (value: number | undefined, budget: number) =>
	value !== undefined && (!Number.isFinite(value) || value > budget);

const readProofTrendProfileStatus = (
	profile: VoiceProofTrendProfileSummary,
	budgets: {
		maxLiveP95Ms: number;
		maxProviderP95Ms: number;
		maxRuntimeFirstAudioLatencyMs: number;
		maxRuntimeInterruptionP95Ms: number;
		maxRuntimeJitterMs: number;
		maxRuntimeTimestampDriftMs: number;
		maxTurnP95Ms: number;
	}
) => {
	const runtimeChannel = profile.runtimeChannel;
	const hasBudgetEvidence =
		profile.maxLiveP95Ms !== undefined ||
		profile.maxProviderP95Ms !== undefined ||
		profile.maxTurnP95Ms !== undefined ||
		profile.providers?.some((provider) => provider.p95Ms !== undefined) ===
			true ||
		runtimeChannel?.maxFirstAudioLatencyMs !== undefined ||
		runtimeChannel?.maxInterruptionP95Ms !== undefined ||
		runtimeChannel?.maxJitterMs !== undefined ||
		runtimeChannel?.maxTimestampDriftMs !== undefined ||
		runtimeChannel?.maxBackpressureEvents !== undefined;
	const budgetFailed =
		exceedsProofTrendBudget(profile.maxLiveP95Ms, budgets.maxLiveP95Ms) ||
		exceedsProofTrendBudget(
			profile.maxProviderP95Ms,
			budgets.maxProviderP95Ms
		) ||
		exceedsProofTrendBudget(profile.maxTurnP95Ms, budgets.maxTurnP95Ms) ||
		exceedsProofTrendBudget(
			runtimeChannel?.maxFirstAudioLatencyMs,
			budgets.maxRuntimeFirstAudioLatencyMs
		) ||
		exceedsProofTrendBudget(
			runtimeChannel?.maxInterruptionP95Ms,
			budgets.maxRuntimeInterruptionP95Ms
		) ||
		exceedsProofTrendBudget(
			runtimeChannel?.maxJitterMs,
			budgets.maxRuntimeJitterMs
		) ||
		exceedsProofTrendBudget(
			runtimeChannel?.maxTimestampDriftMs,
			budgets.maxRuntimeTimestampDriftMs
		) ||
		exceedsProofTrendBudget(runtimeChannel?.maxBackpressureEvents, 0);

	if (budgetFailed || (!hasBudgetEvidence && profile.status === 'fail')) {
		return 'fail';
	}

	if (
		profile.status === 'warn' ||
		runtimeChannel?.status === 'warn' ||
		profile.providers?.some((provider) => provider.status === 'warn') === true
	) {
		return 'warn';
	}

	if (
		hasBudgetEvidence ||
		profile.status === 'pass' ||
		runtimeChannel?.status === 'pass' ||
		profile.providers?.some((provider) => provider.status === 'pass') === true
	) {
		return 'pass';
	}

	return undefined;
};

export const buildVoiceProofTrendProfileSummaries = (
	input: VoiceProofTrendReport | readonly VoiceProofTrendReport[],
	options: VoiceProofTrendProfileSummaryOptions = {}
): VoiceProofTrendProfileSummary[] => {
	const reports = Array.isArray(input) ? input : [input];
	const definitions: readonly VoiceProofTrendProfileDefinition[] =
		options.profiles ?? DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS;
	const providerCap = options.maxProviderP95Ms ?? 1_000;
	const liveCap = options.maxLiveP95Ms ?? 800;
	const turnCap = options.maxTurnP95Ms ?? 700;
	const runtimeFirstAudioCap = options.maxRuntimeFirstAudioLatencyMs ?? 600;
	const runtimeInterruptionCap = options.maxRuntimeInterruptionP95Ms ?? 300;
	const runtimeJitterCap = options.maxRuntimeJitterMs ?? 30;
	const runtimeTimestampDriftCap = options.maxRuntimeTimestampDriftMs ?? 800;
	const budgets = {
		maxLiveP95Ms: liveCap,
		maxProviderP95Ms: providerCap,
		maxRuntimeFirstAudioLatencyMs: runtimeFirstAudioCap,
		maxRuntimeInterruptionP95Ms: runtimeInterruptionCap,
		maxRuntimeJitterMs: runtimeJitterCap,
		maxRuntimeTimestampDriftMs: runtimeTimestampDriftCap,
		maxTurnP95Ms: turnCap
	};

	return definitions.map((definition) => {
		const historicalProfiles: VoiceProofTrendProfileSummary[] = reports.flatMap(
			(report) =>
				report.summary.profiles?.filter(
					(profile: VoiceProofTrendProfileSummary) =>
						profile.id === definition.id
				) ?? []
		);

		if (historicalProfiles.length > 0) {
			const missingProfileReports = reports.filter(
					(report) =>
						!report.summary.profiles?.some(
							(profile: VoiceProofTrendProfileSummary) =>
								profile.id === definition.id
						)
				);
			const derivedProfiles =
				missingProfileReports.length > 0
					? buildVoiceProofTrendProfileSummaries(missingProfileReports, {
							...options,
							profiles: [definition]
						})
					: [];
			const profiles = [...historicalProfiles, ...derivedProfiles];
			const aggregatedProfile = {
				description:
					definition.description ?? profiles.find(Boolean)?.description,
				id: definition.id,
				label: definition.label ?? profiles.find(Boolean)?.label,
				maxLiveP95Ms: maxNumber(
					profiles.map((profile) => profile.maxLiveP95Ms)
				),
				maxProviderP95Ms: maxNumber(
					profiles.map((profile) => profile.maxProviderP95Ms)
				),
				maxTurnP95Ms: maxNumber(
					profiles.map((profile) => profile.maxTurnP95Ms)
				),
				providers: aggregateProofTrendProviders(
					profiles.flatMap((profile) => profile.providers ?? [])
				),
				runtimeChannel: aggregateProofTrendRuntimeChannel(
					profiles
						.map((profile) => profile.runtimeChannel)
						.filter(
							(
								channel
							): channel is VoiceProofTrendRuntimeChannelSummary =>
								channel !== undefined
						)
				)
			};

			return {
				...aggregatedProfile,
				status: readProofTrendProfileStatus(aggregatedProfile, budgets)
			};
		}

		const runtimeChannel = aggregateProofTrendRuntimeChannel(
			reports
				.map((report) => readProofTrendRuntimeChannel(report))
				.filter(
					(channel) =>
						Object.values(channel).some((value) => value !== undefined)
				)
		);
		const derivedProfile = {
			description: definition.description,
			id: definition.id,
			label: definition.label,
			maxLiveP95Ms: addProofTrendProfileOffset(
				maxNumber(reports.map(readProofTrendMaxLiveP95)),
				definition.liveOffsetMs,
				definition.maxLiveP95Ms ?? liveCap
			),
			maxProviderP95Ms: addProofTrendProfileOffset(
				maxNumber(reports.map(readProofTrendMaxProviderP95)),
				definition.providerOffsetMs,
				definition.maxProviderP95Ms ?? providerCap
			),
			maxTurnP95Ms: addProofTrendProfileOffset(
				maxNumber(reports.map(readProofTrendMaxTurnP95)),
				definition.turnOffsetMs,
				definition.maxTurnP95Ms ?? turnCap
			),
			providers: readProofTrendProviders(reports),
			runtimeChannel:
				runtimeChannel === undefined
					? undefined
					: {
							maxBackpressureEvents: runtimeChannel.maxBackpressureEvents,
							maxFirstAudioLatencyMs: addProofTrendProfileOffset(
								runtimeChannel.maxFirstAudioLatencyMs,
								definition.runtimeOffsetMs,
								definition.maxRuntimeFirstAudioLatencyMs ??
									runtimeFirstAudioCap
							),
							maxInterruptionP95Ms: addProofTrendProfileOffset(
								runtimeChannel.maxInterruptionP95Ms,
								Math.ceil((definition.runtimeOffsetMs ?? 0) / 2),
								definition.maxRuntimeInterruptionP95Ms ??
									runtimeInterruptionCap
							),
							maxJitterMs: addProofTrendProfileOffset(
								runtimeChannel.maxJitterMs,
								Math.ceil((definition.runtimeOffsetMs ?? 0) / 4),
								definition.maxRuntimeJitterMs ?? runtimeJitterCap
							),
							maxTimestampDriftMs: addProofTrendProfileOffset(
								runtimeChannel.maxTimestampDriftMs,
								definition.runtimeOffsetMs,
								definition.maxRuntimeTimestampDriftMs ??
									runtimeTimestampDriftCap
							),
							samples: runtimeChannel.samples,
							status: runtimeChannel.status
						}
		};

		return {
			...derivedProfile,
			status: readProofTrendProfileStatus(derivedProfile, budgets)
		};
	});
};

const normalizeProviderStatus = (
	status: string | undefined
): VoiceProofTrendRecommendationStatus =>
	status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn';

const providerSortScore = (provider: VoiceProofTrendProviderRecommendation) => [
	recommendationStatusRank[provider.status],
	provider.p95Ms ?? Number.POSITIVE_INFINITY,
	provider.averageMs ?? Number.POSITIVE_INFINITY,
	provider.samples === undefined ? Number.POSITIVE_INFINITY : -provider.samples,
	provider.id
] as const;

const compareProviders = (
	left: VoiceProofTrendProviderRecommendation,
	right: VoiceProofTrendProviderRecommendation
) => {
	const leftScore = providerSortScore(left);
	const rightScore = providerSortScore(right);
	for (let index = 0; index < leftScore.length; index += 1) {
		const leftValue = leftScore[index];
		const rightValue = rightScore[index];
		if (typeof leftValue === 'number' && typeof rightValue === 'number') {
			if (leftValue !== rightValue) {
				return leftValue - rightValue;
			}
			continue;
		}
		const compared = String(leftValue).localeCompare(String(rightValue));
		if (compared !== 0) {
			return compared;
		}
	}
	return 0;
};

const summarizeProofTrendProviders = (
	report: VoiceProofTrendReport,
	budgetMs: number
): VoiceProofTrendProviderRecommendation[] => {
	const sourceProviders =
		report.summary.providers && report.summary.providers.length > 0
			? report.summary.providers
			: undefined;
	const providersById = new Map<string, VoiceProofTrendProviderSummary>();

	if (sourceProviders) {
		for (const provider of sourceProviders) {
			if (provider.id) {
				providersById.set(provider.id, provider);
			}
		}
	} else {
		for (const cycle of report.cycles) {
			for (const provider of cycle.providers ?? []) {
				if (!provider.id) {
					continue;
				}
				const existing = providersById.get(provider.id);
				providersById.set(provider.id, {
					averageMs: maxNumber([existing?.averageMs, provider.averageMs]),
					id: provider.id,
					label: existing?.label ?? provider.label,
					p50Ms: maxNumber([existing?.p50Ms, provider.p50Ms]),
					p95Ms: maxNumber([existing?.p95Ms, provider.p95Ms]),
					role: existing?.role ?? provider.role,
					samples: (existing?.samples ?? 0) + (provider.samples ?? 0),
					status:
						existing?.status === 'fail' || provider.status === 'fail'
							? 'fail'
							: existing?.status === 'warn' || provider.status === 'warn'
								? 'warn'
								: provider.status ?? existing?.status
				});
			}
		}
	}

	return [...providersById.values()]
		.map((provider) => {
			const status =
				provider.p95Ms === undefined
					? normalizeProviderStatus(provider.status)
					: withinBudget(provider.p95Ms, budgetMs)
						? normalizeProviderStatus(provider.status) === 'fail'
							? 'fail'
							: 'pass'
						: normalizeProviderStatus(provider.status) === 'fail'
							? 'fail'
							: 'warn';
			return {
				averageMs: provider.averageMs,
				id: provider.id,
				label: provider.label,
				nextMove:
					status === 'pass'
						? 'Eligible for latency-sensitive routing based on sustained proof.'
						: provider.p95Ms === undefined
							? 'Collect provider-specific latency samples before routing latency-sensitive traffic here.'
							: 'Keep as fallback or tune provider/model/runtime budgets before using for latency-sensitive routing.',
				p50Ms: provider.p50Ms,
				p95Ms: provider.p95Ms,
				rank: 0,
				role: provider.role,
				samples: provider.samples,
				status
			};
		})
		.sort(compareProviders)
		.map((provider, index) => ({ ...provider, rank: index + 1 }));
};

const shouldSwitchProvider = (
	current: VoiceProofTrendProviderRecommendation | undefined,
	best: VoiceProofTrendProviderRecommendation | undefined,
	options: VoiceProofTrendRecommendationOptions
) => {
	if (!current || !best || current.id === best.id || best.status !== 'pass') {
		return false;
	}
	if (current.p95Ms === undefined || best.p95Ms === undefined) {
		return false;
	}
	const minImprovementMs = options.providerSwitchMinImprovementMs ?? 100;
	const minImprovementRatio = options.providerSwitchMinImprovementRatio ?? 0.1;
	const improvementMs = current.p95Ms - best.p95Ms;
	const improvementRatio = current.p95Ms > 0 ? improvementMs / current.p95Ms : 0;
	return improvementMs >= minImprovementMs || improvementRatio >= minImprovementRatio;
};

const bestProviderByRole = (
	providers: readonly VoiceProofTrendProviderRecommendation[]
) => {
	const best = new Map<string, VoiceProofTrendProviderRecommendation>();
	for (const provider of providers) {
		const role = provider.role ?? provider.id;
		const existing = best.get(role);
		if (!existing || compareProviders(provider, existing) < 0) {
			best.set(role, provider);
		}
	}
	return [...best.values()].sort((left, right) =>
		String(left.role ?? left.id).localeCompare(String(right.role ?? right.id))
	);
};

const formatProviderMix = (
	providers: readonly VoiceProofTrendProviderRecommendation[]
) =>
	providers.length === 0
		? 'n/a'
		: providers
				.map((provider) =>
					provider.role &&
					!(provider.label ?? provider.id)
						.toLowerCase()
						.startsWith(provider.role.toLowerCase())
						? `${provider.role.toUpperCase()} ${provider.label ?? provider.id}`
						: (provider.label ?? provider.id)
				)
				.join(', ');

const buildProfileRecommendations = (
	report: VoiceProofTrendReport,
	budgets: typeof DEFAULT_RECOMMENDATION_BUDGETS
): VoiceProofTrendProfileRecommendation[] =>
	(report.summary.profiles ?? []).map((profile) => {
		const providers = summarizeProofTrendProviders(
			{
				...report,
				cycles: [],
				summary: {
					cycles: report.summary.cycles,
					maxLiveP95Ms: profile.maxLiveP95Ms,
					maxProviderP95Ms: profile.maxProviderP95Ms,
					maxTurnP95Ms: profile.maxTurnP95Ms,
					providers: profile.providers,
					runtimeChannel: profile.runtimeChannel
				}
			},
			budgets.maxProviderP95Ms
		);
		const bestProviders = bestProviderByRole(providers).filter(
			(provider) => provider.status === 'pass'
		);
		const hasRequiredProviderRoles =
			bestProviders.some((provider) => provider.role === 'llm') &&
			bestProviders.some((provider) => provider.role === 'stt') &&
			bestProviders.some((provider) => provider.role === 'tts');
		const runtimePass =
			(profile.runtimeChannel?.status === undefined ||
				profile.runtimeChannel.status === 'pass') &&
			(profile.runtimeChannel?.maxFirstAudioLatencyMs === undefined ||
				profile.runtimeChannel.maxFirstAudioLatencyMs <=
					budgets.maxRuntimeFirstAudioLatencyMs) &&
			(profile.runtimeChannel?.maxInterruptionP95Ms === undefined ||
				profile.runtimeChannel.maxInterruptionP95Ms <=
					budgets.maxRuntimeInterruptionP95Ms) &&
			(profile.runtimeChannel?.maxJitterMs === undefined ||
				profile.runtimeChannel.maxJitterMs <= budgets.maxRuntimeJitterMs) &&
			(profile.runtimeChannel?.maxTimestampDriftMs === undefined ||
				profile.runtimeChannel.maxTimestampDriftMs <=
					budgets.maxRuntimeTimestampDriftMs) &&
			(profile.runtimeChannel?.maxBackpressureEvents === undefined ||
				profile.runtimeChannel.maxBackpressureEvents <=
					budgets.maxRuntimeBackpressureEvents);
		const latencyPass =
			(profile.maxProviderP95Ms === undefined ||
				profile.maxProviderP95Ms <= budgets.maxProviderP95Ms) &&
			(profile.maxLiveP95Ms === undefined ||
				profile.maxLiveP95Ms <= budgets.maxLiveP95Ms) &&
			(profile.maxTurnP95Ms === undefined ||
				profile.maxTurnP95Ms <= budgets.maxTurnP95Ms);
		const status: VoiceProofTrendRecommendationStatus =
			profile.status === 'fail' || !runtimePass
				? 'fail'
				: !latencyPass || !hasRequiredProviderRoles
					? 'warn'
					: 'pass';
		return {
			bestProviders,
			id: profile.id,
			label: profile.label,
			nextMove:
				status === 'pass'
					? `Use this proven provider mix for ${profile.label ?? profile.id}: ${formatProviderMix(bestProviders)}.`
					: providers.length === 0
						? `Collect provider-specific sustained samples for ${profile.label ?? profile.id}.`
						: `Tune latency/runtime budgets for ${profile.label ?? profile.id} before promoting this profile.`,
			providerComparisonCount: providers.length,
			recommendation:
				status === 'pass'
					? `Profile ready: ${profile.label ?? profile.id}`
					: `Profile needs proof: ${profile.label ?? profile.id}`,
			status
		};
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
	const providers = summarizeProofTrendProviders(report, budgets.maxProviderP95Ms);
	const bestProvider = providers.find((provider) => provider.status === 'pass') ?? providers[0];
	const bestProviders = bestProviderByRole(providers).filter(
		(provider) => provider.status === 'pass'
	);
	const currentProvider = options.currentProviderId
		? providers.find((provider) => provider.id === options.currentProviderId)
		: undefined;
	const hasSingleProviderRole = new Set(
		bestProviders.map((provider) => provider.role ?? provider.id)
	).size <= 1;
	const bestComparableProvider = currentProvider?.role
		? bestProviders.find((provider) => provider.role === currentProvider.role)
		: bestProvider;
	const providerSwitchRecommended = shouldSwitchProvider(
		currentProvider,
		bestComparableProvider,
		options
	);
	const profileRecommendations = buildProfileRecommendations(
		report,
		budgets
	);
	const recommendations: VoiceProofTrendRecommendation[] = [];
	const issues: string[] = [];

	if (report.ok !== true) {
		issues.push(`Proof trend report is ${report.status}; recommendations need a fresh passing trend artifact.`);
	}

	recommendations.push({
		evidence: {
			bestProviderId:
				currentProvider || hasSingleProviderRole
					? (bestComparableProvider?.id ?? bestProvider?.id)
					: undefined,
			bestProviderMix: formatProviderMix(bestProviders),
			bestProviderP95Ms:
				currentProvider || hasSingleProviderRole
					? (bestComparableProvider?.p95Ms ?? bestProvider?.p95Ms)
					: undefined,
			budgetMs: budgets.maxProviderP95Ms,
			currentProviderId: currentProvider?.id ?? options.currentProviderId,
			currentProviderP95Ms: currentProvider?.p95Ms,
			providerComparisonCount: providers.length,
			providerP95Ms: maxProviderP95Ms
		},
		nextMove:
			providers.length > 0
				? providerSwitchRecommended
					? `Route latency-sensitive ${currentProvider?.role ?? 'provider'} traffic to ${bestComparableProvider?.label ?? bestComparableProvider?.id} for this call profile and keep the current path as fallback.`
					: bestProviders.length > 0
						? `Use the fastest proven provider mix for this call profile: ${formatProviderMix(bestProviders)}.`
						: 'Collect provider-specific sustained samples before making provider-specific routing decisions.'
				: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
					? 'Keep the current provider route for latency-sensitive turns and keep collecting sustained proof.'
					: 'Route latency-sensitive turns to a faster provider profile or tighten fallback/circuit-breaker budgets before promotion.',
		providerId: providerSwitchRecommended
			? bestComparableProvider?.id
			: bestProviders.length === 1
				? bestProviders[0]?.id
				: undefined,
		recommendation:
			providers.length > 0
				? providerSwitchRecommended
					? `Switch latency-sensitive ${currentProvider?.role ?? 'provider'} routing to ${bestComparableProvider?.label ?? bestComparableProvider?.id}`
					: bestProviders.length > 0
						? 'Prefer the fastest proven provider mix for this call profile'
						: 'Collect provider-specific latency samples'
				: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
					? 'Keep current provider path'
					: 'Change provider routing for latency-sensitive traffic',
		role:
			currentProvider || hasSingleProviderRole
				? bestComparableProvider?.role
				: undefined,
		status:
			providers.length > 0
				? providerSwitchRecommended
					? 'warn'
					: bestProviders.length > 0
						? 'pass'
						: bestProvider?.status ?? 'fail'
				: withinBudget(maxProviderP95Ms, budgets.maxProviderP95Ms)
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
	const profileStatus = worstRecommendationStatus(
		profileRecommendations.map((profile) => ({
			evidence: {},
			nextMove: profile.nextMove,
			recommendation: profile.recommendation,
			status: profile.status,
			surface: 'provider-path'
		}))
	);
	const combinedStatus =
		recommendationStatusRank[profileStatus] > recommendationStatusRank[status]
			? profileStatus
			: status;

	return {
		bestProvider,
		bestProviders,
		generatedAt: new Date().toISOString(),
		issues,
		ok: combinedStatus !== 'fail',
		profiles: profileRecommendations,
		providers,
		recommendations,
		source: report.source || report.outputDir || report.runId || 'proof-trends',
		status: combinedStatus,
		summary: {
			keepCurrentProviderPath:
				!providerSwitchRecommended &&
				recommendations.find((item) => item.surface === 'provider-path')?.status !==
					'fail',
			keepCurrentRuntimeChannel:
				recommendations.find((item) => item.surface === 'runtime-channel')
					?.status === 'pass',
			providerComparisonCount: providers.length,
			recommendedActions: recommendations.filter((item) => item.status !== 'pass')
				.length,
			switchRecommended: providerSwitchRecommended
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
	`- Best provider mix: ${formatProviderMix(report.bestProviders)}`,
	`- Provider comparisons: ${String(report.summary.providerComparisonCount)}`,
	`- Recommended actions: ${String(report.summary.recommendedActions)}`,
	'',
	'| Surface | Status | Recommendation | Next move |',
	'| --- | --- | --- | --- |',
	...report.recommendations.map(
		(recommendation) =>
			`| ${escapeMarkdown(recommendation.surface)} | ${recommendation.status} | ${escapeMarkdown(recommendation.recommendation)} | ${escapeMarkdown(recommendation.nextMove)} |`
	),
	'',
	'## Provider Comparison',
	'',
	'| Rank | Provider | Role | Status | P95 | Samples | Next move |',
	'| ---: | --- | --- | --- | ---: | ---: | --- |',
	...(report.providers.length
		? report.providers.map(
				(provider) =>
					`| ${String(provider.rank)} | ${escapeMarkdown(provider.label ?? provider.id)} | ${escapeMarkdown(provider.role ?? 'n/a')} | ${provider.status} | ${provider.p95Ms === undefined ? 'n/a' : String(provider.p95Ms)} | ${provider.samples === undefined ? 'n/a' : String(provider.samples)} | ${escapeMarkdown(provider.nextMove)} |`
			)
		: ['| n/a | n/a | n/a | n/a | n/a | n/a | No provider-specific samples were present. |']),
	'',
	'## Benchmark Profiles',
	'',
	'| Profile | Status | Provider mix | Next move |',
	'| --- | --- | --- | --- |',
	...(report.profiles.length
		? report.profiles.map(
				(profile) =>
					`| ${escapeMarkdown(profile.label ?? profile.id)} | ${profile.status} | ${escapeMarkdown(formatProviderMix(profile.bestProviders))} | ${escapeMarkdown(profile.nextMove)} |`
			)
		: ['| n/a | n/a | n/a | No benchmark profiles were present. |']),
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
	const providerRows =
		report.providers.length === 0
			? '<li>No provider-specific samples were present.</li>'
			: report.providers
					.map(
						(provider) =>
							`<li><strong>#${String(provider.rank)} ${escapeHtml(provider.label ?? provider.id)}</strong><span>${escapeHtml(provider.role ?? 'provider')} · ${escapeHtml(provider.status)} · p95 ${escapeHtml(provider.p95Ms ?? 'n/a')}ms · ${escapeHtml(provider.samples ?? 'n/a')} sample(s)</span><small>${escapeHtml(provider.nextMove)}</small></li>`
					)
					.join('');
	const profileRows =
		report.profiles.length === 0
			? '<li>No benchmark profiles were present.</li>'
			: report.profiles
					.map(
						(profile) =>
							`<li><strong>${escapeHtml(profile.label ?? profile.id)}</strong><span>${escapeHtml(profile.status)} · ${escapeHtml(formatProviderMix(profile.bestProviders))}</span><small>${escapeHtml(profile.nextMove)}</small></li>`
					)
					.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,article{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.7rem);letter-spacing:-.06em;line-height:.92;margin:.2rem 0 1rem}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill{border:1px solid #42534a;border-radius:999px;padding:8px 12px}.pass{border-color:rgba(34,197,94,.55)}.warn{border-color:rgba(245,158,11,.7)}.fail{border-color:rgba(239,68,68,.75)}pre{background:#0b1110;border-radius:14px;overflow:auto;padding:12px}a{color:#5eead4}li{margin:.45rem 0}li span,li small{display:block;color:#c9d3ca}</style></head><body><main><section class="hero"><p class="eyebrow">Sustained proof recommendations</p><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.source)}.</p><div class="summary"><span class="pill">Status ${escapeHtml(report.status)}</span><span class="pill">Provider ${report.summary.keepCurrentProviderPath ? 'keep' : 'change'}</span><span class="pill">Best mix ${escapeHtml(formatProviderMix(report.bestProviders))}</span><span class="pill">Profiles ${String(report.profiles.length)}</span><span class="pill">Runtime ${report.summary.keepCurrentRuntimeChannel ? 'keep' : 'tune'}</span><span class="pill">${String(report.summary.recommendedActions)} action(s)</span></div></section>${cards}<section class="hero"><h2>Benchmark Profiles</h2><ul>${profileRows}</ul></section><section class="hero"><h2>Provider Comparison</h2><ul>${providerRows}</ul></section><section class="hero"><h2>Issues</h2><ul>${issues}</ul></section></main></body></html>`;
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
