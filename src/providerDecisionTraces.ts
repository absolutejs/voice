import { Elysia } from 'elysia';
import {
	listVoiceRoutingEvents,
	type VoiceRoutingEventKind
} from './resilienceRoutes';
import type {
	StoredVoiceTraceEvent,
	VoiceTraceEvent,
	VoiceTraceEventStore
} from './trace';

export type VoiceProviderDecisionStatus =
	| 'degraded'
	| 'error'
	| 'fallback'
	| 'selected'
	| 'skipped'
	| 'success';

export type VoiceProviderDecisionTrace = {
	at: number;
	elapsedMs?: number;
	error?: string;
	fallbackProvider?: string;
	kind?: VoiceRoutingEventKind;
	latencyBudgetMs?: number;
	provider: string;
	reason: string;
	scenarioId?: string;
	selectedProvider?: string;
	sessionId: string;
	status: VoiceProviderDecisionStatus;
	surface: string;
	turnId?: string;
};

export type VoiceProviderDecisionTraceInput = Omit<
	VoiceProviderDecisionTrace,
	'at' | 'reason' | 'sessionId' | 'surface'
> & {
	at?: number;
	reason?: string;
	sessionId?: string;
	surface?: string;
};

export type VoiceProviderDecisionTraceIssue = {
	code: string;
	message: string;
	status: 'fail' | 'warn';
	surface?: string;
};

export type VoiceProviderDecisionSurfaceReport = {
	degraded: number;
	decisions: number;
	errors: number;
	fallbacks: number;
	issues: VoiceProviderDecisionTraceIssue[];
	latestAt?: number;
	providers: string[];
	reasons: string[];
	selected: number;
	status: 'fail' | 'pass' | 'warn';
	surface: string;
};

export type VoiceProviderDecisionTraceReport = {
	checkedAt: number;
	decisions: VoiceProviderDecisionTrace[];
	issues: VoiceProviderDecisionTraceIssue[];
	status: 'fail' | 'pass' | 'warn';
	summary: {
		degraded: number;
		decisions: number;
		errors: number;
		fallbacks: number;
		providers: number;
		selected: number;
		surfaces: number;
	};
	surfaces: VoiceProviderDecisionSurfaceReport[];
};

export type VoiceProviderDecisionTraceReportOptions = {
	events?: StoredVoiceTraceEvent[] | VoiceProviderDecisionTrace[];
	maxAgeMs?: number;
	minDegraded?: number;
	minDecisions?: number;
	minFallbacks?: number;
	now?: number;
	requiredFallbackProviders?: readonly string[];
	requiredProviders?: readonly string[];
	requiredReasonIncludes?: readonly string[];
	requiredSurfaces?: readonly string[];
	requiredStatuses?: readonly VoiceProviderDecisionStatus[];
	sessionId?: string;
	store?: VoiceTraceEventStore;
};

export type VoiceProviderDecisionTraceRoutesOptions =
	VoiceProviderDecisionTraceReportOptions & {
		headers?: HeadersInit;
		htmlPath?: false | string;
		markdownPath?: false | string;
		name?: string;
		path?: string;
		render?: (report: VoiceProviderDecisionTraceReport) => string | Promise<string>;
		title?: string;
	};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const isDecisionTrace = (
	event: unknown
): event is VoiceProviderDecisionTrace =>
	Boolean(
		event &&
			typeof event === 'object' &&
			'provider' in event &&
			'reason' in event &&
			'sessionId' in event &&
			'status' in event &&
			'surface' in event
	);

const surfaceForKind = (kind: VoiceRoutingEventKind | undefined) => {
	switch (kind) {
		case 'stt':
			return 'live-stt';
		case 'tts':
			return 'telephony-tts';
		case 'llm':
		default:
			return 'live-call';
	}
};

const statusRank = { fail: 2, pass: 0, warn: 1 } as const;

const reportStatus = (issues: readonly VoiceProviderDecisionTraceIssue[]) =>
	issues.reduce<'fail' | 'pass' | 'warn'>(
		(status, issue) =>
			statusRank[issue.status] > statusRank[status] ? issue.status : status,
		'pass'
	);

const uniqueSorted = (values: Array<string | undefined>) =>
	[
		...new Set(
			values.filter((value): value is string => typeof value === 'string')
		)
	].sort();

export const createVoiceProviderDecisionTraceEvent = (
	input: VoiceProviderDecisionTraceInput
): VoiceTraceEvent => {
	const surface = input.surface ?? surfaceForKind(input.kind);
	const reason =
		input.reason ??
		(input.status === 'degraded'
			? `Provider ${input.provider} degraded to ${input.fallbackProvider ?? input.selectedProvider ?? 'lower-fidelity fallback'}.`
			: input.status === 'fallback'
			? `Fallback from ${input.provider} to ${input.fallbackProvider ?? input.selectedProvider ?? 'next provider'}.`
			: input.status === 'error'
				? `Provider ${input.provider} errored before recovery.`
				: input.status === 'skipped'
					? `Provider ${input.provider} was skipped by policy.`
					: `Provider ${input.selectedProvider ?? input.provider} selected by policy.`);

	return {
		at: input.at ?? Date.now(),
		payload: {
			...input,
			providerDecision: true,
			reason,
			surface
		},
		scenarioId: input.scenarioId,
		sessionId: input.sessionId ?? `${surface}-provider-decision`,
		turnId: input.turnId,
		type: 'provider.decision'
	};
};

export const listVoiceProviderDecisionTraces = (
	events: StoredVoiceTraceEvent[] | VoiceProviderDecisionTrace[]
): VoiceProviderDecisionTrace[] => {
	if (events.every(isDecisionTrace)) {
		return [...events].sort((left, right) => right.at - left.at);
	}

	const traceEvents = events as StoredVoiceTraceEvent[];
	const explicit = traceEvents
		.filter((event) => event.type === 'provider.decision')
		.map((event): VoiceProviderDecisionTrace | undefined => {
			const provider = getString(event.payload.provider);
			const status = getString(event.payload.status);
			const surface = getString(event.payload.surface);
			if (
				!provider ||
				!surface ||
				(status !== 'error' &&
					status !== 'fallback' &&
					status !== 'degraded' &&
					status !== 'selected' &&
					status !== 'skipped' &&
					status !== 'success')
			) {
				return undefined;
			}
			return {
				at: event.at,
				elapsedMs: getNumber(event.payload.elapsedMs),
				error: getString(event.payload.error),
				fallbackProvider: getString(event.payload.fallbackProvider),
				kind:
					event.payload.kind === 'llm' ||
					event.payload.kind === 'stt' ||
					event.payload.kind === 'tts'
						? event.payload.kind
						: undefined,
				latencyBudgetMs: getNumber(event.payload.latencyBudgetMs),
				provider,
				reason:
					getString(event.payload.reason) ??
					`Provider ${provider} emitted ${status}.`,
				scenarioId: event.scenarioId,
				selectedProvider: getString(event.payload.selectedProvider),
				sessionId: event.sessionId,
				status,
				surface,
				turnId: event.turnId
			};
		})
		.filter((event): event is VoiceProviderDecisionTrace => Boolean(event));
	const routing = listVoiceRoutingEvents(traceEvents).map(
		(event): VoiceProviderDecisionTrace => ({
			at: event.at,
			elapsedMs: event.elapsedMs,
			error: event.error,
			fallbackProvider: event.fallbackProvider,
			kind: event.kind,
			latencyBudgetMs: event.latencyBudgetMs,
			provider: event.provider ?? event.selectedProvider ?? 'unknown',
			reason:
				event.status === 'fallback'
					? `Fallback selected ${event.selectedProvider ?? event.fallbackProvider ?? 'next provider'} after ${event.provider ?? 'provider'} failed.`
					: event.status === 'error'
						? `Provider ${event.provider ?? 'unknown'} errored before fallback recovery.`
						: `Provider ${event.selectedProvider ?? event.provider ?? 'unknown'} completed successfully.`,
			scenarioId: event.scenarioId,
			selectedProvider: event.selectedProvider,
			sessionId: event.sessionId,
			status:
				event.status === 'fallback' || event.status === 'error'
					? event.status
					: 'success',
			surface:
				getString((event as unknown as Record<string, unknown>).surface) ??
				surfaceForKind(event.kind),
			turnId: event.turnId
		})
	);

	return [...explicit, ...routing].sort((left, right) => right.at - left.at);
};

export const buildVoiceProviderDecisionTraceReport = async (
	options: VoiceProviderDecisionTraceReportOptions
): Promise<VoiceProviderDecisionTraceReport> => {
	const now = options.now ?? Date.now();
	const rawEvents = options.events ?? (await options.store?.list()) ?? [];
	const decisions = listVoiceProviderDecisionTraces(rawEvents).filter((decision) => {
		if (options.sessionId && decision.sessionId !== options.sessionId) {
			return false;
		}
		if (options.maxAgeMs !== undefined && now - decision.at > options.maxAgeMs) {
			return false;
		}
		return true;
	});
	const surfaces = new Map<string, VoiceProviderDecisionTrace[]>();
	const issues: VoiceProviderDecisionTraceIssue[] = [];

	for (const decision of decisions) {
		const group = surfaces.get(decision.surface) ?? [];
		group.push(decision);
		surfaces.set(decision.surface, group);
	}

	for (const surface of options.requiredSurfaces ?? []) {
		if (!surfaces.has(surface)) {
			issues.push({
				code: 'voice.provider_decision_trace.surface_missing',
				message: `Surface ${surface} has no provider decision traces.`,
				status: 'fail',
				surface
			});
		}
	}

	const fallbackCount = decisions.filter(
		(decision) => decision.status === 'fallback'
	).length;
	const degradedCount = decisions.filter(
		(decision) => decision.status === 'degraded'
	).length;
	const statuses = new Set(decisions.map((decision) => decision.status));
	const providers = uniqueSorted(
		decisions.flatMap((decision) => [
			decision.provider,
			decision.selectedProvider,
			decision.fallbackProvider
		])
	);
	const fallbackProviders = uniqueSorted(
		decisions.flatMap((decision) => [
			decision.fallbackProvider,
			decision.status === 'fallback' || decision.status === 'degraded'
				? decision.selectedProvider
				: undefined
		])
	);

	if (
		options.minDecisions !== undefined &&
		decisions.length < options.minDecisions
	) {
		issues.push({
			code: 'voice.provider_decision_trace.min_decisions',
			message: `Found ${String(decisions.length)} provider decision trace(s); expected at least ${String(options.minDecisions)}.`,
			status: 'fail'
		});
	}

	if (
		options.minFallbacks !== undefined &&
		fallbackCount < options.minFallbacks
	) {
		issues.push({
			code: 'voice.provider_decision_trace.min_fallbacks',
			message: `Found ${String(fallbackCount)} provider fallback trace(s); expected at least ${String(options.minFallbacks)}.`,
			status: 'fail'
		});
	}

	if (
		options.minDegraded !== undefined &&
		degradedCount < options.minDegraded
	) {
		issues.push({
			code: 'voice.provider_decision_trace.min_degraded',
			message: `Found ${String(degradedCount)} provider degradation trace(s); expected at least ${String(options.minDegraded)}.`,
			status: 'fail'
		});
	}

	for (const status of options.requiredStatuses ?? []) {
		if (!statuses.has(status)) {
			issues.push({
				code: 'voice.provider_decision_trace.status_missing',
				message: `Missing provider decision status: ${status}.`,
				status: 'fail'
			});
		}
	}

	for (const provider of options.requiredProviders ?? []) {
		if (!providers.includes(provider)) {
			issues.push({
				code: 'voice.provider_decision_trace.provider_missing',
				message: `Missing provider decision provider: ${provider}.`,
				status: 'fail'
			});
		}
	}

	for (const provider of options.requiredFallbackProviders ?? []) {
		if (!fallbackProviders.includes(provider)) {
			issues.push({
				code: 'voice.provider_decision_trace.fallback_provider_missing',
				message: `Missing provider decision fallback provider: ${provider}.`,
				status: 'fail'
			});
		}
	}

	for (const phrase of options.requiredReasonIncludes ?? []) {
		if (!decisions.some((decision) => decision.reason.includes(phrase))) {
			issues.push({
				code: 'voice.provider_decision_trace.reason_missing',
				message: `Missing provider decision reason containing: ${phrase}.`,
				status: 'fail'
			});
		}
	}

	const surfaceReports = [...surfaces.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([surface, surfaceDecisions]) => {
			const surfaceIssues = issues.filter((issue) => issue.surface === surface);
			return {
				degraded: surfaceDecisions.filter(
					(decision) => decision.status === 'degraded'
				).length,
				decisions: surfaceDecisions.length,
				errors: surfaceDecisions.filter((decision) => decision.status === 'error')
					.length,
				fallbacks: surfaceDecisions.filter(
					(decision) => decision.status === 'fallback'
				).length,
				issues: surfaceIssues,
				latestAt: Math.max(...surfaceDecisions.map((decision) => decision.at)),
				providers: uniqueSorted(
					surfaceDecisions.flatMap((decision) => [
						decision.provider,
						decision.selectedProvider,
						decision.fallbackProvider
					])
				),
				reasons: uniqueSorted(surfaceDecisions.map((decision) => decision.reason)),
				selected: surfaceDecisions.filter(
					(decision) =>
						decision.status === 'selected' || decision.status === 'success'
				).length,
				status: reportStatus(surfaceIssues),
				surface
			} satisfies VoiceProviderDecisionSurfaceReport;
		});

	return {
		checkedAt: now,
		decisions,
		issues,
		status: reportStatus(issues),
		summary: {
			degraded: degradedCount,
			decisions: decisions.length,
			errors: decisions.filter((decision) => decision.status === 'error').length,
			fallbacks: fallbackCount,
			providers: providers.length,
			selected: decisions.filter(
				(decision) =>
					decision.status === 'selected' || decision.status === 'success'
			).length,
			surfaces: surfaces.size
		},
		surfaces: surfaceReports
	};
};

export const renderVoiceProviderDecisionTraceMarkdown = (
	report: VoiceProviderDecisionTraceReport
) => [
	'# Voice Provider Decision Traces',
	'',
	`Status: **${report.status}**`,
	`Decisions: ${String(report.summary.decisions)}`,
	`Providers: ${String(report.summary.providers)}`,
	`Fallbacks: ${String(report.summary.fallbacks)}`,
	`Degraded: ${String(report.summary.degraded)}`,
	`Errors: ${String(report.summary.errors)}`,
	'',
	'| Surface | Status | Decisions | Selected | Fallbacks | Degraded | Errors | Providers |',
	'| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
	...report.surfaces.map(
		(surface) =>
			`| ${surface.surface} | ${surface.status} | ${String(surface.decisions)} | ${String(surface.selected)} | ${String(surface.fallbacks)} | ${String(surface.degraded)} | ${String(surface.errors)} | ${surface.providers.join(', ')} |`
	),
	'',
	...report.issues.map((issue) => `- ${issue.status}: ${issue.message}`)
].join('\n');

export const renderVoiceProviderDecisionTraceHTML = (
	report: VoiceProviderDecisionTraceReport,
	title = 'Provider Decision Traces'
) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
main{max-width:1100px;margin:0 auto;padding:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.card,.surface{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:16px;box-shadow:0 12px 30px rgba(15,23,42,.06)}
.status{display:inline-flex;border-radius:999px;padding:4px 10px;font-weight:700;background:#dcfce7;color:#166534}
.status.fail{background:#fee2e2;color:#991b1b}.status.warn{background:#fef3c7;color:#92400e}
.surfaces{display:grid;gap:14px;margin-top:18px}.muted{color:#64748b}
code{background:#e2e8f0;border-radius:8px;padding:2px 6px}
</style>
</head>
<body>
<main>
<p class="status ${report.status}">${escapeHtml(report.status)}</p>
<h1>${escapeHtml(title)}</h1>
<p class="muted">Runtime proof for why providers were selected, skipped, failed, or recovered by fallback.</p>
<section class="grid">
<article class="card"><strong>${String(report.summary.decisions)}</strong><p>decisions</p></article>
<article class="card"><strong>${String(report.summary.providers)}</strong><p>providers</p></article>
<article class="card"><strong>${String(report.summary.fallbacks)}</strong><p>fallbacks</p></article>
<article class="card"><strong>${String(report.summary.degraded)}</strong><p>degraded</p></article>
<article class="card"><strong>${String(report.summary.errors)}</strong><p>errors</p></article>
</section>
<section class="surfaces">
${report.surfaces
	.map(
		(surface) => `<article class="surface">
<header><strong>${escapeHtml(surface.surface)}</strong> <span class="status ${surface.status}">${escapeHtml(surface.status)}</span></header>
<p>${String(surface.decisions)} decision(s), ${String(surface.fallbacks)} fallback(s), ${String(surface.degraded)} degraded decision(s), ${String(surface.errors)} error(s).</p>
<p class="muted">Providers: ${escapeHtml(surface.providers.join(', ') || 'none')}</p>
<p>${surface.reasons.map((reason) => `<code>${escapeHtml(reason)}</code>`).join(' ')}</p>
</article>`
	)
	.join('\n')}
</section>
</main>
</body>
</html>`;

export const createVoiceProviderDecisionTraceRoutes = (
	options: VoiceProviderDecisionTraceRoutesOptions
) => {
	const path = options.path ?? '/api/voice/provider-decisions';
	const htmlPath = options.htmlPath ?? '/voice/provider-decisions';
	const markdownPath = options.markdownPath ?? '/voice/provider-decisions.md';
	const headers = options.headers ?? {};
	const title = options.title ?? 'Provider Decision Traces';
	const report = () => buildVoiceProviderDecisionTraceReport(options);
	const app = new Elysia({ name: options.name ?? 'voice-provider-decisions' }).get(
		path,
		async () => new Response(JSON.stringify(await report(), null, 2), {
			headers: {
				'content-type': 'application/json; charset=utf-8',
				...headers
			}
		})
	);

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const body = options.render
				? await options.render(await report())
				: renderVoiceProviderDecisionTraceHTML(await report(), title);
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
				new Response(renderVoiceProviderDecisionTraceMarkdown(await report()), {
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						...headers
					}
				})
		);
	}

	return app;
};
