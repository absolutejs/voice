import { describe, expect, test } from 'bun:test';
import {
	applyVoiceProfileSwitchGuard,
	createVoiceProfileSwitchPolicyProofRoutes,
	createVoiceMemoryAuditEventStore,
	recommendVoiceProfileSwitch,
	runVoiceProfileSwitchPolicyProof,
	type VoiceRealCallProfileDefaultsReport
} from '../src';

const defaults: VoiceRealCallProfileDefaultsReport = {
	generatedAt: '2026-04-30T00:00:00.000Z',
	ok: true,
	profiles: [
		{
			evidence: {
				liveP95Ms: 900,
				providerP95Ms: 700,
				turnP95Ms: 1200
			},
			label: 'Meeting recorder',
			latencyBudgets: {
				maxLiveP95Ms: 1000,
				maxProviderP95Ms: 800,
				maxTurnP95Ms: 1300
			},
			nextMove: 'Keep meeting-recorder for clean meeting sessions.',
			profileId: 'meeting-recorder',
			providerRoutes: {
				llm: 'openai',
				stt: 'deepgram',
				tts: 'elevenlabs'
			},
			providers: [],
			status: 'pass'
		},
		{
			evidence: {
				liveP95Ms: 650,
				providerP95Ms: 450,
				turnP95Ms: 850
			},
			label: 'Noisy phone call',
			latencyBudgets: {
				maxLiveP95Ms: 900,
				maxProviderP95Ms: 650,
				maxTurnP95Ms: 1000
			},
			nextMove: 'Use noisy-phone-call when fallback or turn warnings show noisy conditions.',
			profileId: 'noisy-phone-call',
			providerRoutes: {
				llm: 'openai',
				stt: 'assemblyai',
				tts: 'elevenlabs'
			},
			providers: [],
			status: 'pass'
		}
	],
	issues: [],
	source: 'test',
	status: 'pass',
	summary: {
		actionableProfiles: 2,
		profileCount: 2,
		requiredProviderRoles: ['llm', 'stt', 'tts']
	}
};

describe('profile switch recommendations', () => {
	test('recommends a stronger measured profile when current signals drift', () => {
		const recommendation = recommendVoiceProfileSwitch({
			defaults,
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(recommendation.status).toBe('switch');
		expect(recommendation.recommendedProfile?.profileId).toBe('noisy-phone-call');
		expect(recommendation.reasons).toContain(
			'current session used provider fallback'
		);
	});

	test('auto guard switches only when confidence passes and records audit evidence', async () => {
		const audit = createVoiceMemoryAuditEventStore();
		const decision = await applyVoiceProfileSwitchGuard({
			audit,
			defaults,
			mode: 'auto',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			},
			sessionId: 'session-profile-switch'
		});

		expect(decision.action).toBe('switch');
		expect(decision.autoApplied).toBe(true);
		expect(decision.selectedProfileId).toBe('noisy-phone-call');
		expect(decision.auditEvent).toMatchObject({
			action: 'profile.switch.switch',
			outcome: 'success',
			sessionId: 'session-profile-switch',
			type: 'profile.switch'
		});
		expect(await audit.list({ type: 'profile.switch' })).toHaveLength(1);
	});

	test('recommend mode leaves selection unchanged while auditing the recommendation', async () => {
		const audit = createVoiceMemoryAuditEventStore();
		const decision = await applyVoiceProfileSwitchGuard({
			audit,
			defaults,
			mode: 'recommend',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				turnWarnings: 1
			}
		});

		expect(decision.action).toBe('recommend');
		expect(decision.autoApplied).toBe(false);
		expect(decision.selectedProfileId).toBe('meeting-recorder');
		expect(decision.auditEvent?.outcome).toBe('success');
	});

	test('blocks automatic switching when the confidence threshold is not met', async () => {
		const audit = createVoiceMemoryAuditEventStore();
		const decision = await applyVoiceProfileSwitchGuard({
			audit,
			defaults,
			minConfidence: 0.98,
			mode: 'auto',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				turnWarnings: 1
			}
		});

		expect(decision.action).toBe('blocked');
		expect(decision.selectedProfileId).toBe('meeting-recorder');
		expect(decision.auditEvent?.outcome).toBe('skipped');
	});

	test('off mode disables switching even when evidence is strong', async () => {
		const audit = createVoiceMemoryAuditEventStore();
		const decision = await applyVoiceProfileSwitchGuard({
			audit,
			defaults,
			mode: 'off',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(decision.action).toBe('disabled');
		expect(decision.autoApplied).toBe(false);
		expect(decision.selectedProfileId).toBe('meeting-recorder');
		expect(decision.auditEvent?.outcome).toBe('skipped');
	});

	test('allowed profile policy blocks unlisted switch targets', async () => {
		const decision = await applyVoiceProfileSwitchGuard({
			allowedProfileIds: ['meeting-recorder'],
			defaults,
			mode: 'auto',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(decision.action).toBe('blocked');
		expect(decision.blockedByPolicy).toBe('allowed-profiles');
		expect(decision.selectedProfileId).toBe('meeting-recorder');
	});

	test('blocked profile policy denies unsafe switch targets', async () => {
		const decision = await applyVoiceProfileSwitchGuard({
			blockedProfileIds: ['noisy-phone-call'],
			defaults,
			mode: 'auto',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(decision.action).toBe('blocked');
		expect(decision.blockedByPolicy).toBe('blocked-profiles');
		expect(decision.selectedProfileId).toBe('meeting-recorder');
	});

	test('max switch policy blocks automatic switches after the session budget is used', async () => {
		const decision = await applyVoiceProfileSwitchGuard({
			autoSwitchCount: 1,
			defaults,
			maxAutoSwitchesPerSession: 1,
			mode: 'auto',
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(decision.action).toBe('blocked');
		expect(decision.blockedByPolicy).toBe('max-switches');
		expect(decision.selectedProfileId).toBe('meeting-recorder');
	});

	test('policy proof runs bounded profile switching cases', async () => {
		const report = await runVoiceProfileSwitchPolicyProof({
			allowedProfileIds: ['meeting-recorder', 'noisy-phone-call'],
			defaults,
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		expect(report.ok).toBe(true);
		expect(report.summary).toEqual({ failed: 0, passed: 6, total: 6 });
		expect(report.results.map((result) => result.decision.action)).toEqual([
			'switch',
			'recommend',
			'disabled',
			'blocked',
			'blocked',
			'blocked'
		]);
		expect(
			report.results.map((result) => result.decision.blockedByPolicy ?? null)
		).toEqual([
			null,
			null,
			null,
			'allowed-profiles',
			'blocked-profiles',
			'max-switches'
		]);
	});

	test('policy proof routes expose JSON and HTML', async () => {
		const app = createVoiceProfileSwitchPolicyProofRoutes({
			allowedProfileIds: ['meeting-recorder', 'noisy-phone-call'],
			defaults,
			observed: {
				currentProfileId: 'meeting-recorder',
				fallbackUsed: true,
				providerP95Ms: 950,
				turnWarnings: 3
			}
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/profile-switch-policy-proof')
		);
		const json = await jsonResponse.json();
		expect(json.ok).toBe(true);
		expect(json.summary.total).toBe(6);

		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/profile-switch-policy')
		);
		const html = await htmlResponse.text();
		expect(html).toContain('Voice Profile Switch Policy Proof');
		expect(html).toContain('Max switches');
		expect(html).toContain('PASS');
	});
});
