import { describe, expect, test } from 'bun:test';
import {
	buildVoiceTelephonyMediaReport,
	createVoiceTelephonyMediaRoutes,
	getLatestVoiceTelephonyMediaReport,
	createVoiceMemoryTraceEventStore
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
		expect(report.carriers.every((carrier) => carrier.lifecycle.status === 'pass')).toBe(
			true
		);
		expect(report.carriers.every((carrier) => carrier.lifecycle.started)).toBe(true);
		expect(report.carriers.every((carrier) => carrier.lifecycle.stopped)).toBe(true);
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

	test('fails broken carrier stream lifecycle', () => {
		const report = buildVoiceTelephonyMediaReport({
			carriers: [
				{
					carrier: 'twilio',
					lifecycleEnvelopes: [
						{
							event: 'media',
							media: {
								payload: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
									'base64'
								),
								timestamp: 1000,
								track: 'inbound'
							},
							streamSid: 'twilio-stream-1'
						}
					]
				}
			]
		});

		expect(report.status).toBe('fail');
		expect(report.carriers[0]?.lifecycle.status).toBe('fail');
		expect(report.issues).toEqual(
			expect.arrayContaining([
				'twilio: Telephony media stream did not include a start event.',
				'twilio: Telephony media stream did not include a stop event.'
			])
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

	test('builds telephony media proof from live trace events', async () => {
		const store = createVoiceMemoryTraceEventStore();
		await store.append({
			at: 1,
			payload: {
				carrier: 'twilio',
				envelope: {
					event: 'start',
					start: {
						streamSid: 'MZ-trace'
					},
					streamSid: 'MZ-trace'
				}
			},
			sessionId: 'phone-session',
			type: 'client.telephony_media'
		});
		await store.append({
			at: 2,
			payload: {
				carrier: 'twilio',
				envelope: {
					event: 'media',
					media: {
						payload: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
							'base64'
						),
						track: 'inbound'
					},
					streamSid: 'MZ-trace'
				}
			},
			sessionId: 'phone-session',
			type: 'client.telephony_media'
		});
		await store.append({
			at: 3,
			payload: {
				carrier: 'twilio',
				envelope: {
					event: 'stop',
					stop: {
						callSid: 'CA-trace'
					},
					streamSid: 'MZ-trace'
				}
			},
			sessionId: 'phone-session',
			type: 'client.telephony_media'
		});

		const report = await getLatestVoiceTelephonyMediaReport({ store });

		expect(report?.status).toBe('pass');
		expect(report?.carriers[0]).toMatchObject({
			audioBytes: 4,
			carrier: 'twilio',
			lifecycle: {
				mediaEvents: 1,
				started: true,
				status: 'pass',
				stopped: true,
				streamIds: expect.arrayContaining(['MZ-trace'])
			}
		});
	});
});
