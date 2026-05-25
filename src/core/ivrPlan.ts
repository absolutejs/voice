export type VoiceIVRMatch = {
  digit?: string;
  digits?: string;
  speech?: string | RegExp;
};

export type VoiceIVRBranch = {
  assistantId?: string;
  description?: string;
  id: string;
  label: string;
  match: VoiceIVRMatch;
  metadata?: Record<string, unknown>;
  target?: string;
};

export type VoiceIVRPlan = {
  branches: readonly VoiceIVRBranch[];
  fallbackBranchId?: string;
  greeting: string;
  maxAttempts?: number;
  noMatchPrompt?: string;
  timeoutMs?: number;
  timeoutPrompt?: string;
};

export type VoiceIVRInput = {
  digits?: string;
  speech?: string;
};

export type VoiceIVRDecision = {
  branch?: VoiceIVRBranch;
  reason: "matched" | "no-match" | "fallback" | "timeout";
};

const speechMatchesPattern = (pattern: string | RegExp, speech: string) => {
  const normalized = speech.toLowerCase().trim();
  if (pattern instanceof RegExp) {
    return pattern.test(normalized);
  }
  const target = pattern.toLowerCase().trim();
  if (!target) {
    return false;
  }

  return normalized.includes(target);
};

const digitsMatchPattern = (pattern: string, input: string) =>
  input === pattern;

const branchMatches = (
  branch: VoiceIVRBranch,
  input: VoiceIVRInput,
): boolean => {
  const matcher = branch.match;
  if (matcher.digit && input.digits) {
    if (input.digits === matcher.digit) {
      return true;
    }
  }
  if (matcher.digits && input.digits) {
    if (digitsMatchPattern(matcher.digits, input.digits)) {
      return true;
    }
  }
  if (matcher.speech && input.speech) {
    if (speechMatchesPattern(matcher.speech, input.speech)) {
      return true;
    }
  }

  return false;
};

export const evaluateVoiceIVRPlan = (
  plan: VoiceIVRPlan,
  input: VoiceIVRInput,
): VoiceIVRDecision => {
  if (!input.digits && !input.speech) {
    return { reason: "timeout" };
  }
  for (const branch of plan.branches) {
    if (branchMatches(branch, input)) {
      return { branch, reason: "matched" };
    }
  }
  if (plan.fallbackBranchId) {
    const fallback = plan.branches.find(
      (branch) => branch.id === plan.fallbackBranchId,
    );
    if (fallback) {
      return { branch: fallback, reason: "fallback" };
    }
  }

  return { reason: "no-match" };
};

export type VoiceIVRSession = {
  attempt: () => number;
  decide: (input: VoiceIVRInput) => VoiceIVRDecision;
  exhausted: () => boolean;
  reset: () => void;
};

export const createVoiceIVRSession = (plan: VoiceIVRPlan): VoiceIVRSession => {
  const maxAttempts = plan.maxAttempts ?? 3;
  let attempts = 0;

  return {
    attempt: () => attempts,
    decide: (input) => {
      attempts += 1;

      return evaluateVoiceIVRPlan(plan, input);
    },
    exhausted: () => attempts >= maxAttempts,
    reset: () => {
      attempts = 0;
    },
  };
};

export const describeVoiceIVRPlan = (plan: VoiceIVRPlan): string => {
  const lines = [plan.greeting];
  for (const branch of plan.branches) {
    const triggers: string[] = [];
    if (branch.match.digit) {
      triggers.push(`press ${branch.match.digit}`);
    }
    if (branch.match.digits) {
      triggers.push(`press ${branch.match.digits}`);
    }
    if (branch.match.speech) {
      triggers.push(
        `say "${branch.match.speech instanceof RegExp ? branch.match.speech.source : branch.match.speech}"`,
      );
    }
    lines.push(`- ${branch.label}: ${triggers.join(" or ")}`);
  }

  return lines.join("\n");
};
