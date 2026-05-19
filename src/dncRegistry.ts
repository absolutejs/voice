export type VoiceDNCSource = "internal" | "regulatory" | "imported";

export type VoiceDNCEntry = {
  phoneNumber: string;
  source: VoiceDNCSource;
  reason?: string;
  addedAt: number;
  expiresAt?: number;
};

export type VoiceDNCLookupVerdict = {
  blocked: boolean;
  entry: VoiceDNCEntry | null;
  matchedFromExternal?: boolean;
};

export type VoiceDNCExternalLookup = (
  phoneNumber: string,
) => Promise<VoiceDNCEntry | null> | VoiceDNCEntry | null;

export type CreateVoiceDNCRegistryOptions = {
  entries?: VoiceDNCEntry[];
  externalLookup?: VoiceDNCExternalLookup;
  now?: () => number;
};

const normalizePhone = (phone: string): string => {
  const trimmed = phone.trim();
  if (!trimmed) throw new Error("Phone number is required");
  const digitsOnly = trimmed.replace(/[\s().-]/gu, "");
  if (!/^\+?\d+$/u.test(digitsOnly)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return digitsOnly.startsWith("+") ? digitsOnly : `+${digitsOnly}`;
};

export const createVoiceDNCRegistry = (
  options: CreateVoiceDNCRegistryOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const store = new Map<string, VoiceDNCEntry>();
  for (const entry of options.entries ?? []) {
    store.set(normalizePhone(entry.phoneNumber), {
      ...entry,
      phoneNumber: normalizePhone(entry.phoneNumber),
    });
  }

  const isExpired = (entry: VoiceDNCEntry, at: number): boolean =>
    entry.expiresAt !== undefined && entry.expiresAt <= at;

  const block = (
    phoneNumber: string,
    options: { source?: VoiceDNCSource; reason?: string; expiresAt?: number } = {},
  ): VoiceDNCEntry => {
    const normalized = normalizePhone(phoneNumber);
    const entry: VoiceDNCEntry = {
      addedAt: now(),
      phoneNumber: normalized,
      source: options.source ?? "internal",
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
      ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    };
    store.set(normalized, entry);
    return entry;
  };

  const unblock = (phoneNumber: string): boolean => {
    const normalized = normalizePhone(phoneNumber);
    return store.delete(normalized);
  };

  const localLookup = (phoneNumber: string): VoiceDNCEntry | null => {
    const normalized = normalizePhone(phoneNumber);
    const entry = store.get(normalized);
    if (!entry) return null;
    if (isExpired(entry, now())) {
      store.delete(normalized);
      return null;
    }
    return entry;
  };

  return {
    block,
    async check(phoneNumber: string): Promise<VoiceDNCLookupVerdict> {
      const local = localLookup(phoneNumber);
      if (local) return { blocked: true, entry: local };
      if (!options.externalLookup) {
        return { blocked: false, entry: null };
      }
      const remote = await options.externalLookup(normalizePhone(phoneNumber));
      if (!remote) return { blocked: false, entry: null };
      return { blocked: true, entry: remote, matchedFromExternal: true };
    },
    checkSync(phoneNumber: string): VoiceDNCLookupVerdict {
      const local = localLookup(phoneNumber);
      return local
        ? { blocked: true, entry: local }
        : { blocked: false, entry: null };
    },
    has(phoneNumber: string): boolean {
      return localLookup(phoneNumber) !== null;
    },
    snapshot(): VoiceDNCEntry[] {
      const at = now();
      const live: VoiceDNCEntry[] = [];
      for (const entry of store.values()) {
        if (!isExpired(entry, at)) live.push(entry);
      }
      return live;
    },
    unblock,
  };
};

export type VoiceDNCRegistry = ReturnType<typeof createVoiceDNCRegistry>;

export const importVoiceDNCFromCSV = (
  csv: string,
  options: {
    phoneColumn?: string;
    reasonColumn?: string;
    source?: VoiceDNCSource;
    now?: () => number;
  } = {},
): VoiceDNCEntry[] => {
  const lines = csv.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
  const phoneCol = options.phoneColumn?.toLowerCase() ?? "phone";
  const reasonCol = options.reasonColumn?.toLowerCase() ?? "reason";
  const phoneIdx = header.indexOf(phoneCol);
  const reasonIdx = header.indexOf(reasonCol);
  if (phoneIdx === -1) {
    throw new Error(`Phone column not found in CSV header: ${phoneCol}`);
  }
  const now = options.now ?? (() => Date.now());
  const at = now();
  const entries: VoiceDNCEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = (lines[i] ?? "").split(",").map((cell) => cell.trim());
    const phone = row[phoneIdx];
    if (!phone) continue;
    entries.push({
      addedAt: at,
      phoneNumber: normalizePhone(phone),
      source: options.source ?? "imported",
      ...(reasonIdx >= 0 && row[reasonIdx]
        ? { reason: row[reasonIdx] }
        : {}),
    });
  }
  return entries;
};
