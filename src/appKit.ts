import { Elysia } from 'elysia';
import {
	createVoiceAssistantHealthRoutes,
	type VoiceAssistantHealthRoutesOptions
} from './assistantHealth';
import {
	createVoiceDiagnosticsRoutes,
	type VoiceDiagnosticsRoutesOptions
} from './diagnosticsRoutes';
import {
	createVoiceEvalRoutes,
	runVoiceScenarioFixtureEvals,
	runVoiceScenarioEvals,
	type VoiceEvalRoutesOptions,
	type VoiceEvalLink
} from './evalRoutes';
import {
	createVoiceHandoffHealthRoutes,
	summarizeVoiceHandoffHealth,
	type VoiceHandoffHealthRoutesOptions
} from './handoffHealth';
import {
	createVoiceOpsConsoleRoutes,
	type VoiceOpsConsoleLink,
	type VoiceOpsConsoleRoutesOptions
} from './opsConsoleRoutes';
import {
	createVoiceProviderHealthRoutes,
	summarizeVoiceProviderHealth,
	type VoiceProviderHealthRoutesOptions
} from './providerHealth';
import {
	createVoiceProviderCapabilityRoutes,
	type VoiceProviderCapabilityRoutesOptions
} from './providerCapabilities';
import {
	createVoiceProductionReadinessRoutes,
	type VoiceProductionReadinessRoutesOptions
} from './productionReadiness';
import {
	createVoiceQualityRoutes,
	evaluateVoiceQuality,
	type VoiceQualityLink,
	type VoiceQualityRoutesOptions
} from './qualityRoutes';
import {
	createVoiceResilienceRoutes,
	type VoiceResilienceLink,
	type VoiceResilienceRoutesOptions
} from './resilienceRoutes';
import {
	createVoiceSessionListRoutes,
	createVoiceSessionReplayRoutes,
	summarizeVoiceSessions,
	type VoiceSessionListRoutesOptions,
	type VoiceSessionReplayRoutesOptions
} from './sessionReplay';
import {
	filterVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventStore
} from './trace';

export type VoiceAppKitSurface =
	| 'assistantHealth'
	| 'diagnostics'
	| 'evals'
	| 'handoffs'
	| 'opsConsole'
	| 'providerCapabilities'
	| 'providerHealth'
	| 'productionReadiness'
	| 'quality'
	| 'resilience'
	| 'sessionReplay'
	| 'sessions';

export type VoiceAppKitLink = VoiceEvalLink & {
	description?: string;
	statusHref?: string;
};

export type VoiceAppKitRoutesOptions<TProvider extends string = string> = {
	appStatus?: false | VoiceAppKitStatusOptions;
	assistantHealth?: false | Partial<VoiceAssistantHealthRoutesOptions<TProvider>>;
	diagnostics?: false | Partial<Omit<VoiceDiagnosticsRoutesOptions, 'store'>>;
	evals?: false | Partial<VoiceEvalRoutesOptions>;
	handoffs?: false | Partial<VoiceHandoffHealthRoutesOptions>;
	headers?: HeadersInit;
	links?: VoiceAppKitLink[];
	llmProviders?: readonly TProvider[];
	name?: string;
	opsConsole?: false | Partial<VoiceOpsConsoleRoutesOptions>;
	providerCapabilities?:
		| false
		| Partial<VoiceProviderCapabilityRoutesOptions<TProvider>>;
	providerHealth?: false | Partial<VoiceProviderHealthRoutesOptions<TProvider>>;
	productionReadiness?: false | Partial<VoiceProductionReadinessRoutesOptions>;
	quality?: false | Partial<VoiceQualityRoutesOptions>;
	resilience?: false | Partial<VoiceResilienceRoutesOptions>;
	sessionReplay?: false | Partial<VoiceSessionReplayRoutesOptions>;
	sessions?: false | Partial<VoiceSessionListRoutesOptions>;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	ttsProviders?: readonly string[];
};

export type VoiceAppKitStatus = 'pass' | 'fail';

export type VoiceAppKitStatusOptions = {
	include?: {
		handoffs?: boolean;
		providers?: boolean;
		quality?: boolean;
		sessions?: boolean;
		workflows?: boolean;
	};
	path?: string;
	preferFixtureWorkflows?: boolean;
};

export type VoiceAppKitStatusReport = {
	checkedAt: number;
	failed: number;
	links: VoiceAppKitLink[];
	passed: number;
	status: VoiceAppKitStatus;
	surfaces: {
		handoffs?: {
			failed: number;
			status: VoiceAppKitStatus;
			total: number;
		};
		providers?: {
			degraded: number;
			status: VoiceAppKitStatus;
			total: number;
		};
		quality?: {
			status: VoiceAppKitStatus;
		};
		sessions?: {
			failed: number;
			status: VoiceAppKitStatus;
			total: number;
		};
		workflows?: {
			failed: number;
			source: 'fixtures' | 'live';
			status: VoiceAppKitStatus;
			total: number;
		};
	};
	total: number;
};

export type VoiceAppKitRoutes<TProvider extends string = string> = {
	links: VoiceAppKitLink[];
	routes: Elysia;
	surfaces: VoiceAppKitSurface[];
	use: Elysia['use'];
};

const DEFAULT_LINKS: VoiceAppKitLink[] = [
	{
		description: 'Integrated voice operations console.',
		href: '/ops-console',
		label: 'Ops Console'
	},
	{
		description: 'Production quality gates.',
		href: '/quality',
		label: 'Quality',
		statusHref: '/quality/status'
	},
	{
		description: 'Replay sessions against evals and workflow contracts.',
		href: '/evals',
		label: 'Evals',
		statusHref: '/evals/status'
	},
	{
		description: 'Provider routing, fallback, and resilience controls.',
		href: '/resilience',
		label: 'Resilience'
	},
	{
		description: 'One JSON/HTML production readiness rollup.',
		href: '/production-readiness',
		label: 'Production Readiness',
		statusHref: '/api/production-readiness'
	},
	{
		description: 'Recent sessions and replay links.',
		href: '/sessions',
		label: 'Sessions'
	},
	{
		description: 'Handoff delivery health.',
		href: '/handoffs',
		label: 'Handoffs'
	},
	{
		description: 'Redacted traces and bug-report exports.',
		href: '/diagnostics',
		label: 'Diagnostics'
	}
];

const resolveLinks = (links?: VoiceAppKitLink[]) => links ?? DEFAULT_LINKS;

const toBasicLinks = (links: VoiceAppKitLink[]) =>
	links.map(({ href, label }) => ({ href, label }));

const toOpsLinks = (links: VoiceAppKitLink[]): VoiceOpsConsoleLink[] =>
	links.map((link) => ({
		description: link.description ?? link.label,
		href: link.href,
		label: link.label,
		statusHref: link.statusHref
	}));

const toResilienceLinks = (links: VoiceAppKitLink[]): VoiceResilienceLink[] =>
	links.map(({ href, label }) => ({ href, label }));

const countStatus = (statuses: VoiceAppKitStatus[]) => ({
	failed: statuses.filter((status) => status === 'fail').length,
	passed: statuses.filter((status) => status === 'pass').length,
	total: statuses.length
});

export const summarizeVoiceAppKitStatus = async <
	TProvider extends string = string
>(
	options: VoiceAppKitRoutesOptions<TProvider>
): Promise<VoiceAppKitStatusReport> => {
	const links = resolveLinks(options.links);
	const statusOptions =
		options.appStatus && typeof options.appStatus === 'object'
			? options.appStatus
			: undefined;
	const evalOptions = options.evals === false ? undefined : options.evals;
	const include = statusOptions?.include;
	const shouldInclude = (surface: keyof NonNullable<typeof include>) =>
		include?.[surface] !== false;
	const events: StoredVoiceTraceEvent[] = filterVoiceTraceEvents(
		await options.store.list()
	);
	const [quality, workflows, providers, sessions, handoffs] = await Promise.all([
		options.quality === false || !shouldInclude('quality')
			? undefined
			: evaluateVoiceQuality({
					events,
					thresholds: options.quality?.thresholds
				}),
		!evalOptions || !shouldInclude('workflows')
			? undefined
			: (async () => {
					const fixtureReport = await runVoiceScenarioFixtureEvals({
						fixtures: evalOptions.fixtures,
						fixtureStore: evalOptions.fixtureStore,
						scenarios: evalOptions.scenarios
					});

					if (
						(statusOptions?.preferFixtureWorkflows ?? true) &&
						fixtureReport.total > 0
					) {
						return {
							failed: fixtureReport.failed,
							source: 'fixtures' as const,
							status: fixtureReport.status,
							total: fixtureReport.total
						};
					}

					const liveReport = await runVoiceScenarioEvals({
						events,
						scenarios: evalOptions.scenarios
					});

					return {
						failed: liveReport.failed,
						source: 'live' as const,
						status: liveReport.status,
						total: liveReport.total
					};
				})(),
		options.providerHealth === false || !shouldInclude('providers')
			? undefined
			: summarizeVoiceProviderHealth({
					events,
					providers: options.llmProviders
				}),
		options.sessions === false || !shouldInclude('sessions')
			? undefined
			: summarizeVoiceSessions({
					events
				}),
		options.handoffs === false || !shouldInclude('handoffs')
			? undefined
			: summarizeVoiceHandoffHealth({
					events
				})
	]);
	const surfaces: VoiceAppKitStatusReport['surfaces'] = {};
	const statuses: VoiceAppKitStatus[] = [];

	if (quality) {
		surfaces.quality = { status: quality.status };
		statuses.push(quality.status);
	}
	if (workflows) {
		const status = workflows.status;
		surfaces.workflows = {
			failed: workflows.failed,
			source: workflows.source,
			status,
			total: workflows.total
		};
		statuses.push(status);
	}
	if (providers) {
		const degraded = providers.filter(
			(provider) =>
				provider.status === 'degraded' ||
				provider.status === 'rate-limited' ||
				provider.status === 'suppressed'
		).length;
		const status = degraded > 0 ? 'fail' : 'pass';
		surfaces.providers = {
			degraded,
			status,
			total: providers.length
		};
		statuses.push(status);
	}
	if (sessions) {
		const failed = sessions.filter((session) => session.status === 'failed').length;
		const status = failed > 0 ? 'fail' : 'pass';
		surfaces.sessions = {
			failed,
			status,
			total: sessions.length
		};
		statuses.push(status);
	}
	if (handoffs) {
		const status = handoffs.failed > 0 ? 'fail' : 'pass';
		surfaces.handoffs = {
			failed: handoffs.failed,
			status,
			total: handoffs.total
		};
		statuses.push(status);
	}

	return {
		checkedAt: Date.now(),
		links,
		status: statuses.includes('fail') ? 'fail' : 'pass',
		surfaces,
		...countStatus(statuses)
	};
};

export const createVoiceAppKitRoutes = <TProvider extends string = string>(
	options: VoiceAppKitRoutesOptions<TProvider>
): VoiceAppKitRoutes<TProvider> => {
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-app-kit'
	});
	const links = resolveLinks(options.links);
	const common = {
		headers: options.headers,
		store: options.store
	};
	const surfaces: VoiceAppKitSurface[] = [];

	if (options.appStatus !== false) {
		routes.get(options.appStatus?.path ?? '/app-kit/status', () =>
			summarizeVoiceAppKitStatus(options)
		);
	}
	if (options.providerHealth !== false) {
		surfaces.push('providerHealth');
		routes.use(
			createVoiceProviderHealthRoutes<TProvider>({
				...common,
				providers: options.llmProviders,
				...options.providerHealth
			})
		);
	}
	if (options.providerCapabilities !== false) {
		surfaces.push('providerCapabilities');
		routes.use(
			createVoiceProviderCapabilityRoutes<TProvider>({
				...common,
				htmlPath: '/provider-capabilities',
				llmProviders: options.llmProviders,
				path: '/api/provider-capabilities',
				sttProviders: options.sttProviders as readonly TProvider[] | undefined,
				title: options.title
					? `${options.title} Provider Capabilities`
					: undefined,
				ttsProviders: options.ttsProviders as readonly TProvider[] | undefined,
				...options.providerCapabilities
			})
		);
	}
	if (options.assistantHealth !== false) {
		surfaces.push('assistantHealth');
		routes.use(
			createVoiceAssistantHealthRoutes<TProvider>({
				...common,
				providers: options.llmProviders,
				...options.assistantHealth
			})
		);
	}
	if (options.quality !== false) {
		surfaces.push('quality');
		routes.use(
			createVoiceQualityRoutes({
				...common,
				links: toBasicLinks(links) as VoiceQualityLink[],
				...options.quality
			})
		);
	}
	if (options.evals !== false) {
		surfaces.push('evals');
		routes.use(
			createVoiceEvalRoutes({
				...common,
				links: toBasicLinks(links),
				title: options.title ? `${options.title} Evals` : undefined,
				...options.evals
			})
		);
	}
	if (options.sessions !== false) {
		surfaces.push('sessions');
		routes.use(
			createVoiceSessionListRoutes({
				...common,
				htmlPath: '/sessions',
				path: '/api/voice-sessions',
				replayHref: '/sessions/:sessionId',
				...options.sessions
			})
		);
	}
	if (options.sessionReplay !== false) {
		surfaces.push('sessionReplay');
		routes.use(
			createVoiceSessionReplayRoutes({
				...common,
				htmlPath: '/sessions/:sessionId',
				path: '/api/voice-sessions/:sessionId/replay',
				...options.sessionReplay
			})
		);
	}
	if (options.handoffs !== false) {
		surfaces.push('handoffs');
		routes.use(
			createVoiceHandoffHealthRoutes({
				...common,
				htmlPath: '/handoffs',
				path: '/api/voice-handoffs',
				...options.handoffs
			})
		);
	}
	if (options.diagnostics !== false) {
		surfaces.push('diagnostics');
		routes.use(
			createVoiceDiagnosticsRoutes({
				...common,
				path: '/diagnostics',
				title: options.title
					? `${options.title} Diagnostics`
					: undefined,
				...options.diagnostics
			})
		);
	}
	if (options.resilience !== false) {
		surfaces.push('resilience');
		routes.use(
			createVoiceResilienceRoutes({
				...common,
				links: toResilienceLinks(links),
				llmProviders: options.llmProviders,
				sttProviders: options.sttProviders,
				title: options.title
					? `${options.title} Resilience`
					: undefined,
				ttsProviders: options.ttsProviders,
				...options.resilience
			})
		);
	}
	if (options.productionReadiness !== false) {
		surfaces.push('productionReadiness');
		routes.use(
			createVoiceProductionReadinessRoutes({
				...common,
				links: {
					handoffs: '/handoffs',
					quality: '/quality',
					resilience: '/resilience',
					sessions: '/sessions'
				},
				llmProviders: options.llmProviders,
				sttProviders: options.sttProviders,
				title: options.title
					? `${options.title} Production Readiness`
					: undefined,
				ttsProviders: options.ttsProviders,
				...options.productionReadiness
			})
		);
	}
	if (options.opsConsole !== false) {
		surfaces.push('opsConsole');
		routes.use(
			createVoiceOpsConsoleRoutes({
				...common,
				links: toOpsLinks(links),
				llmProviders: options.llmProviders,
				sttProviders: options.sttProviders,
				title: options.title,
				ttsProviders: options.ttsProviders,
				...options.opsConsole
			})
		);
	}

	return {
		links,
		routes,
		surfaces,
		use: routes.use.bind(routes)
	};
};

export const createVoiceAppKit = createVoiceAppKitRoutes;
