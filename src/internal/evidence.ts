export type VoiceEvidenceAssertion = { ok: boolean; issues: string[] };

/**
 * Throw if an evidence assertion failed, formatting its issues into the error
 * message. Returns the assertion unchanged when it passed, so callers can
 * `return assertVoiceEvidence(label, evaluate(...))`.
 */
export const assertVoiceEvidence = <A extends VoiceEvidenceAssertion>(
  failureMessage: string,
  assertion: A,
): A => {
  if (!assertion.ok) {
    throw new Error(`${failureMessage}: ${assertion.issues.join(" ")}`);
  }

  return assertion;
};
