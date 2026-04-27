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
