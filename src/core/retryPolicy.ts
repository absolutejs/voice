export type VoiceRetryDispositionAction = "retry" | "abandon" | "escalate";

export type VoiceRetryDispositionRule = {
  disposition: string;
  action: VoiceRetryDispositionAction;
  cooldownMs?: number;
  maxAttemptsOverride?: number;
};

export type VoiceRetryAttempt = {
  disposition: string;
  at: number;
};

export type VoiceRetryDecision =
  | {
      action: "retry";
      attemptNumber: number;
      retryAt: number;
    }
  | {
      action: "abandon";
      reason: "max-attempts" | "non-retryable" | "explicit";
    }
  | {
      action: "escalate";
      reason: string;
    };

export type CreateVoiceRetryPolicyOptions = {
  maxAttempts?: number;
  defaultCooldownMs?: number;
  jitterMs?: number;
  backoffMultiplier?: number;
  rules?: VoiceRetryDispositionRule[];
  escalateAfterAttempts?: number;
  now?: () => number;
};

const DEFAULT_RULES: VoiceRetryDispositionRule[] = [
  {
    action: "retry",
    cooldownMs: 4 * 60 * 60 * 1000,
    disposition: "voicemail-left",
  },
  { action: "retry", cooldownMs: 30 * 60 * 1000, disposition: "no-answer" },
  { action: "retry", cooldownMs: 10 * 60 * 1000, disposition: "busy" },
  {
    action: "retry",
    cooldownMs: 24 * 60 * 60 * 1000,
    disposition: "callback-requested",
  },
  { action: "abandon", disposition: "do-not-call" },
  { action: "abandon", disposition: "not-interested" },
  { action: "abandon", disposition: "wrong-number" },
  { action: "abandon", disposition: "sale" },
];

export const createVoiceRetryPolicy = (
  options: CreateVoiceRetryPolicyOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const maxAttempts = options.maxAttempts ?? 3;
  const baseCooldown = options.defaultCooldownMs ?? 30 * 60 * 1000;
  const jitter = options.jitterMs ?? 60 * 1000;
  const backoff = options.backoffMultiplier ?? 1.5;
  const escalateAfter = options.escalateAfterAttempts ?? Infinity;
  const rulesByDisposition = new Map<string, VoiceRetryDispositionRule>();
  for (const rule of options.rules ?? DEFAULT_RULES) {
    rulesByDisposition.set(rule.disposition, rule);
  }

  const decide = (
    history: VoiceRetryAttempt[],
    lastDisposition: string,
  ): VoiceRetryDecision => {
    const rule = rulesByDisposition.get(lastDisposition);
    const attemptCount = history.length;
    const max = rule?.maxAttemptsOverride ?? maxAttempts;

    if (attemptCount >= escalateAfter) {
      return {
        action: "escalate",
        reason: `${attemptCount} attempts without contact`,
      };
    }

    if (!rule || rule.action === "abandon") {
      return { action: "abandon", reason: "non-retryable" };
    }

    if (rule.action === "escalate") {
      return { action: "escalate", reason: lastDisposition };
    }

    if (attemptCount >= max) {
      return { action: "abandon", reason: "max-attempts" };
    }

    const cooldown = rule.cooldownMs ?? baseCooldown;
    const exponent = Math.pow(backoff, Math.max(0, attemptCount - 1));
    const jitterDelta = jitter > 0 ? Math.floor(Math.random() * jitter) : 0;
    const retryAt = now() + Math.round(cooldown * exponent) + jitterDelta;
    return {
      action: "retry",
      attemptNumber: attemptCount + 1,
      retryAt,
    };
  };

  return {
    decide,
    maxAttempts,
    rules: () => Array.from(rulesByDisposition.values()),
    updateRule(rule: VoiceRetryDispositionRule) {
      rulesByDisposition.set(rule.disposition, rule);
    },
  };
};

export type VoiceRetryPolicy = ReturnType<typeof createVoiceRetryPolicy>;
