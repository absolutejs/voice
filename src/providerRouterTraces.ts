import type { VoiceProviderRouterEvent } from './modelAdapters';
import type { VoiceIOProviderRouterEvent } from './providerAdapters';
import type {
	StoredVoiceTraceEvent,
	VoiceTraceEvent,
	VoiceTraceEventStore
} from './trace';

export type VoiceProviderRouterTraceEventOptions<
	TProvider extends string = string
> = {
	at?: number;
	event: VoiceProviderRouterEvent<TProvider>;
	id?: string;
	metadata?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	scenarioId?: string;
	sessionId: string;
	turnId?: string;
	type?: VoiceTraceEvent['type'];
};

export type VoiceIOProviderRouterTraceEventOptions<
	TProvider extends string = string
> = {
	at?: number;
	event: VoiceIOProviderRouterEvent<TProvider>;
	id?: string;
	metadata?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	scenarioId?: string;
	sessionId: string;
	turnId?: string;
	type?: VoiceTraceEvent['type'];
};

export type VoiceProviderRouterTraceAppendOptions<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TProvider extends string = string
> = VoiceProviderRouterTraceEventOptions<TProvider> & {
	store: Pick<VoiceTraceEventStore<TEvent>, 'append'>;
};

export type VoiceIOProviderRouterTraceAppendOptions<
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TProvider extends string = string
> = VoiceIOProviderRouterTraceEventOptions<TProvider> & {
	store: Pick<VoiceTraceEventStore<TEvent>, 'append'>;
};

export const buildVoiceProviderRouterTraceEvent = <
	TProvider extends string = string
>(
	options: VoiceProviderRouterTraceEventOptions<TProvider>
): StoredVoiceTraceEvent => ({
	at: options.at ?? options.event.at,
	id:
		options.id ??
		`${options.sessionId}:${options.turnId ?? 'session'}:${options.event.provider}:${options.event.status}:${String(options.at ?? options.event.at)}`,
	metadata: options.metadata,
	payload: {
		...options.event,
		...(options.payload ?? {}),
		providerStatus: options.event.status
	},
	scenarioId: options.scenarioId,
	sessionId: options.sessionId,
	turnId: options.turnId,
	type: options.type ?? 'session.error'
});

export const appendVoiceProviderRouterTraceEvent = async <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TProvider extends string = string
>(
	options: VoiceProviderRouterTraceAppendOptions<TEvent, TProvider>
) => options.store.append(buildVoiceProviderRouterTraceEvent(options));

export const buildVoiceIOProviderRouterTraceEvent = <
	TProvider extends string = string
>(
	options: VoiceIOProviderRouterTraceEventOptions<TProvider>
): StoredVoiceTraceEvent => ({
	at: options.at ?? options.event.at,
	id:
		options.id ??
		`${options.sessionId}:${options.event.kind}:${options.event.operation}:${options.event.provider}:${options.event.status}:${String(options.at ?? options.event.at)}`,
	metadata: options.metadata,
	payload: {
		...options.event,
		...(options.payload ?? {}),
		providerStatus: options.event.status
	},
	scenarioId: options.scenarioId,
	sessionId: options.sessionId,
	turnId: options.turnId,
	type: options.type ?? 'session.error'
});

export const appendVoiceIOProviderRouterTraceEvent = async <
	TEvent extends StoredVoiceTraceEvent = StoredVoiceTraceEvent,
	TProvider extends string = string
>(
	options: VoiceIOProviderRouterTraceAppendOptions<TEvent, TProvider>
) => options.store.append(buildVoiceIOProviderRouterTraceEvent(options));
