import type {
	VoiceRealCallProfileDefault,
	VoiceRealCallProfileDefaultsReport,
	VoiceRealCallProfileHistoryReport
} from './proofTrends';
import {
	createVoiceAuditEvent,
	type StoredVoiceAuditEvent,
	type VoiceAuditActor,
	type VoiceAuditEventStore
} from './audit';

export type VoiceProfileSwitchObservedSignals = {
	currentProfileId?: string;
	fallbackUsed?: boolean;
	liveP95Ms?: number;
	providerP95Ms?: number;
	turnP95Ms?: number;
	turnWarnings?: number;
};

export type VoiceProfileSwitchRecommendation = {
	currentProfile?: {
		label?: string;
		profileId: string;
		status: string;
	};
	generatedAt: string;
	issues: string[];
	nextMove: string;
	ok: boolean;
	observed: VoiceProfileSwitchObservedSignals;
	reasons: string[];
	recommendedProfile?: {
		evidence: VoiceRealCallProfileDefault['evidence'];
		label?: string;
		latencyBudgets: VoiceRealCallProfileDefault['latencyBudgets'];
		profileId: string;
		providerRoutes: Record<string, string>;
		status: string;
	};
	status: 'stay' | 'switch' | 'warn';
};

export type VoiceProfileSwitchRecommendationOptions = {
	defaultProfileId?: string;
	defaults: VoiceRealCallProfileDefaultsReport | VoiceRealCallProfileHistoryReport;
	minImprovementMs?: number;
	observed?: VoiceProfileSwitchObservedSignals;
};

export type VoiceProfileSwitchGuardMode = 'auto' | 'recommend';

export type VoiceProfileSwitchGuardAction =
	| 'blocked'
	| 'recommend'
	| 'stay'
	| 'switch';

export type VoiceProfileSwitchGuardDecision = {
	action: VoiceProfileSwitchGuardAction;
	auditEvent?: StoredVoiceAuditEvent;
	autoApplied: boolean;
	confidence: number;
	minConfidence: number;
	mode: VoiceProfileSwitchGuardMode;
	previousProfileId?: string;
	reason: string;
	recommendation: VoiceProfileSwitchRecommendation;
	recommendedProfileId?: string;
	selectedProfileId?: string;
};

export type VoiceProfileSwitchGuardOptions = VoiceProfileSwitchRecommendationOptions & {
	actor?: VoiceAuditActor;
	audit?: VoiceAuditEventStore;
	metadata?: Record<string, unknown>;
	minConfidence?: number;
	mode?: VoiceProfileSwitchGuardMode;
	sessionId?: string;
	traceId?: string;
};

const readDefaults = (
	input: VoiceRealCallProfileDefaultsReport | VoiceRealCallProfileHistoryReport
) => ('defaults' in input ? input.defaults : input);

const isNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

const exceeds = (observed: number | undefined, budget: number | undefined) =>
	isNumber(observed) && isNumber(budget) && observed > budget;

const scoreProfile = (
	profile: VoiceRealCallProfileDefault,
	observed: VoiceProfileSwitchObservedSignals
) => {
	const evidence = profile.evidence;
	const live = evidence.liveP95Ms ?? observed.liveP95Ms ?? 0;
	const provider = evidence.providerP95Ms ?? observed.providerP95Ms ?? 0;
	const turn = evidence.turnP95Ms ?? observed.turnP95Ms ?? 0;
	const statusPenalty =
		profile.status === 'pass' ? 0 : profile.status === 'warn' ? 10_000 : 25_000;
	const noisyBonus =
		(observed.fallbackUsed || (observed.turnWarnings ?? 0) > 0) &&
		/noisy|phone/i.test(`${profile.profileId} ${profile.label ?? ''}`)
			? -1_000
			: 0;
	return live + provider + turn + statusPenalty + noisyBonus;
};

const clampConfidence = (value: number) =>
	Math.max(0, Math.min(0.99, Number(value.toFixed(2))));

const estimateSwitchConfidence = (
	recommendation: VoiceProfileSwitchRecommendation
) => {
	if (!recommendation.ok || recommendation.status !== 'switch') {
		return recommendation.status === 'stay' && recommendation.ok ? 0.99 : 0;
	}

	const observed = recommendation.observed;
	const currentStatus = recommendation.currentProfile?.status;
	const recommendedStatus = recommendation.recommendedProfile?.status;
	let confidence = 0.58;

	if (currentStatus && currentStatus !== 'pass') {
		confidence += 0.12;
	}
	if (recommendedStatus === 'pass') {
		confidence += 0.1;
	}
	if (observed.fallbackUsed) {
		confidence += 0.08;
	}
	if ((observed.turnWarnings ?? 0) > 0) {
		confidence += 0.08;
	}
	if (
		recommendation.reasons.some((reason) =>
			/budget|strongest measured fit/i.test(reason)
		)
	) {
		confidence += 0.08;
	}

	return clampConfidence(confidence);
};

export const recommendVoiceProfileSwitch = (
	options: VoiceProfileSwitchRecommendationOptions
): VoiceProfileSwitchRecommendation => {
	const defaults = readDefaults(options.defaults);
	const observed = options.observed ?? {};
	const currentProfileId =
		observed.currentProfileId ?? options.defaultProfileId ?? defaults.profiles[0]?.profileId;
	const currentProfile = defaults.profiles.find(
		(profile) => profile.profileId === currentProfileId
	);
	const candidates = defaults.profiles.filter((profile) => profile.status !== 'fail');
	const recommended = candidates
		.slice()
		.sort(
			(left, right) =>
				scoreProfile(left, observed) - scoreProfile(right, observed)
		)[0];
	const issues = [
		...(defaults.profiles.length === 0
			? ['No measured profile defaults are available.']
			: []),
		...(!currentProfile && currentProfileId
			? [`Current profile ${currentProfileId} is not present in measured defaults.`]
			: []),
		...(!recommended ? ['No non-failing measured profile can be recommended.'] : [])
	];
	const currentOverBudget = currentProfile
		? [
				exceeds(observed.liveP95Ms, currentProfile.latencyBudgets.maxLiveP95Ms)
					? 'live p95 exceeds this profile budget'
					: undefined,
				exceeds(
					observed.providerP95Ms,
					currentProfile.latencyBudgets.maxProviderP95Ms
				)
					? 'provider p95 exceeds this profile budget'
					: undefined,
				exceeds(observed.turnP95Ms, currentProfile.latencyBudgets.maxTurnP95Ms)
					? 'turn p95 exceeds this profile budget'
					: undefined
			].filter((reason): reason is string => Boolean(reason))
		: [];
	const minImprovementMs = options.minImprovementMs ?? 250;
	const currentScore = currentProfile
		? scoreProfile(currentProfile, observed)
		: Number.POSITIVE_INFINITY;
	const recommendedScore = recommended
		? scoreProfile(recommended, observed)
		: Number.POSITIVE_INFINITY;
	const shouldSwitch =
		Boolean(recommended) &&
		recommended?.profileId !== currentProfile?.profileId &&
		(!currentProfile ||
			currentProfile.status !== 'pass' ||
			currentOverBudget.length > 0 ||
			currentScore - recommendedScore >= minImprovementMs);
	const reasons = [
		...currentOverBudget,
		...(currentProfile?.status && currentProfile.status !== 'pass'
			? [`current profile is ${currentProfile.status}`]
			: []),
		...(observed.fallbackUsed
			? ['current session used provider fallback']
			: []),
		...((observed.turnWarnings ?? 0) > 0
			? [`${observed.turnWarnings} turn quality warning(s) observed`]
			: []),
		...(shouldSwitch && recommended
			? [
					`${recommended.label ?? recommended.profileId} has the strongest measured fit for these signals`
				]
			: [])
	];

	return {
		currentProfile: currentProfile
			? {
					label: currentProfile.label,
					profileId: currentProfile.profileId,
					status: currentProfile.status
				}
			: undefined,
		generatedAt: new Date().toISOString(),
		issues,
		nextMove:
			issues.length > 0
				? 'Collect fresh real-call profile evidence before switching automatically.'
				: shouldSwitch && recommended
					? `Switch to ${recommended.label ?? recommended.profileId} for this session profile.`
					: 'Keep the current measured profile unless new session evidence drifts.',
		ok: issues.length === 0,
		observed,
		reasons:
			reasons.length > 0
				? reasons
				: ['current profile matches measured defaults and observed budgets'],
		recommendedProfile: recommended
			? {
					evidence: recommended.evidence,
					label: recommended.label,
					latencyBudgets: recommended.latencyBudgets,
					profileId: recommended.profileId,
					providerRoutes: recommended.providerRoutes,
					status: recommended.status
				}
			: undefined,
		status: issues.length > 0 ? 'warn' : shouldSwitch ? 'switch' : 'stay'
	};
};

export const applyVoiceProfileSwitchGuard = async (
	options: VoiceProfileSwitchGuardOptions
): Promise<VoiceProfileSwitchGuardDecision> => {
	const mode = options.mode ?? 'recommend';
	const minConfidence = options.minConfidence ?? 0.75;
	const recommendation = recommendVoiceProfileSwitch(options);
	const confidence = estimateSwitchConfidence(recommendation);
	const previousProfileId = recommendation.currentProfile?.profileId;
	const recommendedProfileId = recommendation.recommendedProfile?.profileId;
	const canSwitch =
		recommendation.status === 'switch' &&
		recommendation.ok &&
		Boolean(recommendedProfileId) &&
		confidence >= minConfidence;
	const action: VoiceProfileSwitchGuardAction =
		recommendation.status === 'stay'
			? 'stay'
			: canSwitch
				? mode === 'auto'
					? 'switch'
					: 'recommend'
				: 'blocked';
	const selectedProfileId =
		action === 'switch' ? recommendedProfileId : previousProfileId ?? recommendedProfileId;
	const reason =
		action === 'switch'
			? `Auto-switched from ${previousProfileId ?? 'unknown'} to ${recommendedProfileId}.`
			: action === 'recommend'
				? `Recommended ${recommendedProfileId} but left selection unchanged because mode is recommend.`
				: action === 'blocked'
					? `Blocked profile switch because confidence ${confidence} is below ${minConfidence} or evidence is incomplete.`
					: 'Kept current profile because measured evidence does not require a switch.';
	const decision: VoiceProfileSwitchGuardDecision = {
		action,
		autoApplied: action === 'switch',
		confidence,
		minConfidence,
		mode,
		previousProfileId,
		reason,
		recommendation,
		recommendedProfileId,
		selectedProfileId
	};

	if (options.audit) {
		const auditEvent = await options.audit.append(
			createVoiceAuditEvent({
				action: `profile.switch.${action}`,
				actor: options.actor ?? {
					id: 'absolutejs-voice-profile-switch-guard',
					kind: 'system',
					name: 'AbsoluteJS Voice Profile Switch Guard'
				},
				metadata: options.metadata,
				outcome: action === 'blocked' ? 'skipped' : 'success',
				payload: {
					autoApplied: decision.autoApplied,
					confidence,
					minConfidence,
					mode,
					previousProfileId,
					reasons: recommendation.reasons,
					recommendedProfileId,
					selectedProfileId,
					status: recommendation.status
				},
				resource: {
					id: selectedProfileId,
					type: 'voice-profile'
				},
				sessionId: options.sessionId,
				traceId: options.traceId,
				type: 'profile.switch'
			})
		);
		decision.auditEvent = auditEvent;
	}

	return decision;
};
