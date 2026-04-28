import { expect, test } from 'bun:test';
import {
	buildVoiceDemoReadyReport,
	createVoiceDemoReadyRoutes,
	renderVoiceDemoReadyHTML
} from '../src';

const opsStatus = {
	checkedAt: 100,
	failed: 0,
	links: [],
	passed: 2,
	status: 'pass' as const,
	surfaces: {
		quality: {
			status: 'pass' as const
		}
	},
	total: 2
};

const productionReadiness = {
	checkedAt: 100,
	checks: [
		{
			label: 'Quality gates',
			status: 'pass' as const,
			value: 'pass'
		},
		{
			label: 'Phone smoke',
			status: 'pass' as const,
			value: 'pass'
		}
	],
	links: {},
	status: 'pass' as const,
	summary: {
		handoffs: {
			failed: 0,
			total: 0
		},
		liveLatency: {
			failed: 0,
			status: 'pass' as const,
			total: 1,
			warnings: 0
		},
		providers: {
			degraded: 0,
			total: 0
		},
		quality: {
			status: 'pass' as const
		},
		routing: {
			events: 0,
			sessions: 0
		},
		sessions: {
			failed: 0,
			total: 1
		}
	}
};

const phoneSetup = {
	carriers: [
		{
			provider: 'twilio' as const,
			setupPath: '/api/voice/twilio/setup',
			smokePath: '/api/voice/twilio/smoke'
		}
	],
	generatedAt: 100,
	lifecycleStages: ['media-started' as const, 'assistant-response' as const],
	ready: true,
	title: 'Phone Agent'
};

const phoneSmoke = {
	contractId: 'phone-smoke',
	generatedAt: 100,
	issues: [],
	observed: {
		assistantResponses: 1,
		lifecycleOutcomes: ['completed'],
		mediaStarts: 1,
		sessionErrors: 0,
		transcripts: 1
	},
	pass: true,
	provider: 'twilio' as const,
	required: [
		'media-started' as const,
		'transcript' as const,
		'assistant-response' as const,
		'lifecycle-outcome' as const
	],
	sessionId: 'demo-session'
};

test('buildVoiceDemoReadyReport rolls up demo surfaces', async () => {
	const report = await buildVoiceDemoReadyReport({
		opsStatus: {
			href: '/api/voice/ops-status',
			load: opsStatus
		},
		phoneSetup: {
			href: '/api/voice/phone/setup',
			load: phoneSetup
		},
		phoneSmoke: {
			href: '/voice/phone/smoke-contract',
			load: phoneSmoke
		},
		productionReadiness: {
			href: '/production-readiness',
			load: productionReadiness
		}
	});

	expect(report.status).toBe('pass');
	expect(report.sections.map((section) => section.label)).toEqual([
		'Ops status',
		'Production readiness',
		'Phone setup',
		'Phone smoke proof'
	]);
	expect(report.summary).toMatchObject({
		opsStatus: {
			passed: 2,
			total: 2
		},
		phoneSetup: {
			carriers: 1,
			ready: true
		},
		phoneSmoke: {
			issues: 0,
			pass: true,
			sessionId: 'demo-session'
		},
		productionReadiness: {
			checks: 2,
			status: 'pass'
		}
	});
	expect(renderVoiceDemoReadyHTML(report)).toContain('Demo readiness');
});

test('buildVoiceDemoReadyReport fails when a loaded surface fails', async () => {
	const report = await buildVoiceDemoReadyReport({
		phoneSmoke: {
			load: {
				...phoneSmoke,
				issues: [
					{
						message: 'No assistant response trace was recorded.',
						requirement: 'assistant-response' as const,
						severity: 'error' as const
					}
				],
				pass: false
			}
		}
	});

	expect(report.status).toBe('fail');
	expect(report.sections).toEqual([
		expect.objectContaining({
			label: 'Phone smoke proof',
			status: 'fail'
		})
	]);
});

test('createVoiceDemoReadyRoutes exposes json and html reports', async () => {
	const routes = createVoiceDemoReadyRoutes({
		opsStatus: {
			load: () => opsStatus
		},
		phoneSetup: {
			load: phoneSetup
		},
		phoneSmoke: {
			load: phoneSmoke
		},
		productionReadiness: {
			load: productionReadiness
		}
	});

	const json = await routes.handle(new Request('http://localhost/api/demo-ready'));
	const html = await routes.handle(new Request('http://localhost/demo-ready'));

	expect(json.status).toBe(200);
	await expect(json.json()).resolves.toMatchObject({
		status: 'pass'
	});
	expect(html.status).toBe(200);
	expect(await html.text()).toContain('AbsoluteJS Voice Demo Ready');
});
