import { expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildVoiceTelephonyWebhookSecurityReport,
	createVoiceTelephonyWebhookSecurityPreset,
	createVoiceTelephonyWebhookSecurityRoutes,
	evaluateVoiceTelephonyWebhookSecurityEvidence,
	signVoicePlivoWebhook,
	signVoiceTwilioWebhook
} from '../src';

const createTempSQLitePath = () =>
	join(tmpdir(), `absolutejs-voice-webhook-security-${crypto.randomUUID()}.sqlite`);

const createSignedTelnyxHeaders = async (body: string) => {
	const keyPair = await crypto.subtle.generateKey(
		'Ed25519',
		true,
		['sign', 'verify']
	);
	const publicKey = Buffer.from(
		await crypto.subtle.exportKey('raw', keyPair.publicKey)
	).toString('base64');
	const timestamp = String(Math.floor(Date.now() / 1_000));
	const signature = Buffer.from(
		await crypto.subtle.sign(
			'Ed25519',
			keyPair.privateKey,
			new TextEncoder().encode(`${timestamp}|${body}`)
		)
	).toString('base64');

	return {
		headers: new Headers({
			'telnyx-signature-ed25519': signature,
			'telnyx-timestamp': timestamp
		}),
		publicKey
	};
};

test('createVoiceTelephonyWebhookSecurityPreset verifies Twilio and exposes idempotency', async () => {
	const preset = createVoiceTelephonyWebhookSecurityPreset({
		twilio: {
			authToken: 'twilio-secret'
		}
	});
	const body = {
		CallSid: 'call-1',
		CallStatus: 'completed'
	};
	const url = 'https://voice.example.test/twilio';
	const signature = await signVoiceTwilioWebhook({
		authToken: 'twilio-secret',
		body,
		url
	});
	const request = new Request(url, {
		headers: {
			'x-twilio-signature': signature
		}
	});

	await expect(
		preset.verify.twilio({
			body,
			headers: request.headers,
			query: {},
			request
		})
	).resolves.toEqual({ ok: true });

	await preset.twilio.idempotency.store.set('twilio:call-1', {
		applied: true,
		createdAt: 1,
		decision: {
			action: 'complete',
			confidence: 'high',
			source: 'status'
		},
		event: {
			provider: 'twilio'
		},
		routeResult: {},
		updatedAt: 1
	});
	expect(await preset.twilio.idempotency.store.get('twilio:call-1')).toMatchObject({
		event: {
			provider: 'twilio'
		}
	});
});

test('createVoiceTelephonyWebhookSecurityPreset rejects Plivo and Telnyx replays', async () => {
	const telnyxBody = JSON.stringify({
		data: {
			id: 'telnyx-event-1',
			payload: {
				call_session_id: 'telnyx-session-1'
			}
		}
	});
	const telnyx = await createSignedTelnyxHeaders(telnyxBody);
	const preset = createVoiceTelephonyWebhookSecurityPreset({
		plivo: {
			authToken: 'plivo-secret'
		},
		telnyx: {
			publicKey: telnyx.publicKey
		}
	});
	const plivoBody = {
		CallUUID: 'plivo-call-1'
	};
	const plivoNonce = 'plivo-nonce-1';
	const plivoUrl = 'https://voice.example.test/plivo';
	const plivoSignature = await signVoicePlivoWebhook({
		authToken: 'plivo-secret',
		body: plivoBody,
		nonce: plivoNonce,
		url: plivoUrl
	});
	const plivoRequest = () =>
		new Request(plivoUrl, {
			headers: {
				'x-plivo-signature-v3': plivoSignature,
				'x-plivo-signature-v3-nonce': plivoNonce
			}
		});

	await expect(
		preset.verify.plivo({
			body: plivoBody,
			headers: plivoRequest().headers,
			query: {},
			request: plivoRequest()
		})
	).resolves.toEqual({ ok: true });
	await expect(
		preset.verify.plivo({
			body: plivoBody,
			headers: plivoRequest().headers,
			query: {},
			request: plivoRequest()
		})
	).resolves.toEqual({
		ok: false,
		reason: 'invalid-signature'
	});

	await expect(
		preset.verify.telnyx({
			headers: telnyx.headers,
			rawBody: telnyxBody
		})
	).resolves.toEqual({ ok: true });
	await expect(
		preset.verify.telnyx({
			headers: telnyx.headers,
			rawBody: telnyxBody
		})
	).resolves.toEqual({
		ok: false,
		reason: 'invalid-signature'
	});
});

test('SQLite telephony webhook security preset persists replay claims', async () => {
	const path = createTempSQLitePath();
	const firstPreset = createVoiceTelephonyWebhookSecurityPreset({
		store: {
			kind: 'sqlite',
			path
		},
		ttlSeconds: 60
	});
	const secondPreset = createVoiceTelephonyWebhookSecurityPreset({
		store: {
			kind: 'sqlite',
			path
		},
		ttlSeconds: 60
	});

	expect(await firstPreset.plivo.nonceStore.claim?.('sqlite-plivo')).toBe(true);
	expect(await secondPreset.plivo.nonceStore.claim?.('sqlite-plivo')).toBe(false);
	expect(await firstPreset.telnyx.eventStore.claim?.('sqlite-telnyx')).toBe(true);
	expect(await secondPreset.telnyx.eventStore.claim?.('sqlite-telnyx')).toBe(
		false
	);
});

test('telephony webhook security report passes persistent verified carriers', async () => {
	const path = createTempSQLitePath();
	const options = {
		plivo: {
			authToken: 'plivo-secret'
		},
		store: {
			kind: 'sqlite' as const,
			path
		},
		telnyx: {
			publicKey: 'telnyx-public-key'
		},
		twilio: {
			authToken: 'twilio-secret'
		}
	};
	const report = buildVoiceTelephonyWebhookSecurityReport(options);
	const assertion = evaluateVoiceTelephonyWebhookSecurityEvidence(report, {
		requiredProviders: ['twilio', 'telnyx', 'plivo']
	});

	expect(report.ok).toBe(true);
	expect(report.summary).toMatchObject({
		enabled: 3,
		failed: 0,
		passed: 3
	});
	expect(assertion).toMatchObject({
		failedProviders: [],
		ok: true,
		passingProviders: ['twilio', 'telnyx', 'plivo']
	});
});

test('telephony webhook security report fails missing verification and memory stores', () => {
	const report = buildVoiceTelephonyWebhookSecurityReport({
		plivo: {},
		telnyx: {
			publicKey: 'telnyx-public-key'
		},
		twilio: {
			authToken: 'twilio-secret'
		}
	});
	const assertion = evaluateVoiceTelephonyWebhookSecurityEvidence(report, {
		requiredProviders: ['twilio', 'telnyx', 'plivo']
	});

	expect(report.ok).toBe(false);
	expect(report.summary.failed).toBe(3);
	expect(assertion.ok).toBe(false);
	expect(assertion.issues).toContain('Webhook verification is not configured.');
	expect(assertion.issues).toContain(
		'Telephony webhook provider plivo is not using a persistent security store.'
	);
});

test('telephony webhook security routes expose the readiness report', async () => {
	const app = createVoiceTelephonyWebhookSecurityRoutes({
		options: {
			store: {
				kind: 'sqlite',
				path: createTempSQLitePath()
			},
			twilio: {
				authToken: 'twilio-secret'
			}
		}
	});
	const response = await app.handle(
		new Request('https://voice.example.test/api/voice/telephony/webhook-security')
	);
	const body = (await response.json()) as ReturnType<
		typeof buildVoiceTelephonyWebhookSecurityReport
	>;

	expect(response.status).toBe(200);
	expect(body.status).toBe('pass');
	expect(body.providers.find((provider) => provider.provider === 'twilio')).toMatchObject({
		enabled: true,
		status: 'pass'
	});
});
