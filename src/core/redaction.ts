import type { Transcript } from "./types";

export type VoiceRedactionPattern = {
  label: string;
  replacement?: string;
  regex: RegExp;
};

export const DEFAULT_VOICE_REDACTION_PATTERNS: VoiceRedactionPattern[] = [
  {
    label: "credit-card",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[REDACTED:CC]",
  },
  {
    label: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED:SSN]",
  },
  {
    label: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED:EMAIL]",
  },
  {
    label: "phone",
    regex: /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
    replacement: "[REDACTED:PHONE]",
  },
];

export type VoiceTranscriptRedactor = (transcript: Transcript) => Transcript;

export type CreateVoiceTranscriptRedactorOptions = {
  patterns?: VoiceRedactionPattern[];
};

export const createVoiceTranscriptRedactor = (
  options: CreateVoiceTranscriptRedactorOptions = {},
): VoiceTranscriptRedactor => {
  const patterns = options.patterns ?? DEFAULT_VOICE_REDACTION_PATTERNS;

  return (transcript) => {
    if (!transcript.text) {
      return transcript;
    }
    let redacted = transcript.text;
    for (const pattern of patterns) {
      redacted = redacted.replace(
        pattern.regex,
        pattern.replacement ?? `[REDACTED:${pattern.label.toUpperCase()}]`,
      );
    }
    if (redacted === transcript.text) {
      return transcript;
    }

    return { ...transcript, text: redacted };
  };
};

export const redactVoiceTranscript = (
  transcript: Transcript,
  patterns: VoiceRedactionPattern[] = DEFAULT_VOICE_REDACTION_PATTERNS,
): Transcript => createVoiceTranscriptRedactor({ patterns })(transcript);
