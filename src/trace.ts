export type VoiceTraceEventType =
	| 'agent.handoff'
	| 'agent.model'
	| 'agent.result'
	| 'agent.tool'
	| 'call.lifecycle'
	| 'session.error'
	| 'turn.assistant'
	| 'turn.committed'
	| 'turn.cost'
	| 'turn.transcript';

export type VoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = {
	at: number;
	id?: string;
	metadata?: Record<string, unknown>;
	payload: TPayload;
	scenarioId?: string;
	sessionId: string;
	traceId?: string;
	turnId?: string;
	type: VoiceTraceEventType;
};

export type StoredVoiceTraceEvent<
	TPayload extends Record<string, unknown> = Record<string, unknown>
> = VoiceTraceEvent<TPayload> & {
	id: string;
};

export type VoiceTraceEventFilter = {
	limit?: number;
	scenarioId?: string;
	sessionId?: string;
	traceId?: string;
	turnId?: string;
	type?: VoiceTraceEventType | VoiceTraceEventType[];
};

export type VoiceTraceEventStore<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
> = {
	append: (event: VoiceTraceEvent | TEvent) => Promise<TEvent>;
	get: (id: string) => Promise<TEvent | undefined>;
	list: (filter?: VoiceTraceEventFilter) => Promise<TEvent[]>;
	remove: (id: string) => Promise<void>;
};

export const createVoiceTraceEventId = (event: {
	at?: number;
	sessionId: string;
	turnId?: string;
	type: VoiceTraceEventType;
}) =>
	[
		event.sessionId,
		event.turnId ?? 'session',
		event.type,
		String(event.at ?? Date.now()),
		crypto.randomUUID()
	]
		.map(encodeURIComponent)
		.join(':');

export const createVoiceTraceEvent = <
	TEvent extends VoiceTraceEvent = VoiceTraceEvent
>(
	event: TEvent
): StoredVoiceTraceEvent<TEvent['payload']> => ({
	...event,
	at: event.at,
	id:
		event.id ??
		createVoiceTraceEventId({
			at: event.at,
			sessionId: event.sessionId,
			turnId: event.turnId,
			type: event.type
		})
});

const matchesTraceFilter = (
	event: StoredVoiceTraceEvent,
	filter: VoiceTraceEventFilter
) => {
	if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) {
		return false;
	}

	if (filter.turnId !== undefined && event.turnId !== filter.turnId) {
		return false;
	}

	if (filter.scenarioId !== undefined && event.scenarioId !== filter.scenarioId) {
		return false;
	}

	if (filter.traceId !== undefined && event.traceId !== filter.traceId) {
		return false;
	}

	if (filter.type !== undefined) {
		const types = Array.isArray(filter.type) ? filter.type : [filter.type];
		if (!types.includes(event.type)) {
			return false;
		}
	}

	return true;
};

export const filterVoiceTraceEvents = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(
	events: TEvent[],
	filter: VoiceTraceEventFilter = {}
) => {
	const sorted = events
		.filter((event) => matchesTraceFilter(event, filter))
		.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));

	return typeof filter.limit === 'number' && filter.limit >= 0
		? sorted.slice(0, filter.limit)
		: sorted;
};

export const createVoiceMemoryTraceEventStore = <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent
>(): VoiceTraceEventStore<TEvent> => {
	const events = new Map<string, TEvent>();

	const append: VoiceTraceEventStore<TEvent>['append'] = async (event) => {
		const stored = createVoiceTraceEvent(event) as TEvent;
		events.set(stored.id, stored);
		return stored;
	};

	const get = async (id: string) => events.get(id);

	const list = async (filter?: VoiceTraceEventFilter) =>
		filterVoiceTraceEvents([...events.values()], filter);

	const remove = async (id: string) => {
		events.delete(id);
	};

	return { append, get, list, remove };
};

export const exportVoiceTrace = async (input: {
	filter?: VoiceTraceEventFilter;
	store: VoiceTraceEventStore;
}) => ({
	exportedAt: Date.now(),
	events: await input.store.list(input.filter),
	filter: input.filter
});
