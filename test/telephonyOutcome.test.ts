import { expect, test } from 'bun:test';
import {
	applyVoiceTelephonyOutcome,
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
