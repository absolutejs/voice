import type {
  VoiceCampaign,
  VoiceCampaignAttempt,
  VoiceCampaignAttemptStatus,
  VoiceCampaignRecipient,
  VoiceCampaignRecord,
  VoiceCampaignTimeWindow,
} from "./campaign";

export type VoiceCampaignDisposition =
  | "answered"
  | "busy"
  | "failed"
  | "no-answer"
  | "voicemail";

export type VoiceCampaignDispositionRetryRule = {
  backoffMs?: number;
  maxAttempts?: number;
  retry?: boolean;
};

export type VoiceCampaignDispositionRetryPolicy = Partial<
  Record<VoiceCampaignDisposition, VoiceCampaignDispositionRetryRule>
>;

export type VoiceDNCList = {
  contains: (phone: string) => boolean | Promise<boolean>;
};

export const createInMemoryDNCList = (
  phones: ReadonlyArray<string>,
): VoiceDNCList => {
  const set = new Set(phones.map(normalizePhoneNumber));

  return {
    contains: (phone) => set.has(normalizePhoneNumber(phone)),
  };
};
export const isPhoneOnDNC = async (
  phone: string,
  list: VoiceDNCList,
): Promise<boolean> => Promise.resolve(list.contains(phone));
export const normalizePhoneNumber = (phone: string) =>
  phone.replace(/[\s()-]/g, "").trim();

export type VoiceCampaignWindowCheckInput = {
  now?: Date;
  window: VoiceCampaignTimeWindow;
};

export const isWithinCampaignWindow = (
  input: VoiceCampaignWindowCheckInput,
): boolean => {
  const now = input.now ?? new Date();
  const offsetMinutes = input.window.timeZoneOffsetMinutes ?? 0;
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const day = shifted.getUTCDay();
  if (input.window.daysOfWeek && !input.window.daysOfWeek.includes(day)) {
    return false;
  }
  const hour = shifted.getUTCHours();
  if (input.window.startHour <= input.window.endHour) {
    return hour >= input.window.startHour && hour < input.window.endHour;
  }

  // wraps midnight
  return hour >= input.window.startHour || hour < input.window.endHour;
};

export const shouldRetryCampaignAttempt = (input: {
  attempts: number;
  campaign: Pick<VoiceCampaign, "maxAttempts">;
  disposition?: VoiceCampaignDisposition;
  policy?: VoiceCampaignDispositionRetryPolicy;
}): { backoffMs?: number; retry: boolean } => {
  if (input.attempts >= input.campaign.maxAttempts) {
    return { retry: false };
  }
  const rule = input.disposition
    ? input.policy?.[input.disposition]
    : undefined;
  if (rule && rule.retry === false) {
    return { retry: false };
  }
  if (rule?.maxAttempts !== undefined && input.attempts >= rule.maxAttempts) {
    return { retry: false };
  }

  return { backoffMs: rule?.backoffMs, retry: true };
};

export type VoiceCampaignDispositionSummary = {
  attempts: number;
  byDisposition: Partial<Record<VoiceCampaignDisposition, number>>;
  byStatus: Record<VoiceCampaignAttemptStatus, number>;
  campaignId: string;
  recipientsByStatus: Record<VoiceCampaignRecipient["status"], number>;
  totalRecipients: number;
};

const dispositionFromAttempt = (
  attempt: VoiceCampaignAttempt,
): VoiceCampaignDisposition | undefined => {
  const { metadata } = attempt;
  if (metadata && typeof metadata.disposition === "string") {
    return metadata.disposition as VoiceCampaignDisposition;
  }
  if (attempt.status === "failed") {
    return "failed";
  }
  if (attempt.status === "succeeded") {
    return "answered";
  }

  return undefined;
};

export const summarizeVoiceCampaignDispositions = (
  record: VoiceCampaignRecord,
): VoiceCampaignDispositionSummary => {
  const byStatus: Record<VoiceCampaignAttemptStatus, number> = {
    canceled: 0,
    failed: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
  };
  const byDisposition: Partial<Record<VoiceCampaignDisposition, number>> = {};
  for (const attempt of record.attempts) {
    byStatus[attempt.status] = (byStatus[attempt.status] ?? 0) + 1;
    const disposition = dispositionFromAttempt(attempt);
    if (disposition) {
      byDisposition[disposition] = (byDisposition[disposition] ?? 0) + 1;
    }
  }
  const recipientsByStatus: Record<VoiceCampaignRecipient["status"], number> = {
    canceled: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    queued: 0,
  };
  for (const recipient of record.recipients) {
    recipientsByStatus[recipient.status] =
      (recipientsByStatus[recipient.status] ?? 0) + 1;
  }

  return {
    attempts: record.attempts.length,
    byDisposition,
    byStatus,
    campaignId: record.campaign.id,
    recipientsByStatus,
    totalRecipients: record.recipients.length,
  };
};
