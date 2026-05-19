export type VoiceCRMContactSummary = {
  id: string;
  vendor?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceCRMLeadInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceCRMCallActivityInput = {
  contactId?: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  summary?: string;
  disposition?: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceCRMNoteInput = {
  contactId: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type VoiceCRMTaskInput = {
  contactId?: string;
  subject: string;
  description?: string;
  dueAt?: number;
  priority?: "low" | "normal" | "high";
};

export type VoiceCRMContract = {
  readonly vendor: string;
  lookupByPhone(phone: string): Promise<VoiceCRMContactSummary | null>;
  lookupByEmail(email: string): Promise<VoiceCRMContactSummary | null>;
  createLead(input: VoiceCRMLeadInput): Promise<VoiceCRMContactSummary>;
  logCall(input: VoiceCRMCallActivityInput): Promise<{ activityId: string }>;
  addNote(input: VoiceCRMNoteInput): Promise<{ noteId: string }>;
  createTask?(input: VoiceCRMTaskInput): Promise<{ taskId: string }>;
};

export type VoiceCRMRegistry = {
  default(): VoiceCRMContract | null;
  get(vendor: string): VoiceCRMContract | null;
  list(): VoiceCRMContract[];
};

export type CreateVoiceCRMRegistryOptions = {
  contracts: VoiceCRMContract[];
  defaultVendor?: string;
};

export const createVoiceCRMRegistry = (
  options: CreateVoiceCRMRegistryOptions,
): VoiceCRMRegistry => {
  const byVendor = new Map<string, VoiceCRMContract>();
  for (const contract of options.contracts) {
    byVendor.set(contract.vendor, contract);
  }
  const defaultVendor =
    options.defaultVendor ?? options.contracts[0]?.vendor ?? null;

  return {
    default() {
      return defaultVendor ? (byVendor.get(defaultVendor) ?? null) : null;
    },
    get(vendor) {
      return byVendor.get(vendor) ?? null;
    },
    list() {
      return Array.from(byVendor.values());
    },
  };
};
