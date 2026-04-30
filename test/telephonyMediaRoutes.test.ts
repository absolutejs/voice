import { describe, expect, test } from 'bun:test';
import {
	buildVoiceTelephonyMediaReport,
	createVoiceTelephonyMediaRoutes
} from '../src';

describe('telephony media routes', () => {
	test('proves carrier media packets parse into generic media frames', () => {
		const report = buildVoiceTelephonyMediaReport();

		expect(report.status).toBe('pass');
		expect(report.carriers.map((carrier) => carrier.carrier)).toEqual([
			'twilio',
			'telnyx',
			'plivo'
		]);
		expect(report.carriers.every((carrier) => carrier.audioBytes > 0)).toBe(
			true
		);
		expect(report.carriers.every((carrier) => carrier.frame?.source === 'telephony')).toBe(
			true
		);
	});

	test('fails malformed carrier media packets', () => {
		const report = buildVoiceTelephonyMediaReport({
			carriers: [
				{
					carrier: 'twilio',
					envelope: {
						event: 'start',
						streamSid: 'twilio-stream-1'
					}
				}
			]
		});

		expect(report.status).toBe('fail');
		expect(report.issues).toContain(
			'twilio: Carrier media envelope did not produce a MediaFrame.'
		);
	});

	test('exposes telephony media proof as json and html', async () => {
		const routes = createVoiceTelephonyMediaRoutes();
		const json = await routes.handle(
			new Request('https://voice.example.test/api/voice/telephony/media')
		);
		const html = await routes.handle(
			new Request('https://voice.example.test/voice/telephony-media')
		);

		expect(json.status).toBe(200);
		expect(await json.json()).toMatchObject({
			status: 'pass'
		});
		expect(html.status).toBe(200);
		expect(await html.text()).toContain('Carrier media serializer proof');
	});
});
