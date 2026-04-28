import {
	listVoiceRoutingEvents,
	type VoiceRoutingEvent,
	type VoiceRoutingEventKind
} from './resilienceRoutes';
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from './trace';

export type VoiceProviderRoutingStatus = 'error' | 'fallback' | 'success';

export type VoiceProviderRoutingExpectation = {
	fallbackProvider?: string;
	kind?: VoiceRoutingEventKind;
	operation?: string;
	provider?: string;
	selectedProvider?: string;
	status?: VoiceProviderRoutingStatus;
};

export type VoiceProviderRoutingContractDefinition = {
	description?: string;
	expect: VoiceProviderRoutingExpectation[];
	id: string;
	label?: string;
	scenarioId?: string;
	sessionId?: string;
};

export type VoiceProviderRoutingContractIssue = {
	code: string;
	message: string;
};

export type VoiceProviderRoutingContractReport = {
	contractId: string;
	events: VoiceRoutingEvent[];
	issues: VoiceProviderRoutingContractIssue[];
	pass: boolean;
	scenarioId?: string;
	sessionId?: string;
};

export type VoiceProviderRoutingContractRunOptions = {
	contract: VoiceProviderRoutingContractDefinition;
	events?: StoredVoiceTraceEvent[] | VoiceRoutingEvent[];
	store?: VoiceTraceEventStore;
};

const isRoutingEvent = (event: unknown): event is VoiceRoutingEvent =>
	Boolean(
		event &&
			typeof event === 'object' &&
			'status' in event &&
			'kind' in event &&
			'sessionId' in event
	);

const normalizeEvents = (
	events: StoredVoiceTraceEvent[] | VoiceRoutingEvent[]
): VoiceRoutingEvent[] =>
	(events.every(isRoutingEvent)
		? [...(events as VoiceRoutingEvent[])]
		: listVoiceRoutingEvents(events as StoredVoiceTraceEvent[])).sort(
		(left, right) => left.at - right.at
	);

const matchesExpectation = (
	event: VoiceRoutingEvent,
	expectation: VoiceProviderRoutingExpectation
) =>
	(expectation.kind === undefined || event.kind === expectation.kind) &&
	(expectation.operation === undefined ||
		event.operation === expectation.operation) &&
	(expectation.provider === undefined || event.provider === expectation.provider) &&
	(expectation.selectedProvider === undefined ||
		event.selectedProvider === expectation.selectedProvider) &&
	(expectation.fallbackProvider === undefined ||
		event.fallbackProvider === expectation.fallbackProvider) &&
	(expectation.status === undefined || event.status === expectation.status);

const describeExpectation = (expectation: VoiceProviderRoutingExpectation) =>
	Object.entries(expectation)
		.map(([key, value]) => `${key}=${String(value)}`)
		.join(', ');

export const runVoiceProviderRoutingContract = async (
	options: VoiceProviderRoutingContractRunOptions
): Promise<VoiceProviderRoutingContractReport> => {
	const rawEvents = options.events ?? (await options.store?.list()) ?? [];
	const events = normalizeEvents(rawEvents).filter(
		(event) =>
			(!options.contract.sessionId ||
				event.sessionId === options.contract.sessionId) &&
			(!options.contract.scenarioId ||
				event.sessionId === options.contract.scenarioId ||
				(rawEvents as StoredVoiceTraceEvent[]).some(
					(rawEvent) =>
						!isRoutingEvent(rawEvent) &&
						rawEvent.sessionId === event.sessionId &&
						rawEvent.scenarioId === options.contract.scenarioId
				))
	);
	const issues: VoiceProviderRoutingContractIssue[] = [];
	let searchFrom = 0;

	for (const [index, expectation] of options.contract.expect.entries()) {
		const matchIndex = events.findIndex(
			(event, eventIndex) =>
				eventIndex >= searchFrom && matchesExpectation(event, expectation)
		);
		if (matchIndex === -1) {
			issues.push({
				code: 'provider_routing.expected_event_missing',
				message: `Expected provider routing event ${index + 1}: ${describeExpectation(expectation)}.`
			});
			continue;
		}
		searchFrom = matchIndex + 1;
	}

	return {
		contractId: options.contract.id,
		events,
		issues,
		pass: issues.length === 0,
		scenarioId: options.contract.scenarioId,
		sessionId: options.contract.sessionId
	};
};

export const assertVoiceProviderRoutingContract = async (
	options: VoiceProviderRoutingContractRunOptions
): Promise<VoiceProviderRoutingContractReport> => {
	const report = await runVoiceProviderRoutingContract(options);
	if (!report.pass) {
		throw new Error(
			`Voice provider routing contract ${report.contractId} failed: ${report.issues
				.map((issue) => issue.message)
				.join(' ')}`
		);
	}
	return report;
};
