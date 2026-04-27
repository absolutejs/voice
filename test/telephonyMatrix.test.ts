import { expect, test } from 'bun:test';
import {
	createVoiceTelephonyCarrierMatrix,
	createVoiceTelephonyCarrierMatrixRoutes
} from '../src/telephony/matrix';
import type {
	VoiceTelephonyProvider,
	VoiceTelephonySetupStatus,
	VoiceTelephonySmokeReport
} from '../src/telephony/contract';

const setup = <TProvider extends VoiceTelephonyProvider>(
	provider: TProvider,
	overrides: Partial<VoiceTelephonySetupStatus<TProvider>> = {}
): VoiceTelephonySetupStatus<TProvider> => ({
	generatedAt: 100,
	missing: [],
	provider,
	ready: true,
	signing: {
		configured: true,
		mode: provider === 'twilio' ? 'twilio-signature' : 'provider-signature',
		verificationUrl: `https://voice.example.test/${provider}/webhook`
	},
	urls: {
		stream: `wss://voice.example.test/${provider}/stream`,
		webhook: `https://voice.example.test/${provider}/webhook`
	},
	warnings: [],
	...overrides
});

const smoke = <TProvider extends VoiceTelephonyProvider>(
	input: VoiceTelephonySetupStatus<TProvider>,
	pass = true
): VoiceTelephonySmokeReport<TProvider> => ({
	checks: [
		{
			name: 'stream-url',
			status: pass ? 'pass' : 'fail'
		},
		{
			name: 'webhook',
			status: pass ? 'pass' : 'fail'
		}
	],
	generatedAt: 100,
	pass,
	provider: input.provider,
	setup: input,
	twiml: {
		status: pass ? 200 : 500,
		streamUrl: input.urls.stream
	},
	webhook: {
		status: pass ? 200 : 500
	}
});

test('createVoiceTelephonyCarrierMatrix summarizes carrier readiness side-by-side', () => {
	const twilio = setup('twilio');
	const telnyx = setup('telnyx', {
		ready: false,
		signing: {
			configured: false,
			mode: 'none'
		},
		urls: {
			stream: 'ws://voice.example.test/telnyx/stream',
			webhook: 'https://voice.example.test/telnyx/webhook'
		}
	});
	const plivo = setup('plivo');
	const matrix = createVoiceTelephonyCarrierMatrix({
		generatedAt: 200,
		providers: [
			{
				setup: twilio,
				smoke: smoke(twilio)
			},
			{
				setup: telnyx,
				smoke: smoke(telnyx, false)
			},
			{
				name: 'Plivo backup',
				setup: plivo,
				smoke: smoke(plivo)
			}
		]
	});

	expect(matrix).toMatchObject({
		generatedAt: 200,
		pass: false,
		summary: {
			contractsPassing: 2,
			failing: 1,
			providers: 3,
			ready: 2,
			smokePassing: 2
		}
	});
	expect(matrix.entries.map((entry) => entry.status)).toEqual([
		'pass',
		'fail',
		'pass'
	]);
	expect(matrix.entries[2]?.name).toBe('Plivo backup');
	expect(matrix.entries[1]?.issues.map((issue) => issue.requirement)).toEqual(
		expect.arrayContaining(['wss-stream', 'signed-webhook', 'smoke-pass'])
	);
});

test('createVoiceTelephonyCarrierMatrixRoutes exposes json and html reports', async () => {
	const twilio = setup('twilio');
	const telnyx = setup('telnyx');
	const routes = createVoiceTelephonyCarrierMatrixRoutes({
		load: () => [
			{
				setup: twilio,
				smoke: smoke(twilio)
			},
			{
				setup: telnyx,
				smoke: smoke(telnyx)
			}
		],
		path: '/voice/carriers',
		title: 'Demo carrier matrix'
	});

	const jsonResponse = await routes.handle(
		new Request('https://voice.example.test/voice/carriers')
	);
	const json = await jsonResponse.json();
	expect(json).toMatchObject({
		pass: true,
		summary: {
			contractsPassing: 2,
			providers: 2,
			ready: 2
		}
	});

	const htmlResponse = await routes.handle(
		new Request('https://voice.example.test/voice/carriers?format=html')
	);
	const html = await htmlResponse.text();
	expect(htmlResponse.headers.get('content-type')).toContain('text/html');
	expect(html).toContain('Demo carrier matrix');
	expect(html).toContain('Twilio');
	expect(html).toContain('Telnyx');
});
