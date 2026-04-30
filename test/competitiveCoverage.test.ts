import { describe, expect, test } from 'bun:test';
import {
	assertVoiceCompetitiveCoverage,
	buildVoiceCompetitiveCoverageReport,
	createVoiceCompetitiveCoverageRoutes,
	evaluateVoiceCompetitiveCoverage,
	renderVoiceCompetitiveCoverageMarkdown,
	type VoiceCompetitiveSurface
} from '../src';

const surfaces: VoiceCompetitiveSurface[] = [
	{
		buyerNeed: 'Understand one call without a hosted dashboard.',
		competitors: ['Vapi', 'Retell', 'Bland'],
		coverage: 'covered',
		depth: 'advantage',
		evidence: [
			{
				href: '/voice-operations/session-1',
				kind: 'operations-record',
				name: 'operationsRecord',
				required: true,
				status: 'pass'
			},
			{
				href: '/production-readiness',
				kind: 'readiness',
				name: 'readinessGate',
				required: true,
				status: 'pass'
			}
		],
		frameworkPrimitives: ['react', 'vue', 'svelte', 'angular', 'html', 'htmx'],
		operationsRecord: 'linked',
		readinessGate: 'present',
		surface: 'Unified call log / operations record',
		why: 'Operations records link trace, transcript, provider decisions, tools, handoffs, audit, reviews, tasks, delivery attempts, and incident Markdown.'
	},
	{
		buyerNeed: 'Run outbound campaigns without a hosted dialer.',
		competitors: ['Retell', 'Bland'],
		coverage: 'covered',
		depth: 'parity',
		evidence: [
			{
				href: '/api/voice/campaigns/readiness-proof',
				kind: 'proof',
				name: 'campaignReadiness',
				status: 'pass'
			}
		],
		operationsRecord: 'linked',
		readinessGate: 'present',
		surface: 'Outbound campaigns',
		why: 'Campaign queues, imports, consent, retries, quiet hours, carrier dry-runs, and readiness proof exist.',
		nextMove: 'Improve primitive docs and examples without building a hosted dashboard.'
	},
	{
		buyerNeed: 'Own raw media infrastructure.',
		competitors: ['LiveKit'],
		coverage: 'intentional-gap',
		depth: 'intentional-gap',
		operationsRecord: 'not-applicable',
		readinessGate: 'not-applicable',
		remainingGap: 'LiveKit owns SIP trunks, RTP/SRTP, rooms, DTMF, and media dispatch.',
		surface: 'SIP/media infrastructure',
		why: 'AbsoluteJS Voice should expose adapter seams instead of recreating media infrastructure.'
	}
];

describe('competitive coverage', () => {
	test('buildVoiceCompetitiveCoverageReport scores coverage and depth', () => {
		const report = buildVoiceCompetitiveCoverageReport({
			generatedAt: '2026-04-30T12:00:00.000Z',
			marketCoverageEstimate: '93-95%',
			notes: ['Self-hosted buyer profile.'],
			source: 'VOICE_PLAN.md',
			surfaces,
			vapiCoverageEstimate: '99.8%'
		});

		expect(report.status).toBe('pass');
		expect(report.ok).toBe(true);
		expect(report.summary).toMatchObject({
			advantage: 1,
			failed: 0,
			intentionalGaps: 1,
			parity: 1,
			surfaces: 3
		});
		expect(report.vapiCoverageEstimate).toBe('99.8%');
		expect(report.marketCoverageEstimate).toBe('93-95%');
	});

	test('evaluateVoiceCompetitiveCoverage verifies required proof depth', () => {
		const report = buildVoiceCompetitiveCoverageReport({ surfaces });
		const assertion = evaluateVoiceCompetitiveCoverage(report, {
			maxFailedSurfaces: 0,
			maxMissingSurfaces: 0,
			minAdvantageSurfaces: 1,
			minSurfaces: 3,
			requireOperationsRecordLinks: true,
			requireReadinessGates: true,
			requiredEvidence: ['operationsRecord', 'readinessGate'],
			requiredSurfaces: [
				'Outbound campaigns',
				'SIP/media infrastructure',
				'Unified call log / operations record'
			]
		});

		expect(assertion.ok).toBe(true);
		expect(assertVoiceCompetitiveCoverage(report, { minSurfaces: 3 }).ok).toBe(
			true
		);

		const failed = evaluateVoiceCompetitiveCoverage(report, {
			minAdvantageSurfaces: 2,
			requiredEvidence: ['missingEvidence'],
			requiredSurfaces: ['Hosted phone-number provisioning']
		});
		expect(failed.ok).toBe(false);
		expect(failed.issues).toContain(
			'Expected at least 2 advantage surfaces, found 1.'
		);
		expect(failed.issues).toContain(
			'Missing competitive surface: Hosted phone-number provisioning.'
		);
		expect(failed.issues).toContain(
			'Missing competitive evidence: missingEvidence.'
		);
		expect(() =>
			assertVoiceCompetitiveCoverage(report, { minAdvantageSurfaces: 2 })
		).toThrow('Voice competitive coverage assertion failed');
	});

	test('buildVoiceCompetitiveCoverageReport warns and fails on weak surfaces', () => {
		const report = buildVoiceCompetitiveCoverageReport({
			surfaces: [
				{
					coverage: 'partial',
					depth: 'covered',
					operationsRecord: 'unknown',
					readinessGate: 'recommended',
					surface: 'Realtime browser format calibration',
					why: 'Runtime-channel calibration samples need more production depth.'
				},
				{
					coverage: 'missing',
					depth: 'lag',
					evidence: [
						{
							name: 'requiredProof',
							required: true,
							status: 'fail'
						}
					],
					surface: 'Hosted dashboard',
					why: 'Not covered.'
				}
			]
		});

		expect(report.status).toBe('fail');
		expect(report.ok).toBe(false);
		expect(report.summary.failed).toBe(1);
		expect(report.summary.warned).toBe(1);
		expect(report.issues.map((issue) => issue.code)).toContain(
			'surface-missing'
		);
		expect(report.issues.map((issue) => issue.code)).toContain(
			'required-evidence-not-passing'
		);
	});

	test('renderVoiceCompetitiveCoverageMarkdown includes depth table', () => {
		const report = buildVoiceCompetitiveCoverageReport({ surfaces });
		const markdown = renderVoiceCompetitiveCoverageMarkdown(report);

		expect(markdown).toContain('# Voice Competitive Coverage');
		expect(markdown).toContain('| Unified call log / operations record |');
		expect(markdown).toContain('Vapi-style coverage: 99.8%');
	});

	test('createVoiceCompetitiveCoverageRoutes exposes JSON, HTML, and Markdown', async () => {
		const app = createVoiceCompetitiveCoverageRoutes({
			path: '/api/voice/competitive',
			source: () => buildVoiceCompetitiveCoverageReport({ surfaces }),
			title: 'Competitive Proof'
		});

		const jsonResponse = await app.handle(
			new Request('http://localhost/api/voice/competitive')
		);
		const htmlResponse = await app.handle(
			new Request('http://localhost/voice/competitive-coverage')
		);
		const markdownResponse = await app.handle(
			new Request('http://localhost/voice/competitive-coverage.md')
		);
		const body = (await jsonResponse.json()) as ReturnType<
			typeof buildVoiceCompetitiveCoverageReport
		>;
		const html = await htmlResponse.text();
		const markdown = await markdownResponse.text();

		expect(jsonResponse.status).toBe(200);
		expect(body.status).toBe('pass');
		expect(body.summary.surfaces).toBe(3);
		expect(htmlResponse.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('Competitive Proof');
		expect(markdownResponse.headers.get('content-type')).toContain(
			'text/markdown'
		);
		expect(markdown).toContain('Competitive Proof');
	});
});
