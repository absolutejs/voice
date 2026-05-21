import type { VoiceCallerIdentity } from "./callerMemory";
import type { VoiceCRMContactSummary, VoiceCRMContract } from "./crmContract";

export type VoiceCallerCRMLinkRecord = {
  callerKey: string;
  vendor: string;
  contactId: string;
  contact: VoiceCRMContactSummary;
  resolvedAt: number;
  source: "memory" | "phone-lookup" | "email-lookup" | "manual";
};

export type VoiceCallerCRMLinkCacheStore = {
  get(
    key: string,
  ): Promise<VoiceCallerCRMLinkRecord | null> | VoiceCallerCRMLinkRecord | null;
  put(record: VoiceCallerCRMLinkRecord): Promise<void> | void;
  remove(key: string): Promise<boolean> | boolean;
};

export type CreateVoiceCallerCRMLinkerOptions = {
  contract: VoiceCRMContract;
  cache?: VoiceCallerCRMLinkCacheStore;
  staleAfterMs?: number;
  now?: () => number;
};

const cacheKeyFor = (identity: VoiceCallerIdentity, vendor: string): string => {
  const id =
    identity.externalId ?? identity.phone ?? identity.email ?? "anonymous";

  return `${vendor}::${id}`;
};

export const createInMemoryVoiceCallerCRMLinkCache =
  (): VoiceCallerCRMLinkCacheStore => {
    const store = new Map<string, VoiceCallerCRMLinkRecord>();

    return {
      get: (key) => store.get(key) ?? null,
      put: (record) => {
        store.set(record.callerKey, { ...record });
      },
      remove: (key) => store.delete(key),
    };
  };

export const createVoiceCallerCRMLinker = (
  options: CreateVoiceCallerCRMLinkerOptions,
) => {
  const now = options.now ?? (() => Date.now());
  const cache = options.cache ?? createInMemoryVoiceCallerCRMLinkCache();
  const staleAfter = options.staleAfterMs ?? 24 * 60 * 60 * 1000;

  const isFresh = (record: VoiceCallerCRMLinkRecord): boolean =>
    now() - record.resolvedAt < staleAfter;

  const resolve = async (
    identity: VoiceCallerIdentity,
  ): Promise<VoiceCallerCRMLinkRecord | null> => {
    const key = cacheKeyFor(identity, options.contract.vendor);
    const cached = await Promise.resolve(cache.get(key));
    if (cached && isFresh(cached)) {
      return cached;
    }
    let contact: VoiceCRMContactSummary | null = null;
    let source: VoiceCallerCRMLinkRecord["source"] | null = null;
    if (identity.phone) {
      contact = await options.contract.lookupByPhone(identity.phone);
      if (contact) source = "phone-lookup";
    }
    if (!contact && identity.email) {
      contact = await options.contract.lookupByEmail(identity.email);
      if (contact) source = "email-lookup";
    }
    if (!contact || !source) return null;
    const record: VoiceCallerCRMLinkRecord = {
      callerKey: key,
      contact,
      contactId: contact.id,
      resolvedAt: now(),
      source,
      vendor: options.contract.vendor,
    };
    await Promise.resolve(cache.put(record));

    return record;
  };

  const associate = async (
    identity: VoiceCallerIdentity,
    contact: VoiceCRMContactSummary,
  ): Promise<VoiceCallerCRMLinkRecord> => {
    const key = cacheKeyFor(identity, options.contract.vendor);
    const record: VoiceCallerCRMLinkRecord = {
      callerKey: key,
      contact,
      contactId: contact.id,
      resolvedAt: now(),
      source: "manual",
      vendor: options.contract.vendor,
    };
    await Promise.resolve(cache.put(record));

    return record;
  };

  const invalidate = async (
    identity: VoiceCallerIdentity,
  ): Promise<boolean> => {
    const key = cacheKeyFor(identity, options.contract.vendor);

    return Promise.resolve(cache.remove(key));
  };

  return {
    associate,
    contract: options.contract,
    invalidate,
    resolve,
  };
};

export type VoiceCallerCRMLinker = ReturnType<
  typeof createVoiceCallerCRMLinker
>;
