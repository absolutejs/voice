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

export type VoiceSessionSnapshot = {
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
	media?: readonly Pick<MediaProcessorGraphSnapshot, 'report'>[];
	proofSummary?: Pick<VoiceProofAssertionSummary, 'ok'>;
	quality?: readonly Pick<VoiceSessionSnapshotQualityEvidence, 'status'>[];
	telephonyOutcomes?: readonly Pick<
		VoiceCampaignTelephonyOutcomeSnapshot,
		'campaignOutcome' | 'duplicate'
	>[];
}): VoiceSessionSnapshotStatus => {
	const statuses: VoiceSessionSnapshotStatus[] = [];

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
	const proofAssertions = [...(input.proofAssertions ?? [])];
	const proofSummary = summarizeVoiceProofAssertions(proofAssertions);
	const media = [...(input.media ?? [])];
	const providerRoutingEvents = [...(input.providerRoutingEvents ?? [])];
	const quality = [...(input.quality ?? [])];
	const telephonyOutcomes = [...(input.telephonyOutcomes ?? [])];

	return {
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
