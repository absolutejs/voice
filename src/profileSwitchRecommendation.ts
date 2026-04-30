import { Elysia } from 'elysia';
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

export type VoiceProfileSwitchGuardMode = 'auto' | 'off' | 'recommend';

export type VoiceProfileSwitchGuardAction =
	| 'blocked'
	| 'disabled'
	| 'recommend'
	| 'stay'
	| 'switch';

export type VoiceProfileSwitchGuardDecision = {
	action: VoiceProfileSwitchGuardAction;
	auditEvent?: StoredVoiceAuditEvent;
	autoApplied: boolean;
	autoSwitchCount: number;
	blockedByPolicy?: 'allowed-profiles' | 'blocked-profiles' | 'max-switches';
	confidence: number;
	minConfidence: number;
	mode: VoiceProfileSwitchGuardMode;
	maxAutoSwitchesPerSession: number;
	previousProfileId?: string;
	reason: string;
	recommendation: VoiceProfileSwitchRecommendation;
	recommendedProfileId?: string;
	selectedProfileId?: string;
};

export type VoiceProfileSwitchGuardOptions = VoiceProfileSwitchRecommendationOptions & {
	actor?: VoiceAuditActor;
	allowedProfileIds?: string[];
	audit?: VoiceAuditEventStore;
	autoSwitchCount?: number;
	blockedProfileIds?: string[];
	maxAutoSwitchesPerSession?: number;
	metadata?: Record<string, unknown>;
	minConfidence?: number;
	mode?: VoiceProfileSwitchGuardMode;
	sessionId?: string;
	traceId?: string;
};

export type VoiceProfileSwitchPolicyProofCase = {
	description?: string;
	expectedAction?: VoiceProfileSwitchGuardAction;
	expectedBlockedByPolicy?: VoiceProfileSwitchGuardDecision['blockedByPolicy'];
	id: string;
	label?: string;
	options?: Partial<
		Omit<VoiceProfileSwitchGuardOptions, 'defaults' | 'observed'>
	> & {
		observed?: VoiceProfileSwitchObservedSignals;
	};
};

export type VoiceProfileSwitchPolicyProofCaseResult =
	VoiceProfileSwitchPolicyProofCase & {
		decision: VoiceProfileSwitchGuardDecision;
		ok: boolean;
	};

export type VoiceProfileSwitchPolicyProofReport = {
	generatedAt: string;
	ok: boolean;
	observed: VoiceProfileSwitchObservedSignals;
	results: VoiceProfileSwitchPolicyProofCaseResult[];
	summary: {
		failed: number;
		passed: number;
		total: number;
	};
};

export type VoiceProfileSwitchPolicyProofOptions = {
	actor?: VoiceAuditActor;
	allowedProfileIds?: string[];
	audit?: VoiceAuditEventStore;
	cases?: VoiceProfileSwitchPolicyProofCase[];
	defaults:
		| VoiceRealCallProfileDefaultsReport
		| VoiceRealCallProfileHistoryReport
		| (() =>
				| Promise<
						VoiceRealCallProfileDefaultsReport | VoiceRealCallProfileHistoryReport
				  >
				| VoiceRealCallProfileDefaultsReport
				| VoiceRealCallProfileHistoryReport);
	metadata?: Record<string, unknown>;
	minConfidence?: number;
	observed?: VoiceProfileSwitchObservedSignals;
	title?: string;
};

export type VoiceProfileSwitchPolicyProofRoutesOptions =
	VoiceProfileSwitchPolicyProofOptions & {
		htmlPath?: false | string;
		name?: string;
		path?: string;
		render?: (report: VoiceProfileSwitchPolicyProofReport) => string | Promise<string>;
	};

const readDefaults = (
	input: VoiceRealCallProfileDefaultsReport | VoiceRealCallProfileHistoryReport
) => ('defaults' in input ? input.defaults : input);

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const stringifyForHtml = (value: unknown) =>
	escapeHtml(JSON.stringify(value, null, 2) ?? '');

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
	const maxAutoSwitchesPerSession = Math.max(
		0,
		Math.floor(options.maxAutoSwitchesPerSession ?? 1)
	);
	const autoSwitchCount = Math.max(0, Math.floor(options.autoSwitchCount ?? 0));
	const recommendation = recommendVoiceProfileSwitch(options);
	const confidence = estimateSwitchConfidence(recommendation);
	const previousProfileId = recommendation.currentProfile?.profileId;
	const recommendedProfileId = recommendation.recommendedProfile?.profileId;
	const isRecommendedAllowed =
		!recommendedProfileId ||
		!options.allowedProfileIds ||
		options.allowedProfileIds.length === 0 ||
		options.allowedProfileIds.includes(recommendedProfileId);
	const isRecommendedBlocked =
		recommendedProfileId
			? Boolean(options.blockedProfileIds?.includes(recommendedProfileId))
			: false;
	const blockedByPolicy: VoiceProfileSwitchGuardDecision['blockedByPolicy'] =
		!isRecommendedAllowed
			? 'allowed-profiles'
			: isRecommendedBlocked
				? 'blocked-profiles'
				: mode === 'auto' && autoSwitchCount >= maxAutoSwitchesPerSession
					? 'max-switches'
					: undefined;
	const canSwitch =
		mode !== 'off' &&
		recommendation.status === 'switch' &&
		recommendation.ok &&
		Boolean(recommendedProfileId) &&
		confidence >= minConfidence &&
		!blockedByPolicy;
	const action: VoiceProfileSwitchGuardAction =
		mode === 'off'
			? 'disabled'
			: recommendation.status === 'stay'
			? 'stay'
			: canSwitch
				? mode === 'auto'
					? 'switch'
					: 'recommend'
				: 'blocked';
	const selectedProfileId =
		action === 'switch' ? recommendedProfileId : previousProfileId ?? recommendedProfileId;
	const reason =
		action === 'disabled'
			? 'Profile switch guard is disabled by policy.'
			: action === 'switch'
			? `Auto-switched from ${previousProfileId ?? 'unknown'} to ${recommendedProfileId}.`
			: action === 'recommend'
				? `Recommended ${recommendedProfileId} but left selection unchanged because mode is recommend.`
				: action === 'blocked'
					? blockedByPolicy === 'allowed-profiles'
						? `Blocked profile switch because ${recommendedProfileId} is not in the allowed profile list.`
						: blockedByPolicy === 'blocked-profiles'
							? `Blocked profile switch because ${recommendedProfileId} is in the blocked profile list.`
							: blockedByPolicy === 'max-switches'
								? `Blocked profile switch because the session already used ${autoSwitchCount} of ${maxAutoSwitchesPerSession} allowed automatic switch(es).`
								: `Blocked profile switch because confidence ${confidence} is below ${minConfidence} or evidence is incomplete.`
					: 'Kept current profile because measured evidence does not require a switch.';
	const decision: VoiceProfileSwitchGuardDecision = {
		action,
		autoApplied: action === 'switch',
		autoSwitchCount,
		blockedByPolicy,
		confidence,
		maxAutoSwitchesPerSession,
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
				outcome:
					action === 'blocked' || action === 'disabled' ? 'skipped' : 'success',
				payload: {
					autoApplied: decision.autoApplied,
					autoSwitchCount,
					blockedByPolicy,
					confidence,
					maxAutoSwitchesPerSession,
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

const resolvePolicyProofDefaults = async (
	defaults: VoiceProfileSwitchPolicyProofOptions['defaults']
) => (typeof defaults === 'function' ? await defaults() : defaults);

const createDefaultPolicyProofCases = (input: {
	allowedProfileIds: string[];
	recommendedProfileId?: string;
}): VoiceProfileSwitchPolicyProofCase[] => [
	{
		description: 'Strong evidence can auto-apply a better measured profile.',
		expectedAction: 'switch',
		id: 'auto-switch',
		label: 'Auto switch',
		options: { mode: 'auto' }
	},
	{
		description: 'Recommend mode records the recommendation without changing selection.',
		expectedAction: 'recommend',
		id: 'recommend-only',
		label: 'Recommend only',
		options: { mode: 'recommend' }
	},
	{
		description: 'Off mode records that switching is disabled by policy.',
		expectedAction: 'disabled',
		id: 'disabled',
		label: 'Disabled',
		options: { mode: 'off' }
	},
	{
		description: 'Allowed-profile policy prevents switching outside scope.',
		expectedAction: 'blocked',
		expectedBlockedByPolicy: 'allowed-profiles',
		id: 'allowed-policy',
		label: 'Allowed profiles',
		options: {
			allowedProfileIds: input.allowedProfileIds.slice(0, 1),
			mode: 'auto'
		}
	},
	{
		description: 'Blocked-profile policy rejects unsafe target profiles.',
		expectedAction: 'blocked',
		expectedBlockedByPolicy: 'blocked-profiles',
		id: 'blocked-policy',
		label: 'Blocked profiles',
		options: {
			blockedProfileIds: input.recommendedProfileId
				? [input.recommendedProfileId]
				: input.allowedProfileIds.slice(-1),
			mode: 'auto'
		}
	},
	{
		description: 'Max-switch budget stops repeated automatic changes.',
		expectedAction: 'blocked',
		expectedBlockedByPolicy: 'max-switches',
		id: 'max-switches',
		label: 'Max switches',
		options: {
			autoSwitchCount: 1,
			maxAutoSwitchesPerSession: 1,
			mode: 'auto'
		}
	}
];

export const runVoiceProfileSwitchPolicyProof = async (
	options: VoiceProfileSwitchPolicyProofOptions
): Promise<VoiceProfileSwitchPolicyProofReport> => {
	const defaultsInput = await resolvePolicyProofDefaults(options.defaults);
	const defaults = readDefaults(defaultsInput);
	const allowedProfileIds =
		options.allowedProfileIds ?? defaults.profiles.map((profile) => profile.profileId);
	const observed = options.observed ?? {
		currentProfileId: allowedProfileIds[0],
		fallbackUsed: true,
		providerP95Ms: 950,
		turnWarnings: 3
	};
	const baseRecommendation = recommendVoiceProfileSwitch({
		defaults: defaultsInput,
		observed
	});
	const cases =
		options.cases ??
		createDefaultPolicyProofCases({
			allowedProfileIds,
			recommendedProfileId: baseRecommendation.recommendedProfile?.profileId
		});
	const results = await Promise.all(
		cases.map(async (proofCase) => {
			const caseOptions = proofCase.options ?? {};
			const decision = await applyVoiceProfileSwitchGuard({
				actor: options.actor,
				allowedProfileIds,
				audit: options.audit,
				defaults: defaultsInput,
				maxAutoSwitchesPerSession: 1,
				metadata: {
					...options.metadata,
					caseId: proofCase.id,
					proof: 'profile-switch-policy'
				},
				minConfidence: options.minConfidence ?? 0.75,
				sessionId: `profile-policy-proof-${proofCase.id}`,
				...caseOptions,
				observed: caseOptions.observed ?? observed
			});
			const ok =
				(!proofCase.expectedAction ||
					decision.action === proofCase.expectedAction) &&
				(!proofCase.expectedBlockedByPolicy ||
					decision.blockedByPolicy === proofCase.expectedBlockedByPolicy);

			return {
				...proofCase,
				decision,
				ok
			};
		})
	);

	return {
		generatedAt: new Date().toISOString(),
		ok: results.every((result) => result.ok),
		observed,
		results,
		summary: {
			failed: results.filter((result) => !result.ok).length,
			passed: results.filter((result) => result.ok).length,
			total: results.length
		}
	};
};

export const renderVoiceProfileSwitchPolicyProofHTML = (
	report: VoiceProfileSwitchPolicyProofReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'Voice Profile Switch Policy Proof';
	const rows = report.results
		.map(
			(result) => `<tr>
  <td><strong>${escapeHtml(result.label ?? result.id)}</strong><p>${escapeHtml(result.description ?? '')}</p></td>
  <td>${escapeHtml(result.expectedAction ?? 'n/a')}</td>
  <td>${escapeHtml(result.decision.action)}</td>
  <td>${escapeHtml(result.decision.selectedProfileId ?? 'none')}</td>
  <td>${escapeHtml(result.decision.blockedByPolicy ?? 'none')}</td>
  <td>${Math.round(result.decision.confidence * 100)}%</td>
  <td><span class="status ${result.ok ? 'pass' : 'fail'}">${result.ok ? 'PASS' : 'FAIL'}</span></td>
</tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark;background:#07110e;color:#e8fff5;font-family:ui-sans-serif,system-ui,sans-serif}body{margin:0;padding:32px;background:radial-gradient(circle at top left,rgba(45,212,191,.2),transparent 34%),#07110e}main{max-width:1120px;margin:0 auto}a{color:#67e8f9}.hero,.card{border:1px solid rgba(148,163,184,.24);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 90px rgba(0,0,0,.24);padding:24px;margin-bottom:18px}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;background:rgba(8,47,73,.34)}.metric span{display:block;color:#9ca3af;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;margin-top:8px;font-size:1.6rem}table{width:100%;border-collapse:collapse;overflow:hidden;border-radius:18px}th,td{padding:14px;text-align:left;border-bottom:1px solid rgba(148,163,184,.18);vertical-align:top}th{color:#a7f3d0;text-transform:uppercase;font-size:.75rem;letter-spacing:.08em}td p{margin:.4rem 0 0;color:#a7b5ae}pre{white-space:pre-wrap;overflow:auto;border-radius:18px;background:#020617;padding:18px;color:#d1fae5}.status{display:inline-flex;border-radius:999px;padding:5px 10px;font-weight:800;font-size:.75rem}.pass{background:rgba(34,197,94,.18);color:#bbf7d0}.fail{background:rgba(239,68,68,.18);color:#fecaca}</style></head><body><main><section class="hero"><p><a href="#raw-report">Raw report</a></p><h1>${escapeHtml(title)}</h1><p>This page proves profile switching is production-bounded: teams can disable it, run recommend-only, auto-apply with confidence, restrict allowed targets, block unsafe targets, and cap automatic switches per session.</p><div class="metric-grid"><div class="metric"><span>Status</span><strong>${report.ok ? 'PASS' : 'FAIL'}</strong></div><div class="metric"><span>Cases</span><strong>${report.summary.passed}/${report.summary.total}</strong></div><div class="metric"><span>Generated</span><strong>${escapeHtml(report.generatedAt)}</strong></div></div></section><section class="card"><h2>Policy Cases</h2><table><thead><tr><th>Case</th><th>Expected</th><th>Actual</th><th>Selected</th><th>Blocked by</th><th>Confidence</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section><section class="card" id="raw-report"><h2>Raw Report</h2><pre>${stringifyForHtml(report)}</pre></section></main></body></html>`;
};

export const createVoiceProfileSwitchPolicyProofRoutes = (
	options: VoiceProfileSwitchPolicyProofRoutesOptions
) => {
	const path = options.path ?? '/api/voice/profile-switch-policy-proof';
	const htmlPath =
		options.htmlPath === undefined ? '/voice/profile-switch-policy' : options.htmlPath;
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-profile-switch-policy-proof'
	}).get(path, async () => runVoiceProfileSwitchPolicyProof(options));

	if (htmlPath) {
		routes.get(htmlPath, async () => {
			const report = await runVoiceProfileSwitchPolicyProof(options);
			const render =
				options.render ??
				((input: VoiceProfileSwitchPolicyProofReport) =>
					renderVoiceProfileSwitchPolicyProofHTML(input, {
						title: options.title
					}));
			return new Response(await render(report), {
				headers: { 'Content-Type': 'text/html; charset=utf-8' }
			});
		});
	}

	return routes;
};
