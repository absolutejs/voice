import { expect, test } from 'bun:test';
import {
	createVoiceEvidenceAssertion,
	createVoiceProofAssertion,
	summarizeVoiceProofAssertions
} from '../src';

test('createVoiceEvidenceAssertion normalizes proof evidence into assertion results', () => {
	expect(
		createVoiceEvidenceAssertion({
			evidence: {
				issues: [],
				ok: true,
				total: 3
			},
			name: 'campaignDialerProofEvidence'
		})
	).toEqual({
		kind: 'json-assertion',
		name: 'campaignDialerProofEvidence',
		ok: true,
		summary: {
			issues: [],
			ok: true,
			total: 3
		}
	});

	expect(
		createVoiceEvidenceAssertion({
			missingIssue: 'Missing campaign dialer proof.',
			name: 'campaignDialerProofEvidence'
		})
	).toEqual({
		kind: 'json-assertion',
		name: 'campaignDialerProofEvidence',
		ok: false,
		summary: {
			issues: ['Missing campaign dialer proof.']
		}
	});
});

test('createVoiceProofAssertion and summarizeVoiceProofAssertions report failures', () => {
	const assertions = [
		createVoiceProofAssertion({
			name: 'providerRoutingContractEvidence',
			ok: true,
			summary: {
				passed: 3
			}
		}),
		createVoiceProofAssertion({
			missingIssue: 'Missing telephony webhook verification proof.',
			name: 'telephonyWebhookVerificationEvidence',
			ok: false
		})
	];

	expect(summarizeVoiceProofAssertions(assertions)).toEqual({
		failed: 1,
		failures: [
			{
				name: 'telephonyWebhookVerificationEvidence',
				summary: {
					issues: ['Missing telephony webhook verification proof.']
				}
			}
		],
		ok: false,
		passed: 1,
		total: 2
	});
});
