import type { Transcript } from "./types";

export type VoicePromptInjectionRule = {
  /** Reason emitted in the verdict when this rule matches. */
  label: string;
  /** Regex applied to the transcript text (case-insensitive by convention). */
  pattern: RegExp;
  /** Severity tag for downstream routing. */
  severity?: "high" | "low" | "medium";
};

export type VoicePromptInjectionVerdict = {
  matches: Array<{
    label: string;
    matchedText: string;
    severity?: VoicePromptInjectionRule["severity"];
  }>;
  ok: boolean;
};

export const DEFAULT_VOICE_PROMPT_INJECTION_RULES: VoicePromptInjectionRule[] =
  [
    {
      label: "ignore-prior-instructions",
      pattern:
        /\bignore (?:all |the |any )?(?:previous|prior|above|earlier) (?:instructions|rules|prompts?)\b/iu,
      severity: "high",
    },
    {
      label: "role-override",
      pattern:
        /\byou are (?:now )?(?:a |an )?(?:different|new) (?:assistant|model|role)\b/iu,
      severity: "high",
    },
    {
      label: "system-prompt-leak",
      pattern:
        /\b(?:reveal|show|print|repeat|tell (?:me|us)|share) (?:your |the )?(?:system|hidden|secret) (?:prompt|instructions|message)\b/iu,
      severity: "high",
    },
    {
      label: "developer-impersonation",
      pattern:
        /\b(?:as your |i am the )?(?:developer|engineer|owner|admin)(?: of)?\b[^.]{0,40}\b(?:override|disable|bypass)/iu,
      severity: "medium",
    },
    {
      label: "jailbreak-persona",
      pattern:
        /\b(?:DAN|do anything now|jailbreak|developer mode|god mode)\b/iu,
      severity: "high",
    },
    {
      label: "tool-misuse-request",
      pattern:
        /\b(?:call|invoke|use) (?:the )?(?:transfer|hangup|end[_ ]call)(?:[_ ]?(?:tool|function))?\b/iu,
      severity: "low",
    },
  ];

export type CreateVoicePromptInjectionGuardOptions = {
  /** Custom rule set. Defaults to DEFAULT_VOICE_PROMPT_INJECTION_RULES. */
  rules?: ReadonlyArray<VoicePromptInjectionRule>;
  /** Replacement string for sanitized text. Default '[REDACTED:INJECTION]'. */
  sanitizedReplacement?: string;
};

export type VoicePromptInjectionGuard = {
  evaluate: (input: string | Transcript) => VoicePromptInjectionVerdict;
  rules: ReadonlyArray<VoicePromptInjectionRule>;
  sanitize: (input: string) => string;
};

const extractText = (input: string | Transcript): string =>
  typeof input === "string" ? input : input.text;

export const createVoicePromptInjectionGuard = (
  options: CreateVoicePromptInjectionGuardOptions = {},
): VoicePromptInjectionGuard => {
  const rules = options.rules ?? DEFAULT_VOICE_PROMPT_INJECTION_RULES;
  const replacement = options.sanitizedReplacement ?? "[REDACTED:INJECTION]";
  return {
    evaluate: (input) => {
      const text = extractText(input);
      const matches: VoicePromptInjectionVerdict["matches"] = [];
      for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        const match = rule.pattern.exec(text);
        if (match) {
          matches.push({
            label: rule.label,
            matchedText: match[0],
            severity: rule.severity,
          });
        }
      }
      return { matches, ok: matches.length === 0 };
    },
    rules,
    sanitize: (text) => {
      let result = text;
      for (const rule of rules) {
        result = result.replace(new RegExp(rule.pattern, "gi"), replacement);
      }
      return result;
    },
  };
};
