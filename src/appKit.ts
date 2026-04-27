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
	type VoiceEvalRoutesOptions,
	type VoiceEvalLink
} from './evalRoutes';
import {
	createVoiceHandoffHealthRoutes,
	type VoiceHandoffHealthRoutesOptions
} from './handoffHealth';
import {
	createVoiceOpsConsoleRoutes,
	type VoiceOpsConsoleLink,
	type VoiceOpsConsoleRoutesOptions
} from './opsConsoleRoutes';
import {
	createVoiceProviderHealthRoutes,
	type VoiceProviderHealthRoutesOptions
} from './providerHealth';
import {
	createVoiceQualityRoutes,
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
	type VoiceSessionListRoutesOptions,
	type VoiceSessionReplayRoutesOptions
} from './sessionReplay';
import type { VoiceTraceEventStore } from './trace';

export type VoiceAppKitSurface =
	| 'assistantHealth'
	| 'diagnostics'
	| 'evals'
	| 'handoffs'
	| 'opsConsole'
	| 'providerHealth'
	| 'quality'
	| 'resilience'
	| 'sessionReplay'
	| 'sessions';

export type VoiceAppKitLink = VoiceEvalLink & {
	description?: string;
	statusHref?: string;
};

export type VoiceAppKitRoutesOptions<TProvider extends string = string> = {
	assistantHealth?: false | Partial<VoiceAssistantHealthRoutesOptions<TProvider>>;
	diagnostics?: false | Partial<Omit<VoiceDiagnosticsRoutesOptions, 'store'>>;
	evals?: false | Partial<VoiceEvalRoutesOptions>;
	handoffs?: false | Partial<VoiceHandoffHealthRoutesOptions>;
	headers?: HeadersInit;
	links?: VoiceAppKitLink[];
	llmProviders?: readonly TProvider[];
	name?: string;
	opsConsole?: false | Partial<VoiceOpsConsoleRoutesOptions>;
	providerHealth?: false | Partial<VoiceProviderHealthRoutesOptions<TProvider>>;
	quality?: false | Partial<VoiceQualityRoutesOptions>;
	resilience?: false | Partial<VoiceResilienceRoutesOptions>;
	sessionReplay?: false | Partial<VoiceSessionReplayRoutesOptions>;
	sessions?: false | Partial<VoiceSessionListRoutesOptions>;
	store: VoiceTraceEventStore;
	sttProviders?: readonly string[];
	title?: string;
	ttsProviders?: readonly string[];
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
