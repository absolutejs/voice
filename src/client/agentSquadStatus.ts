import type {
	VoiceTraceTimelineEvent,
	VoiceTraceTimelineReport,
	VoiceTraceTimelineSession
} from '../traceTimeline';
import { createVoiceTraceTimelineStore, type VoiceTraceTimelineClientOptions } from './traceTimeline';

export type VoiceAgentSquadSpecialistStatus =
	| 'active'
	| 'blocked'
	| 'handoff'
	| 'idle'
	| 'unknown-target';

export type VoiceAgentSquadSpecialist = {
	fromAgentId?: string;
	lastEventAt?: number;
	reason?: string;
	sessionId: string;
	status: VoiceAgentSquadSpecialistStatus;
	summary?: string;
	targetAgentId?: string;
	turnId?: string;
};

export type VoiceAgentSquadStatusReport = {
	active: VoiceAgentSquadSpecialist[];
	checkedAt?: number;
	current?: VoiceAgentSquadSpecialist;
	sessionCount: number;
	sessions: VoiceAgentSquadSpecialist[];
};

export type VoiceAgentSquadStatusSnapshot = {
	error: string | null;
	isLoading: boolean;
	report: VoiceAgentSquadStatusReport;
	updatedAt?: number;
};

export type VoiceAgentSquadStatusClientOptions = VoiceTraceTimelineClientOptions & {
	sessionId?: string;
};

const getString = (value: unknown) =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const getPayloadString = (
	event: VoiceTraceTimelineEvent,
	key: string
) => getString((event as VoiceTraceTimelineEvent & { payload?: Record<string, unknown> }).payload?.[key]);

const eventStatus = (event: VoiceTraceTimelineEvent): VoiceAgentSquadSpecialistStatus => {
	const status = getPayloadString(event, 'status');
	if (status === 'blocked') return 'blocked';
	if (status === 'unknown-target') return 'unknown-target';
	if (status === 'allowed') return 'handoff';
	return event.type === 'agent.result' ? 'active' : 'handoff';
};

const deriveSessionSpecialist = (
	session: VoiceTraceTimelineSession
): VoiceAgentSquadSpecialist => {
	const events = [...session.events].sort((left, right) => left.at - right.at);
	const agentEvents = events.filter(
		(event) =>
			event.type === 'agent.handoff' ||
			event.type === 'agent.context' ||
			event.type === 'agent.result' ||
			event.type === 'agent.model'
	);
	const latest = agentEvents.at(-1);
	if (!latest) {
		return {
			lastEventAt: session.lastEventAt,
			sessionId: session.sessionId,
			status: 'idle'
		};
	}

	const handoffEvents = events.filter((event) => event.type === 'agent.handoff');
	const lastHandoff = handoffEvents.at(-1);
	const latestAgentId = getPayloadString(latest, 'agentId');
	const handoffStatus = lastHandoff ? eventStatus(lastHandoff) : undefined;
	const currentTarget =
		handoffStatus === 'blocked' || handoffStatus === 'unknown-target'
			? getPayloadString(lastHandoff!, 'fromAgentId') ?? latestAgentId
			: getPayloadString(lastHandoff ?? latest, 'targetAgentId') ?? latestAgentId;

	return {
		fromAgentId: getPayloadString(lastHandoff ?? latest, 'fromAgentId'),
		lastEventAt: latest.at,
		reason:
			getPayloadString(lastHandoff ?? latest, 'reason') ??
			getPayloadString(latest, 'handoffTarget'),
		sessionId: session.sessionId,
		status: lastHandoff ? eventStatus(lastHandoff) : 'active',
		summary: getPayloadString(lastHandoff ?? latest, 'summary'),
		targetAgentId: currentTarget,
		turnId: latest.turnId
	};
};

export const buildVoiceAgentSquadStatusReport = (
	timeline: VoiceTraceTimelineReport | null | undefined,
	options: Pick<VoiceAgentSquadStatusClientOptions, 'sessionId'> = {}
): VoiceAgentSquadStatusReport => {
	const sessions = (timeline?.sessions ?? [])
		.filter((session) => !options.sessionId || session.sessionId === options.sessionId)
		.map(deriveSessionSpecialist)
		.sort((left, right) => (right.lastEventAt ?? 0) - (left.lastEventAt ?? 0));
	const active = sessions.filter((session) => session.status !== 'idle');

	return {
		active,
		checkedAt: timeline?.checkedAt,
		current: active[0] ?? sessions[0],
		sessionCount: sessions.length,
		sessions
	};
};

export const createVoiceAgentSquadStatusStore = (
	path = '/api/voice-traces',
	options: VoiceAgentSquadStatusClientOptions = {}
) => {
	const timelineStore = createVoiceTraceTimelineStore(path, options);
	const getReport = () =>
		buildVoiceAgentSquadStatusReport(timelineStore.getSnapshot().report, {
			sessionId: options.sessionId
		});
	const getSnapshot = (): VoiceAgentSquadStatusSnapshot => {
		const snapshot = timelineStore.getSnapshot();
		return {
			error: snapshot.error,
			isLoading: snapshot.isLoading,
			report: getReport(),
			updatedAt: snapshot.updatedAt
		};
	};

	return {
		close: timelineStore.close,
		getServerSnapshot: getSnapshot,
		getSnapshot,
		refresh: timelineStore.refresh,
		subscribe: timelineStore.subscribe
	};
};
