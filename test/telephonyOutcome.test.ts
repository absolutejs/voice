import { expect, test } from 'bun:test';
import {
	applyVoiceTelephonyOutcome,
	createVoiceTelephonyWebhookHandler,
	createVoiceTelephonyWebhookRoutes,
	parseVoiceTelephonyWebhookEvent,
	resolveVoiceTelephonyOutcome,
	voiceTelephonyOutcomeToRouteResult,
	type VoiceSessionHandle
} from '../src';

test('resolveVoiceTelephonyOutcome maps provider voicemail and no-answer statuses', () => {
	const voicemail = resolveVoiceTelephonyOutcome({
		answeredBy: 'machine_start',
		provider: 'twilio',
		status: 'completed'
	});
	const noAnswer = resolveVoiceTelephonyOutcome({
		provider: 'twilio',
		sipCode: 486,
		status: 'busy'
	});

	expect(voicemail).toMatchObject({
		action: 'voicemail',
		disposition: 'voicemail',
		source: 'answered-by'
	});
	expect(noAnswer).toMatchObject({
		action: 'no-answer',
		disposition: 'no-answer',
		source: 'sip'
	});
	expect(noAnswer.metadata).toMatchObject({
		provider: 'twilio',
		sipCode: 486,
		status: 'busy'
	});
});

test('resolveVoiceTelephonyOutcome supports transfer targets and custom maps', () => {
	const transfer = resolveVoiceTelephonyOutcome(
		{
			metadata: {
				queue: 'billing'
			},
			reason: 'carrier-forwarded',
			status: 'bridged'
		},
		{
			metadata: {
				source: 'carrier-webhook'
			}
		}
	);
	const mapped = resolveVoiceTelephonyOutcome(
		{
			provider: 'custom-carrier',
			status: 'agent-required'
		},
		{
			statusMap: {
				'custom-carrier:agent-required': {
					action: 'escalate',
					reason: 'vip-line'
				}
			}
		}
	);

	expect(transfer).toMatchObject({
		action: 'transfer',
		disposition: 'transferred',
		source: 'status',
		target: 'billing'
	});
	expect(transfer.metadata).toMatchObject({
		queue: 'billing',
		source: 'carrier-webhook'
	});
	expect(mapped).toMatchObject({
		action: 'escalate',
		disposition: 'escalated',
		reason: 'vip-line',
		source: 'policy'
	});
});

test('voiceTelephonyOutcomeToRouteResult and applyVoiceTelephonyOutcome drive lifecycle APIs', async () => {
	const calls: string[] = [];
	const api = {
		complete: async () => {
			calls.push('complete');
		},
		escalate: async ({ reason }: { reason: string }) => {
			calls.push(`escalate:${reason}`);
		},
		markNoAnswer: async () => {
			calls.push('no-answer');
		},
		markVoicemail: async () => {
			calls.push('voicemail');
		},
		transfer: async ({ target }: { target: string }) => {
			calls.push(`transfer:${target}`);
		}
	} as VoiceSessionHandle;
	const decision = resolveVoiceTelephonyOutcome({
		metadata: {
			transferTarget: 'sales'
		},
		reason: 'warm-transfer',
		status: 'transferred'
	});

	expect(voiceTelephonyOutcomeToRouteResult(decision, { ok: true })).toMatchObject({
		result: { ok: true },
		transfer: {
			reason: 'warm-transfer',
			target: 'sales'
		}
	});

	await applyVoiceTelephonyOutcome(api, decision, { ok: true });

	expect(calls).toEqual(['transfer:sales']);
});

test('parseVoiceTelephonyWebhookEvent normalizes Twilio-style form payloads', () => {
	const event = parseVoiceTelephonyWebhookEvent({
		body: {
			AnsweredBy: 'machine_start',
			CallDuration: '2',
			CallSid: 'CA123',
			CallStatus: 'completed',
			From: '+15551230000',
			To: '+15559870000'
		},
		headers: new Headers(),
		provider: 'twilio',
		query: {},
		request: new Request('http://localhost')
	});

	expect(event).toMatchObject({
		answeredBy: 'machine_start',
		durationMs: 2000,
		from: '+15551230000',
		provider: 'twilio',
		status: 'completed',
		to: '+15559870000'
	});
});

test('createVoiceTelephonyWebhookHandler resolves and applies session outcomes', async () => {
	const calls: string[] = [];
	const handler = createVoiceTelephonyWebhookHandler({
		apply: true,
		getSessionHandle: ({ sessionId }) => {
			calls.push(`session:${sessionId}`);
			return {
				markVoicemail: async () => {
					calls.push('voicemail');
				}
			} as VoiceSessionHandle;
		},
		provider: 'twilio'
	});
	const report = await handler({
		request: new Request('http://localhost/webhook', {
			body: new URLSearchParams({
				AnsweredBy: 'machine_start',
				CallSid: 'CA123',
				CallStatus: 'completed'
			}),
			headers: {
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		})
	});

	expect(report).toMatchObject({
		applied: true,
		decision: {
			action: 'voicemail'
		},
		sessionId: 'CA123'
	});
	expect(calls).toEqual(['session:CA123', 'voicemail']);
});

test('createVoiceTelephonyWebhookRoutes exposes webhook decisions', async () => {
	const routes = createVoiceTelephonyWebhookRoutes({
		path: '/carrier',
		provider: 'twilio'
	});
	const response = await routes.handle(
		new Request('http://localhost/carrier?sessionId=session-1', {
			body: new URLSearchParams({
				CallStatus: 'busy',
				SipResponseCode: '486'
			}),
			headers: {
				'content-type': 'application/x-www-form-urlencoded'
			},
			method: 'POST'
		})
	);
	const body = await response.json();

	expect(body).toMatchObject({
		applied: false,
		decision: {
			action: 'no-answer'
		},
		sessionId: 'session-1'
	});
});
