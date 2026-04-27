import { Elysia } from 'elysia';
import {
	buildVoiceTraceReplay,
	filterVoiceTraceEvents,
	type StoredVoiceTraceEvent,
	type VoiceTraceEvaluationOptions,
	type VoiceTraceEventStore,
	type VoiceTraceRedactionConfig,
	type VoiceTraceSummary,
	type VoiceTraceEvaluation
} from './trace';

export type VoiceSessionReplayTurn = {
	assistantReplies: string[];
	committedText?: string;
	errors: Array<Record<string, unknown>>;
	id: string;
	modelCalls: Array<Record<string, unknown>>;
	tools: Array<Record<string, unknown>>;
	transcripts: Array<{
		isFinal: boolean;
		text?: string;
	}>;
};

export type VoiceSessionReplay = {
	evaluation: VoiceTraceEvaluation;
	events: StoredVoiceTraceEvent[];
	html: string;
	markdown: string;
	sessionId: string;
	summary: VoiceTraceSummary;
	timeline: Array<{
		at: number;
		offsetMs?: number;
		payload: Record<string, unknown>;
		turnId?: string;
		type: StoredVoiceTraceEvent['type'];
	}>;
	turns: VoiceSessionReplayTurn[];
};

export type VoiceSessionListStatus = 'failed' | 'healthy';

export type VoiceSessionListItem = {
	endedAt?: number;
	errorCount: number;
	eventCount: number;
	latestOutcome?: string;
	providerErrors: Record<string, number>;
	providers: string[];
	replayHref: string;
	sessionId: string;
	startedAt?: number;
	status: VoiceSessionListStatus;
	transcriptCount: number;
	turnCount: number;
};

export type VoiceSessionListOptions = {
	events?: StoredVoiceTraceEvent[];
	limit?: number;
	provider?: string;
	q?: string;
	replayHref?: false | string | ((session: Omit<VoiceSessionListItem, 'replayHref'>) => string);
	status?: VoiceSessionListStatus | 'all';
	store?: VoiceTraceEventStore;
};

export type VoiceSessionListHTMLHandlerOptions = VoiceSessionListOptions & {
	headers?: HeadersInit;
	render?: (sessions: VoiceSessionListItem[]) => string | Promise<string>;
};

export type VoiceSessionListRoutesOptions = VoiceSessionListHTMLHandlerOptions & {
	htmlPath?: false | string;
	name?: string;
	path?: string;
};

export type VoiceSessionReplayOptions = {
	evaluation?: VoiceTraceEvaluationOptions;
	events?: StoredVoiceTraceEvent[];
	redact?: VoiceTraceRedactionConfig;
	sessionId: string;
	store?: VoiceTraceEventStore;
	title?: string;
};

export type VoiceSessionReplayHTMLHandlerOptions = Omit<
	VoiceSessionReplayOptions,
	'sessionId'
> & {
	headers?: HeadersInit;
	render?: (replay: VoiceSessionReplay) => string | Promise<string>;
};

export type VoiceSessionReplayRoutesOptions =
	VoiceSessionReplayHTMLHandlerOptions & {
		htmlPath?: false | string;
		name?: string;
		path?: string;
	};

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const increment = (record: Record<string, number>, key: string) => {
	record[key] = (record[key] ?? 0) + 1;
};

const buildReplayTurns = (
	events: StoredVoiceTraceEvent[]
): VoiceSessionReplayTurn[] => {
	const turns = new Map<string, VoiceSessionReplayTurn>();
	const getTurn = (turnId: string) => {
		const existing = turns.get(turnId);
		if (existing) {
			return existing;
		}
		const turn: VoiceSessionReplayTurn = {
			assistantReplies: [],
			errors: [],
			id: turnId,
			modelCalls: [],
			tools: [],
			transcripts: []
		};
		turns.set(turnId, turn);
		return turn;
	};

	for (const event of events) {
		const turnId = event.turnId ?? 'session';
		const turn = getTurn(turnId);
		switch (event.type) {
			case 'turn.transcript':
				turn.transcripts.push({
					isFinal: event.payload.isFinal === true,
					text: getString(event.payload.text)
				});
				break;
			case 'turn.committed':
				turn.committedText = getString(event.payload.text);
				break;
			case 'turn.assistant': {
				const text = getString(event.payload.text);
				if (text) {
					turn.assistantReplies.push(text);
				}
				break;
			}
			case 'agent.model':
			case 'assistant.run':
				turn.modelCalls.push(event.payload);
				break;
			case 'agent.tool':
				turn.tools.push(event.payload);
				break;
			case 'session.error':
				turn.errors.push(event.payload);
				break;
		}
	}

	return [...turns.values()];
};

export const summarizeVoiceSessionReplay = async (
	options: VoiceSessionReplayOptions
): Promise<VoiceSessionReplay> => {
	const sourceEvents =
		options.events ??
		(await options.store?.list({ sessionId: options.sessionId })) ??
		[];
	const events = filterVoiceTraceEvents(sourceEvents, {
		sessionId: options.sessionId
	});
	const replay = buildVoiceTraceReplay(events, {
		evaluation: options.evaluation,
		redact: options.redact,
		title: options.title ?? `Voice Session ${options.sessionId}`
	});
	const startedAt = replay.summary.startedAt;

	return {
		evaluation: replay.evaluation,
		events,
		html: replay.html,
		markdown: replay.markdown,
		sessionId: options.sessionId,
		summary: replay.summary,
		timeline: events.map((event) => ({
			at: event.at,
			offsetMs:
				startedAt === undefined ? undefined : Math.max(0, event.at - startedAt),
			payload: event.payload,
			turnId: event.turnId,
			type: event.type
		})),
		turns: buildReplayTurns(events)
	};
};

export const summarizeVoiceSessions = async (
	options: VoiceSessionListOptions = {}
): Promise<VoiceSessionListItem[]> => {
	const events = options.events ?? (await options.store?.list()) ?? [];
	const grouped = new Map<string, StoredVoiceTraceEvent[]>();

	for (const event of events) {
		grouped.set(event.sessionId, [...(grouped.get(event.sessionId) ?? []), event]);
	}

	const sessions = [...grouped.entries()].map(([sessionId, sessionEvents]) => {
		const sorted = filterVoiceTraceEvents(sessionEvents);
		const summary = buildVoiceTraceReplay(sorted, {
			evaluation: {
				requireAssistantReply: false,
				requireCompletedCall: false,
				requireTranscript: false,
				requireTurn: false
			}
		}).summary;
		const providerErrors: Record<string, number> = {};
		const providers = new Set<string>();
		let latestOutcome: string | undefined;
		let errorCount = 0;

		for (const event of sorted) {
			const provider = getString(event.payload.provider);
			if (provider) {
				providers.add(provider);
			}
			if (
				event.type === 'session.error' &&
				(event.payload.providerStatus === 'error' ||
					typeof event.payload.error === 'string')
			) {
				errorCount += 1;
				increment(providerErrors, provider ?? 'unknown');
			}
			const outcome = getString(event.payload.outcome);
			if (outcome) {
				latestOutcome = outcome;
			}
		}

		const item: Omit<VoiceSessionListItem, 'replayHref'> = {
			endedAt: summary.endedAt,
			errorCount,
			eventCount: summary.eventCount,
			latestOutcome,
			providerErrors,
			providers: [...providers].sort(),
			sessionId,
			startedAt: summary.startedAt,
			status: errorCount > 0 ? 'failed' : 'healthy',
			transcriptCount: summary.transcriptCount,
			turnCount: summary.turnCount
		};
		const replayHref =
			options.replayHref === false
				? ''
				: typeof options.replayHref === 'function'
					? options.replayHref(item)
					: `${options.replayHref ?? '/api/voice-sessions'}/${encodeURIComponent(sessionId)}/replay/htmx`;

		return {
			...item,
			replayHref
		};
	});
	const search = options.q?.trim().toLowerCase();

	return sessions
		.filter((session) => {
			if (options.status && options.status !== 'all' && session.status !== options.status) {
				return false;
			}
			if (options.provider && !session.providers.includes(options.provider)) {
				return false;
			}
			if (!search) {
				return true;
			}

			return [
				session.sessionId,
				session.latestOutcome,
				session.status,
				...session.providers
			].some((value) => value?.toLowerCase().includes(search));
		})
		.sort(
			(left, right) =>
				(right.endedAt ?? right.startedAt ?? 0) -
				(left.endedAt ?? left.startedAt ?? 0)
		)
		.slice(0, options.limit ?? 50);
};

export const renderVoiceSessionsHTML = (sessions: VoiceSessionListItem[]) =>
	sessions.length === 0
		? '<p class="voice-sessions-empty">No voice sessions found.</p>'
		: [
				'<div class="voice-sessions-list">',
				...sessions.map((session) =>
					[
						`<article class="voice-session-card ${escapeHtml(session.status)}">`,
						'<div class="voice-session-card-header">',
						`<strong>${escapeHtml(session.sessionId)}</strong>`,
						`<span>${escapeHtml(session.status)}</span>`,
						'</div>',
						'<dl>',
						`<div><dt>Events</dt><dd>${String(session.eventCount)}</dd></div>`,
						`<div><dt>Turns</dt><dd>${String(session.turnCount)}</dd></div>`,
						`<div><dt>Transcripts</dt><dd>${String(session.transcriptCount)}</dd></div>`,
						`<div><dt>Errors</dt><dd>${String(session.errorCount)}</dd></div>`,
						'</dl>',
						session.latestOutcome
							? `<p>Outcome: ${escapeHtml(session.latestOutcome)}</p>`
							: '',
						session.providers.length
							? `<p>Providers: ${session.providers.map(escapeHtml).join(', ')}</p>`
							: '',
						session.replayHref
							? `<p><a href="${escapeHtml(session.replayHref)}">Open replay</a></p>`
							: '',
						'</article>'
					].join('')
				),
				'</div>'
			].join('');

export const createVoiceSessionsJSONHandler =
	(options: VoiceSessionListOptions = {}) =>
	async ({ query }: { query?: Record<string, string | undefined> }) =>
		summarizeVoiceSessions({
			...options,
			limit:
				typeof query?.limit === 'string' ? Number(query.limit) : options.limit,
			provider: query?.provider ?? options.provider,
			q: query?.q ?? options.q,
			status:
				query?.status === 'failed' || query?.status === 'healthy' || query?.status === 'all'
					? query.status
					: options.status
		});

export const createVoiceSessionsHTMLHandler =
	(options: VoiceSessionListHTMLHandlerOptions = {}) =>
	async ({ query }: { query?: Record<string, string | undefined> }) => {
		const sessions = await summarizeVoiceSessions({
			...options,
			limit:
				typeof query?.limit === 'string' ? Number(query.limit) : options.limit,
			provider: query?.provider ?? options.provider,
			q: query?.q ?? options.q,
			status:
				query?.status === 'failed' || query?.status === 'healthy' || query?.status === 'all'
					? query.status
					: options.status
		});
		const body = await (options.render?.(sessions) ?? renderVoiceSessionsHTML(sessions));

		return new Response(body, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	};

export const createVoiceSessionListRoutes = (
	options: VoiceSessionListRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice-sessions';
	const htmlPath =
		options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-session-list'
	}).get(path, createVoiceSessionsJSONHandler(options));

	if (htmlPath) {
		routes.get(htmlPath, createVoiceSessionsHTMLHandler(options));
	}

	return routes;
};

export const createVoiceSessionReplayJSONHandler =
	(options: Omit<VoiceSessionReplayOptions, 'sessionId'>) =>
	async ({ params }: { params: Record<string, string | undefined> }) =>
		summarizeVoiceSessionReplay({
			...options,
			sessionId: params.sessionId ?? ''
		});

export const createVoiceSessionReplayHTMLHandler =
	(options: VoiceSessionReplayHTMLHandlerOptions) =>
	async ({ params }: { params: Record<string, string | undefined> }) => {
		const replay = await summarizeVoiceSessionReplay({
			...options,
			sessionId: params.sessionId ?? ''
		});
		const body = await (options.render?.(replay) ?? replay.html);

		return new Response(body, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	};

export const createVoiceSessionReplayRoutes = (
	options: VoiceSessionReplayRoutesOptions
) => {
	const path = options.path ?? '/api/voice-sessions/:sessionId/replay';
	const htmlPath =
		options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-session-replay'
	}).get(path, createVoiceSessionReplayJSONHandler(options));

	if (htmlPath) {
		routes.get(htmlPath, createVoiceSessionReplayHTMLHandler(options));
	}

	return routes;
};
