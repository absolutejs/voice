import { expect, test } from 'bun:test';
import {
	createVoicePlivoCampaignDialer,
	createVoiceTelnyxCampaignDialer,
	createVoiceTwilioCampaignDialer,
	parseVoiceTelephonyWebhookEvent
} from '../src';
import type { VoiceCampaignDialerInput } from '../src';

const createDialerInput = (): VoiceCampaignDialerInput => ({
	attempt: {
		campaignId: 'campaign-1',
		createdAt: 100,
		id: 'attempt-1',
		recipientId: 'recipient-1',
		status: 'running',
		updatedAt: 100
	},
	campaign: {
		createdAt: 100,
		id: 'campaign-1',
		maxAttempts: 1,
		maxConcurrentAttempts: 1,
		name: 'Campaign',
		status: 'running',
		updatedAt: 100
	},
	recipient: {
		attempts: 0,
		createdAt: 100,
		id: 'recipient-1',
		phone: '+15550001001',
		status: 'queued',
		updatedAt: 100
	}
});

const createResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		headers: {
			'content-type': 'application/json'
		},
		status
	});

test('createVoiceTwilioCampaignDialer posts Calls API form with campaign metadata URLs', async () => {
	let requestUrl = '';
	let requestInit: RequestInit | undefined;
	const dialer = createVoiceTwilioCampaignDialer({
		accountSid: 'AC123',
		answerUrl: 'https://voice.example.com/twilio/voice',
		authToken: 'secret',
		fetch: async (url, init) => {
			requestUrl = String(url);
			requestInit = init;
			return createResponse({
				sid: 'CA123'
			});
		},
		from: '+15550009999',
		statusCallbackEvents: ['completed'],
		statusCallbackUrl: 'https://voice.example.com/twilio/status'
	});

	const result = await dialer(createDialerInput());
	const body = requestInit?.body as URLSearchParams;
	const callbackUrl = new URL(String(body.get('StatusCallback')));
	const answerUrl = new URL(String(body.get('Url')));

	expect(requestUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Calls.json');
	expect(requestInit?.method).toBe('POST');
	expect(requestInit?.headers).toMatchObject({
		authorization: 'Basic QUMxMjM6c2VjcmV0'
	});
	expect(body.get('To')).toBe('+15550001001');
	expect(body.get('From')).toBe('+15550009999');
	expect(body.getAll('StatusCallbackEvent')).toEqual(['completed']);
	expect(callbackUrl.searchParams.get('campaignId')).toBe('campaign-1');
	expect(callbackUrl.searchParams.get('attemptId')).toBe('attempt-1');
	expect(answerUrl.searchParams.get('voiceCampaignRecipientId')).toBe('recipient-1');
	expect(result.externalCallId).toBe('CA123');
});

test('createVoiceTelnyxCampaignDialer posts call control JSON with client state metadata', async () => {
	let requestUrl = '';
	let requestInit: RequestInit | undefined;
	const dialer = createVoiceTelnyxCampaignDialer({
		apiKey: 'telnyx-key',
		connectionId: 'conn-1',
		fetch: async (url, init) => {
			requestUrl = String(url);
			requestInit = init;
			return createResponse({
				data: {
					call_control_id: 'call-control-1'
				}
			});
		},
		from: '+15550009999',
		webhookUrl: 'https://voice.example.com/telnyx/webhook'
	});

	const result = await dialer(createDialerInput());
	const body = JSON.parse(String(requestInit?.body)) as Record<string, string>;
	const webhookUrl = new URL(body.webhook_url);
	const clientState = JSON.parse(
		Buffer.from(body.client_state, 'base64').toString('utf8')
	) as Record<string, string>;

	expect(requestUrl).toBe('https://api.telnyx.com/v2/calls');
	expect(requestInit?.headers).toMatchObject({
		authorization: 'Bearer telnyx-key'
	});
	expect(body.connection_id).toBe('conn-1');
	expect(body.to).toBe('+15550001001');
	expect(webhookUrl.searchParams.get('campaignId')).toBe('campaign-1');
	expect(clientState.voiceCampaignAttemptId).toBe('attempt-1');
	expect(result.externalCallId).toBe('call-control-1');
});

test('createVoicePlivoCampaignDialer posts Call API form with callback metadata', async () => {
	let requestUrl = '';
	let requestInit: RequestInit | undefined;
	const dialer = createVoicePlivoCampaignDialer({
		answerUrl: 'https://voice.example.com/plivo/answer',
		authId: 'plivo-id',
		authToken: 'plivo-secret',
		callbackUrl: 'https://voice.example.com/plivo/callback',
		fetch: async (url, init) => {
			requestUrl = String(url);
			requestInit = init;
			return createResponse({
				request_uuid: 'plivo-request-1'
			});
		},
		from: '+15550009999'
	});

	const result = await dialer(createDialerInput());
	const body = requestInit?.body as URLSearchParams;
	const callbackUrl = new URL(String(body.get('callback_url')));
	const answerUrl = new URL(String(body.get('answer_url')));

	expect(requestUrl).toBe('https://api.plivo.com/v1/Account/plivo-id/Call/');
	expect(requestInit?.headers).toMatchObject({
		authorization: 'Basic cGxpdm8taWQ6cGxpdm8tc2VjcmV0'
	});
	expect(body.get('to')).toBe('+15550001001');
	expect(callbackUrl.searchParams.get('attemptId')).toBe('attempt-1');
	expect(answerUrl.searchParams.get('campaignId')).toBe('campaign-1');
	expect(result.externalCallId).toBe('plivo-request-1');
});

test('parseVoiceTelephonyWebhookEvent keeps callback query metadata for campaign outcomes', () => {
	const event = parseVoiceTelephonyWebhookEvent({
		body: {
			CallSid: 'CA123',
			CallStatus: 'completed'
		},
		headers: new Headers(),
		provider: 'twilio',
		query: {
			attemptId: 'attempt-1',
			campaignId: 'campaign-1'
		},
		request: new Request('https://voice.example.com/webhook')
	});

	expect(event.metadata).toMatchObject({
		CallSid: 'CA123',
		attemptId: 'attempt-1',
		campaignId: 'campaign-1'
	});
});
