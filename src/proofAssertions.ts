export type VoiceProofAssertionResult = {
	kind: 'json-assertion';
	name: string;
	ok: boolean;
	summary?: Record<string, unknown>;
};

export type VoiceProofAssertionSummary = {
	failed: number;
	failures: Array<{
		name: string;
		summary?: Record<string, unknown>;
	}>;
	ok: boolean;
	passed: number;
	total: number;
};

export type VoiceProofAssertionInput = {
	missingIssue?: string;
	name: string;
	ok?: boolean;
	summary?: Record<string, unknown>;
};

export type VoiceEvidenceAssertionInput<TEvidence> = {
	evidence?: TEvidence;
	missingIssue?: string;
	name: string;
	ok?: (evidence: TEvidence) => boolean;
	summary?: (evidence: TEvidence) => Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const createVoiceProofAssertion = (
	input: VoiceProofAssertionInput
): VoiceProofAssertionResult => ({
	kind: 'json-assertion',
	name: input.name,
	ok: input.ok === true,
	summary:
		input.summary ??
		(input.ok === true
			? undefined
			: {
					issues: [input.missingIssue ?? `${input.name} proof is missing.`]
				})
});

export const createVoiceEvidenceAssertion = <TEvidence>(
	input: VoiceEvidenceAssertionInput<TEvidence>
): VoiceProofAssertionResult => {
	if (input.evidence === undefined) {
		return createVoiceProofAssertion({
			missingIssue: input.missingIssue,
			name: input.name,
			ok: false
		});
	}

	return {
		kind: 'json-assertion',
		name: input.name,
		ok:
			input.ok?.(input.evidence) ??
			(isRecord(input.evidence) && input.evidence.ok === true),
		summary:
			input.summary?.(input.evidence) ??
			(isRecord(input.evidence) ? input.evidence : undefined)
	};
};

export const summarizeVoiceProofAssertions = (
	assertions: VoiceProofAssertionResult[]
): VoiceProofAssertionSummary => {
	const failures = assertions
		.filter((assertion) => !assertion.ok)
		.map((assertion) => ({
			name: assertion.name,
			summary: assertion.summary
		}));

	return {
		failed: failures.length,
		failures,
		ok: failures.length === 0,
		passed: assertions.length - failures.length,
		total: assertions.length
	};
};
