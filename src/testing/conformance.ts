import type { VoiceSTTAdapterHarnessResult } from "./stt";

export type VoiceSTTConformanceCheck = {
  detail: string;
  id: string;
  passed: boolean;
};

export type VoiceSTTConformanceReport = {
  checks: VoiceSTTConformanceCheck[];
  passed: boolean;
};

export const evaluateSTTAdapterConformance = (
  result: VoiceSTTAdapterHarnessResult,
): VoiceSTTConformanceReport => {
  const transcripts = [
    ...result.partialEvents.map((event) => event.transcript),
    ...result.finalEvents.map((event) => event.transcript),
  ];
  const checks: VoiceSTTConformanceCheck[] = [
    {
      detail: "The adapter emitted no error events for a valid fixture.",
      id: "no-errors",
      passed: result.errorEvents.length === 0,
    },
    {
      detail: "Every transcript has a stable id and finite start time.",
      id: "transcript-identity",
      passed: transcripts.every(
        (transcript) =>
          transcript.id.trim().length > 0 && Number.isFinite(transcript.startedAtMs),
      ),
    },
    {
      detail: "Events marked final contain final transcripts.",
      id: "final-semantics",
      passed: result.finalEvents.every((event) => event.transcript.isFinal),
    },
    {
      detail: "Events marked partial contain non-final transcripts.",
      id: "partial-semantics",
      passed: result.partialEvents.every((event) => !event.transcript.isFinal),
    },
    {
      detail: "The assembled transcript is non-empty when finals were emitted.",
      id: "assembly",
      passed:
        result.finalEvents.length === 0 || result.finalText.trim().length > 0,
    },
  ];
  return { checks, passed: checks.every((check) => check.passed) };
};
