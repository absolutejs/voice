import { Elysia } from 'elysia';
import type {
	StoredVoiceTraceEvent,
	VoiceTraceEventStore
} from './trace';
import type {
	VoiceTelephonyContractReport,
	VoiceTelephonyProvider
} from './telephony/contract';

export type VoicePhoneAgentProductionSmokeRequirement =
	| 'assistant-response'
	| 'carrier-contract'
	| 'fresh-trace'
	| 'lifecycle-outcome'
	| 'media-started'
	| 'no-session-error'
	| 'transcript';

export type VoicePhoneAgentProductionSmokeIssue = {
	message: string;
	requirement: VoicePhoneAgentProductionSmokeRequirement;
	severity: 'error' | 'warning';
};

export type VoicePhoneAgentProductionSmokeReport<
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
> = {
	contract?: VoiceTelephonyContractReport<TProvider>;
	contractId: string;
	generatedAt: number;
	issues: VoicePhoneAgentProductionSmokeIssue[];
	maxAgeMs?: number;
	observed: {
		assistantResponses: number;
		carrierContract?: boolean;
		lifecycleOutcomes: string[];
		latestEventAt?: number;
		mediaStarts: number;
		sessionErrors: number;
		transcripts: number;
	};
	pass: boolean;
	provider?: TProvider;
	required: VoicePhoneAgentProductionSmokeRequirement[];
	scenarioId?: string;
	sessionId?: string;
	traceId?: string;
};

export type VoicePhoneAgentProductionSmokeOptions<
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
> = {
	contract?: VoiceTelephonyContractReport<TProvider>;
	contractId?: string;
	events?: readonly StoredVoiceTraceEvent[];
	maxAgeMs?: number;
	now?: number;
	provider?: TProvider;
	required?: readonly VoicePhoneAgentProductionSmokeRequirement[];
	scenarioId?: string;
	sessionId?: string;
	store?: VoiceTraceEventStore;
	traceId?: string;
};

export type VoicePhoneAgentProductionSmokeHandlerOptions<
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
> = Omit<
	VoicePhoneAgentProductionSmokeOptions<TProvider>,
	'events' | 'scenarioId' | 'sessionId' | 'traceId'
> & {
	getContract?: (input: {
		query: Record<string, unknown>;
		request: Request;
	}) =>
		| Promise<VoiceTelephonyContractReport<TProvider> | undefined>
		| VoiceTelephonyContractReport<TProvider>
		| undefined;
	scenarioId?: string;
	sessionId?: string;
	traceId?: string;
};

export type VoicePhoneAgentProductionSmokeHTMLHandlerOptions<
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
> = VoicePhoneAgentProductionSmokeHandlerOptions<TProvider> & {
	headers?: HeadersInit;
	render?: (
		report: VoicePhoneAgentProductionSmokeReport<TProvider>
	) => Promise<string> | string;
	title?: string;
};

export type VoicePhoneAgentProductionSmokeRoutesOptions<
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
> = VoicePhoneAgentProductionSmokeHTMLHandlerOptions<TProvider> & {
	htmlPath?: false | string;
	name?: string;
	path?: string;
};

const defaultRequirements: VoicePhoneAgentProductionSmokeRequirement[] = [
	'media-started',
	'transcript',
	'assistant-response',
	'lifecycle-outcome',
	'no-session-error'
];

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const payloadType = (event: StoredVoiceTraceEvent) =>
	typeof event.payload.type === 'string' ? event.payload.type : undefined;

const hasTextPayload = (event: StoredVoiceTraceEvent) =>
	['text', 'assistantText', 'transcript'].some((key) => {
		const value = event.payload[key];
		return typeof value === 'string' && value.trim().length > 0;
	});

const lifecycleOutcome = (event: StoredVoiceTraceEvent) => {
	if (event.type !== 'call.lifecycle') {
		return undefined;
	}

	const type = payloadType(event);
	if (type === 'end') {
		return typeof event.payload.disposition === 'string'
			? event.payload.disposition
			: 'completed';
	}

	return ['escalation', 'no-answer', 'transfer', 'voicemail'].includes(type ?? '')
		? type
		: undefined;
};

const filterEvents = (
	events: readonly StoredVoiceTraceEvent[],
	options: Pick<
		VoicePhoneAgentProductionSmokeOptions,
		'scenarioId' | 'sessionId' | 'traceId'
	>
) =>
	events.filter((event) => {
		if (options.sessionId && event.sessionId !== options.sessionId) {
			return false;
		}
		if (options.traceId && event.traceId !== options.traceId) {
			return false;
		}
		if (options.scenarioId && event.scenarioId !== options.scenarioId) {
			return false;
		}
		return true;
	});

const loadEvents = async (
	options: VoicePhoneAgentProductionSmokeOptions
): Promise<StoredVoiceTraceEvent[]> => {
	if (options.events) {
		return [...options.events];
	}

	if (!options.store) {
		return [];
	}

	if (options.sessionId) {
		return options.store.list({ sessionId: options.sessionId });
	}
	if (options.traceId) {
		return options.store.list({ traceId: options.traceId });
	}
	if (options.scenarioId) {
		return options.store.list({ scenarioId: options.scenarioId });
	}

	return options.store.list();
};

export const runVoicePhoneAgentProductionSmokeContract = async <
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
>(
	options: VoicePhoneAgentProductionSmokeOptions<TProvider>
): Promise<VoicePhoneAgentProductionSmokeReport<TProvider>> => {
	const required = [...(options.required ?? defaultRequirements)];
	const now = options.now ?? Date.now();
	const events = filterEvents(await loadEvents(options), options);
	const latestEventAt =
		events.length > 0
			? Math.max(...events.map((event) => event.at))
			: undefined;
	const lifecycleOutcomes = events
		.map(lifecycleOutcome)
		.filter((value): value is string => typeof value === 'string');
	const observed = {
		assistantResponses: events.filter(
			(event) => event.type === 'turn.assistant' && hasTextPayload(event)
		).length,
		carrierContract: options.contract?.pass,
		lifecycleOutcomes,
		latestEventAt,
		mediaStarts: events.filter(
			(event) => event.type === 'call.lifecycle' && payloadType(event) === 'start'
		).length,
		sessionErrors: events.filter((event) => event.type === 'session.error').length,
		transcripts: events.filter(
			(event) => event.type === 'turn.transcript' && hasTextPayload(event)
		).length
	};
	const issues: VoicePhoneAgentProductionSmokeIssue[] = [];
	const require = (
		requirement: VoicePhoneAgentProductionSmokeRequirement,
		pass: boolean,
		message: string
	) => {
		if (required.includes(requirement) && !pass) {
			issues.push({
				message,
				requirement,
				severity: 'error'
			});
		}
	};

	require(
		'carrier-contract',
		options.contract?.pass === true,
		'Carrier setup contract is missing or failing.'
	);
	require(
		'media-started',
		observed.mediaStarts > 0,
		'No media-start lifecycle trace was recorded.'
	);
	require(
		'transcript',
		observed.transcripts > 0,
		'No transcript trace was recorded.'
	);
	require(
		'assistant-response',
		observed.assistantResponses > 0,
		'No assistant response trace was recorded.'
	);
	require(
		'lifecycle-outcome',
		observed.lifecycleOutcomes.length > 0,
		'No terminal lifecycle outcome was recorded.'
	);
	require(
		'no-session-error',
		observed.sessionErrors === 0,
		`${observed.sessionErrors} session error trace(s) were recorded.`
	);
	require(
		'fresh-trace',
		typeof options.maxAgeMs !== 'number' ||
			(latestEventAt !== undefined && now - latestEventAt <= options.maxAgeMs),
		'Phone-agent smoke trace evidence is stale or missing.'
	);

	return {
		contract: options.contract,
		contractId: options.contractId ?? 'phone-agent-production-smoke',
		generatedAt: now,
		issues,
		maxAgeMs: options.maxAgeMs,
		observed,
		pass: issues.every((issue) => issue.severity !== 'error'),
		provider: options.provider ?? options.contract?.provider,
		required,
		scenarioId: options.scenarioId,
		sessionId: options.sessionId,
		traceId: options.traceId
	};
};

const queryValue = (query: Record<string, unknown>, key: string) => {
	const value = query[key];
	if (Array.isArray(value)) {
		return typeof value[0] === 'string' ? value[0] : undefined;
	}
	return typeof value === 'string' && value.trim().length > 0
		? value
		: undefined;
};

const resolveHandlerOptions = async <
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
>(
	options: VoicePhoneAgentProductionSmokeHandlerOptions<TProvider>,
	input: {
		query: Record<string, unknown>;
		request: Request;
	}
): Promise<VoicePhoneAgentProductionSmokeOptions<TProvider>> => ({
	...options,
	contract:
		(await options.getContract?.(input)) ?? options.contract,
	scenarioId: queryValue(input.query, 'scenarioId') ?? options.scenarioId,
	sessionId: queryValue(input.query, 'sessionId') ?? options.sessionId,
	traceId: queryValue(input.query, 'traceId') ?? options.traceId
});

export const renderVoicePhoneAgentProductionSmokeHTML = <
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
>(
	report: VoicePhoneAgentProductionSmokeReport<TProvider>,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Phone Smoke Contract';
	const issues = report.issues
		.map(
			(issue) =>
				`<li><strong>${escapeHtml(issue.requirement)}</strong>: ${escapeHtml(issue.message)}</li>`
		)
		.join('');
	const outcomes = report.observed.lifecycleOutcomes
		.map((outcome) => `<span class="pill">${escapeHtml(outcome)}</span>`)
		.join('');
	const requirements = report.required
		.map((requirement) => `<span class="pill">${escapeHtml(requirement)}</span>`)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0e141b;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1050px;padding:32px}.hero,.panel{background:#151d26;border:1px solid #283544;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(245,158,11,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.2rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.pass{color:#86efac}.fail{color:#fca5a5}.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.metric{background:#0f151d;border:1px solid #283544;border-radius:16px;padding:14px}.metric strong{display:block;font-size:1.8rem}.pill{background:#0f151d;border:1px solid #3f3f46;border-radius:999px;display:inline-flex;margin:4px;padding:7px 10px}.issues{color:#fca5a5}code{color:#fde68a}@media(max-width:720px){main{padding:18px}}</style></head><body><main><section class="hero"><p class="eyebrow">Phone agent production smoke</p><h1>${escapeHtml(title)}</h1><p class="status ${report.pass ? 'pass' : 'fail'}">${report.pass ? 'PASS' : 'FAIL'}</p><p>Contract <code>${escapeHtml(report.contractId)}</code>${report.provider ? ` for <code>${escapeHtml(report.provider)}</code>` : ''}${report.sessionId ? ` on session <code>${escapeHtml(report.sessionId)}</code>` : ''}.</p></section><section class="panel"><h2>Observed Trace Evidence</h2><div class="grid"><div class="metric"><span>Media starts</span><strong>${String(report.observed.mediaStarts)}</strong></div><div class="metric"><span>Transcripts</span><strong>${String(report.observed.transcripts)}</strong></div><div class="metric"><span>Assistant responses</span><strong>${String(report.observed.assistantResponses)}</strong></div><div class="metric"><span>Session errors</span><strong>${String(report.observed.sessionErrors)}</strong></div></div><p>${outcomes || '<span class="pill">No lifecycle outcome</span>'}</p></section><section class="panel"><h2>Requirements</h2><p>${requirements}</p>${issues ? `<ul class="issues">${issues}</ul>` : '<p class="pass">All required phone-agent smoke evidence is present.</p>'}</section></main></body></html>`;
};

export const createVoicePhoneAgentProductionSmokeJSONHandler =
	<TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider>(
		options: VoicePhoneAgentProductionSmokeHandlerOptions<TProvider>
	) =>
	async ({
		query,
		request
	}: {
		query: Record<string, unknown>;
		request: Request;
	}) =>
		runVoicePhoneAgentProductionSmokeContract(
			await resolveHandlerOptions(options, { query, request })
		);

export const createVoicePhoneAgentProductionSmokeHTMLHandler =
	<TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider>(
		options: VoicePhoneAgentProductionSmokeHTMLHandlerOptions<TProvider>
	) =>
	async ({
		query,
		request
	}: {
		query: Record<string, unknown>;
		request: Request;
	}) => {
		const report = await runVoicePhoneAgentProductionSmokeContract(
			await resolveHandlerOptions(options, { query, request })
		);
		const render =
			options.render ??
			((input: VoicePhoneAgentProductionSmokeReport<TProvider>) =>
				renderVoicePhoneAgentProductionSmokeHTML(input, options));
		const body = await render(report);

		return new Response(body, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	};

export const createVoicePhoneAgentProductionSmokeRoutes = <
	TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider
>(
	options: VoicePhoneAgentProductionSmokeRoutesOptions<TProvider>
) => {
	const path = options.path ?? '/api/voice/phone/smoke-contract';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/phone/smoke-contract' : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-phone-smoke-contract'
	}).get(path, createVoicePhoneAgentProductionSmokeJSONHandler(options));

	if (htmlPath) {
		routes.get(htmlPath, createVoicePhoneAgentProductionSmokeHTMLHandler(options));
	}

	return routes;
};
