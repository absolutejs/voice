import type {
  VoiceCRMCallActivityInput,
  VoiceCRMContract,
} from "./crmContract";

export type VoiceCRMCallLoggerInput = {
  sessionId: string;
  contactId?: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  summary?: string;
  disposition?: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceCRMCallLogResult = {
  activityId: string;
  vendor: string;
  loggedAt: number;
};

export type VoiceCRMCallLogErrorPolicy = "throw" | "swallow" | "queue";

export type CreateVoiceCRMCallLoggerOptions = {
  contract: VoiceCRMContract;
  errorPolicy?: VoiceCRMCallLogErrorPolicy;
  onError?: (
    error: Error,
    input: VoiceCRMCallLoggerInput,
  ) => void | Promise<void>;
  enqueueOnFailure?: (input: VoiceCRMCallLoggerInput) => Promise<void> | void;
  now?: () => number;
};

export const createVoiceCRMCallLogger = (
  options: CreateVoiceCRMCallLoggerOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const errorPolicy = options.errorPolicy ?? "swallow";

  const logCallEnd = async (
    input: VoiceCRMCallLoggerInput,
  ): Promise<VoiceCRMCallLogResult | null> => {
    const endedAt = input.endedAt ?? now();
    const duration =
      input.durationSeconds ??
      Math.max(0, Math.round((endedAt - input.startedAt) / 1000));
    const payload: VoiceCRMCallActivityInput = {
      durationSeconds: duration,
      endedAt,
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.disposition !== undefined
        ? { disposition: input.disposition }
        : {}),
      ...(input.recordingUrl !== undefined
        ? { recordingUrl: input.recordingUrl }
        : {}),
      ...(input.transcriptUrl !== undefined
        ? { transcriptUrl: input.transcriptUrl }
        : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    try {
      const result = await options.contract.logCall(payload);

      return {
        activityId: result.activityId,
        loggedAt: now(),
        vendor: options.contract.vendor,
      };
    } catch (rawError) {
      const error =
        rawError instanceof Error ? rawError : new Error(String(rawError));
      await options.onError?.(error, input);
      if (errorPolicy === "queue") {
        await options.enqueueOnFailure?.(input);

        return null;
      }
      if (errorPolicy === "throw") throw error;

      return null;
    }
  };

  const noteOnContact = async (input: {
    contactId: string;
    body: string;
  }): Promise<{ noteId: string } | null> => {
    try {
      return await options.contract.addNote(input);
    } catch (rawError) {
      const error =
        rawError instanceof Error ? rawError : new Error(String(rawError));
      await options.onError?.(error, {
        sessionId: "(note)",
        startedAt: now(),
        ...input,
      });
      if (errorPolicy === "throw") throw error;

      return null;
    }
  };

  return {
    contract: options.contract,
    logCallEnd,
    noteOnContact,
  };
};

export type VoiceCRMCallLogger = ReturnType<typeof createVoiceCRMCallLogger>;
