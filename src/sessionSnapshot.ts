import { Elysia } from 'elysia';
import type { MediaProcessorGraphSnapshot } from '@absolutejs/media';
import { summarizeVoiceProofAssertions } from './proofAssertions';
import type {
	VoiceProofAssertionResult,
	VoiceProofAssertionSummary
} from './proofAssertions';
import type { VoiceCampaignTelephonyOutcomeSnapshot } from './campaign';
import type { StoredVoiceTraceEvent } from './trace';

export type VoiceSessionSnapshotStatus = 'fail' | 'pass' | 'warn';

export type VoiceSessionSnapshotQualityEvidence = {
	name: string;
	report: unknown;
	status?: VoiceSessionSnapshotStatus;
};

export type VoiceSessionSnapshotArtifactKind =
	| 'failure-replay'
	| 'incident-bundle'
	| 'operations-record'
	| 'provider-fallback'
	| 'trace'
	| 'custom';

export type VoiceSessionSnapshotArtifact = {
	href?: string;
	kind: VoiceSessionSnapshotArtifactKind;
	label: string;
	report?: unknown;
	status?: VoiceSessionSnapshotStatus;
};

export type VoiceSessionSnapshot = {
	artifacts: readonly VoiceSessionSnapshotArtifact[];
	capturedAt: number;
	media: readonly MediaProcessorGraphSnapshot[];
	name?: string;
	proofAssertions: readonly VoiceProofAssertionResult[];
	proofSummary: VoiceProofAssertionSummary;
	providerRoutingEvents: readonly StoredVoiceTraceEvent[];
	quality: readonly VoiceSessionSnapshotQualityEvidence[];
	scenarioId?: string;
	schema: 'absolute.voice.session.snapshot.v1';
	sessionId: string;
	status: VoiceSessionSnapshotStatus;
	telephonyOutcomes: readonly VoiceCampaignTelephonyOutcomeSnapshot[];
	turnId?: string;
};

export type VoiceSessionSnapshotInput = {
	artifacts?: readonly VoiceSessionSnapshotArtifact[];
	media?: readonly MediaProcessorGraphSnapshot[];
	name?: string;
	proofAssertions?: readonly VoiceProofAssertionResult[];
	providerRoutingEvents?: readonly StoredVoiceTraceEvent[];
	quality?: readonly VoiceSessionSnapshotQualityEvidence[];
	scenarioId?: string;
	sessionId: string;
	telephonyOutcomes?: readonly VoiceCampaignTelephonyOutcomeSnapshot[];
	turnId?: string;
};

export type VoiceSessionSnapshotRouteSourceInput = {
	request: Request;
	sessionId: string;
	turnId?: string;
};

export type VoiceSessionSnapshotRouteSource =
	| VoiceSessionSnapshot
	| VoiceSessionSnapshotInput
	| ((
			input: VoiceSessionSnapshotRouteSourceInput
	  ) =>
			| Promise<VoiceSessionSnapshot | VoiceSessionSnapshotInput>
			| VoiceSessionSnapshot
			| VoiceSessionSnapshotInput);

export type VoiceSessionSnapshotRoutesOptions =
	Partial<VoiceSessionSnapshotInput> & {
		downloadPath?: false | string;
		headers?: HeadersInit;
		name?: string;
		path?: string;
		source?: VoiceSessionSnapshotRouteSource;
	};

const statusRank = (status: VoiceSessionSnapshotStatus): number => {
	if (status === 'fail') {
		return 2;
	}
	if (status === 'warn') {
		return 1;
	}
	return 0;
};

const maxStatus = (
	statuses: readonly VoiceSessionSnapshotStatus[]
): VoiceSessionSnapshotStatus =>
	statuses.reduce<VoiceSessionSnapshotStatus>(
		(current, status) =>
			statusRank(status) > statusRank(current) ? status : current,
		'pass'
	);

export const buildVoiceSessionSnapshotStatus = (input: {
	artifacts?: readonly Pick<VoiceSessionSnapshotArtifact, 'status'>[];
	media?: readonly Pick<MediaProcessorGraphSnapshot, 'report'>[];
	proofSummary?: Pick<VoiceProofAssertionSummary, 'ok'>;
	quality?: readonly Pick<VoiceSessionSnapshotQualityEvidence, 'status'>[];
	telephonyOutcomes?: readonly Pick<
		VoiceCampaignTelephonyOutcomeSnapshot,
		'campaignOutcome' | 'duplicate'
	>[];
}): VoiceSessionSnapshotStatus => {
	const statuses: VoiceSessionSnapshotStatus[] = [];

	for (const artifact of input.artifacts ?? []) {
		if (artifact.status !== undefined) {
			statuses.push(artifact.status);
		}
	}
	for (const media of input.media ?? []) {
		statuses.push(media.report.status);
	}
	for (const quality of input.quality ?? []) {
		if (quality.status !== undefined) {
			statuses.push(quality.status);
		}
	}
	for (const outcome of input.telephonyOutcomes ?? []) {
		if (outcome.campaignOutcome.status === 'failed') {
			statuses.push('fail');
		} else if (outcome.duplicate === true || !outcome.campaignOutcome.applied) {
			statuses.push('warn');
		}
	}
	if (input.proofSummary?.ok === false) {
		statuses.push('fail');
	}

	return maxStatus(statuses);
};

export const buildVoiceSessionSnapshot = (
	input: VoiceSessionSnapshotInput
): VoiceSessionSnapshot => {
	const artifacts = [...(input.artifacts ?? [])];
	const proofAssertions = [...(input.proofAssertions ?? [])];
	const proofSummary = summarizeVoiceProofAssertions(proofAssertions);
	const media = [...(input.media ?? [])];
	const providerRoutingEvents = [...(input.providerRoutingEvents ?? [])];
	const quality = [...(input.quality ?? [])];
	const telephonyOutcomes = [...(input.telephonyOutcomes ?? [])];

	return {
		artifacts,
		capturedAt: Date.now(),
		media,
		name: input.name,
		proofAssertions,
		proofSummary,
		providerRoutingEvents,
		quality,
		scenarioId: input.scenarioId,
		schema: 'absolute.voice.session.snapshot.v1',
		sessionId: input.sessionId,
		status: buildVoiceSessionSnapshotStatus({
			artifacts,
			media,
			proofSummary,
			quality,
			telephonyOutcomes
		}),
		telephonyOutcomes,
		turnId: input.turnId
	};
};

export const parseVoiceSessionSnapshot = (
	snapshot: VoiceSessionSnapshot
): VoiceSessionSnapshot => {
	if (snapshot.schema !== 'absolute.voice.session.snapshot.v1') {
		throw new Error('Unsupported voice session snapshot schema.');
	}
	return snapshot;
};

const isVoiceSessionSnapshot = (
	value: VoiceSessionSnapshot | VoiceSessionSnapshotInput
): value is VoiceSessionSnapshot =>
	(value as VoiceSessionSnapshot).schema === 'absolute.voice.session.snapshot.v1';

const sessionSnapshotJsonResponse = (
	snapshot: VoiceSessionSnapshot,
	headers: HeadersInit = {},
	downloadFilename?: string
) =>
	new Response(JSON.stringify(snapshot, null, 2), {
		headers: {
			...(downloadFilename
				? {
						'content-disposition': `attachment; filename="${downloadFilename.replaceAll('"', '')}"`
					}
				: {}),
			'content-type': 'application/json; charset=utf-8',
			...headers
		}
	});

const resolveVoiceSessionSnapshot = async (
	options: VoiceSessionSnapshotRoutesOptions,
	input: VoiceSessionSnapshotRouteSourceInput
): Promise<VoiceSessionSnapshot> => {
	const source =
		typeof options.source === 'function'
			? await options.source(input)
			: (options.source ?? {
					media: options.media,
					artifacts: options.artifacts,
					name: options.name,
					proofAssertions: options.proofAssertions,
					providerRoutingEvents: options.providerRoutingEvents,
					quality: options.quality,
					scenarioId: options.scenarioId,
					sessionId: options.sessionId ?? input.sessionId,
					telephonyOutcomes: options.telephonyOutcomes,
					turnId: options.turnId ?? input.turnId
				});

	if (isVoiceSessionSnapshot(source)) {
		return parseVoiceSessionSnapshot(source);
	}

	return buildVoiceSessionSnapshot({
		...source,
		sessionId: source.sessionId ?? input.sessionId,
		turnId: source.turnId ?? input.turnId
	});
};

const readRouteSessionId = (params: Record<string, unknown>) => {
	const sessionId = params.sessionId;
	return typeof sessionId === 'string' ? sessionId : '';
};

export const createVoiceSessionSnapshotRoutes = (
	options: VoiceSessionSnapshotRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice/session-snapshot/:sessionId';
	const downloadPath =
		options.downloadPath ?? '/api/voice/session-snapshot/:sessionId/download';
	const headers = options.headers ?? {};
	const app = new Elysia({ name: options.name ?? 'voice-session-snapshot' }).get(
		path,
		async ({ params, request, query }) =>
			sessionSnapshotJsonResponse(
				await resolveVoiceSessionSnapshot(options, {
					request,
					sessionId: readRouteSessionId(params),
					turnId: typeof query.turnId === 'string' ? query.turnId : undefined
				}),
				headers
			)
	);

	if (downloadPath !== false) {
		app.get(downloadPath, async ({ params, request, query }) => {
			const snapshot = await resolveVoiceSessionSnapshot(options, {
				request,
				sessionId: readRouteSessionId(params),
				turnId: typeof query.turnId === 'string' ? query.turnId : undefined
			});
			return sessionSnapshotJsonResponse(
				snapshot,
				headers,
				`voice-session-${snapshot.sessionId}.snapshot.json`
			);
		});
	}

	return app;
};
