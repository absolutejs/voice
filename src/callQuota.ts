export type VoiceCallQuotaTier = {
  burstAllowance?: number;
  customerId: string;
  monthlyMinutes?: number;
  reservedConcurrent: number;
};

export type VoiceCallReservation = {
  callId: string;
  customerId: string;
  release: () => Promise<void> | void;
  reservedAt: number;
};

export type VoiceCallQuotaRejection = {
  customerId: string;
  reason:
    | "concurrency-exceeded"
    | "customer-not-found"
    | "monthly-minutes-exceeded";
  retryAfterMs?: number;
};

export type VoiceCallQuotaResult =
  | { ok: false; rejection: VoiceCallQuotaRejection }
  | { ok: true; reservation: VoiceCallReservation };

export type VoiceCallQuota = {
  describe: (customerId: string) => Promise<
    | undefined
    | {
        activeCalls: number;
        burstAllowance: number;
        monthlyMinutesUsed: number;
        reservedConcurrent: number;
        tier: VoiceCallQuotaTier;
      }
  > | (
    | undefined
    | {
        activeCalls: number;
        burstAllowance: number;
        monthlyMinutesUsed: number;
        reservedConcurrent: number;
        tier: VoiceCallQuotaTier;
      }
  );
  recordMinutes: (input: {
    callId?: string;
    customerId: string;
    minutes: number;
  }) => Promise<void> | void;
  reserve: (input: {
    callId: string;
    customerId: string;
  }) => Promise<VoiceCallQuotaResult> | VoiceCallQuotaResult;
};

export type CreateInMemoryVoiceCallQuotaOptions = {
  /** When provided, treat any customer not in the map as denied with 'customer-not-found'. */
  strict?: boolean;
  tiers: VoiceCallQuotaTier[];
};

const monthBucketKey = (epochMs: number) => {
  const date = new Date(epochMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const createInMemoryVoiceCallQuota = (
  options: CreateInMemoryVoiceCallQuotaOptions,
): VoiceCallQuota => {
  const tiers = new Map(options.tiers.map((tier) => [tier.customerId, tier]));
  const activeCalls = new Map<string, Set<string>>();
  const monthlyUsage = new Map<string, Map<string, number>>();

  const usageFor = (customerId: string) => {
    const key = monthBucketKey(Date.now());
    let bucket = monthlyUsage.get(customerId);
    if (!bucket) {
      bucket = new Map();
      monthlyUsage.set(customerId, bucket);
    }
    return { bucket, key };
  };

  return {
    describe: (customerId) => {
      const tier = tiers.get(customerId);
      if (!tier) return undefined;
      const active = activeCalls.get(customerId)?.size ?? 0;
      const { bucket, key } = usageFor(customerId);
      return {
        activeCalls: active,
        burstAllowance: tier.burstAllowance ?? 0,
        monthlyMinutesUsed: bucket.get(key) ?? 0,
        reservedConcurrent: tier.reservedConcurrent,
        tier,
      };
    },
    recordMinutes: ({ customerId, minutes }) => {
      const { bucket, key } = usageFor(customerId);
      bucket.set(key, (bucket.get(key) ?? 0) + Math.max(0, minutes));
    },
    reserve: ({ callId, customerId }) => {
      const tier = tiers.get(customerId);
      if (!tier) {
        if (options.strict) {
          return {
            ok: false,
            rejection: { customerId, reason: "customer-not-found" },
          };
        }
        return {
          ok: true,
          reservation: {
            callId,
            customerId,
            release: () => {},
            reservedAt: Date.now(),
          },
        };
      }
      const limit = tier.reservedConcurrent + (tier.burstAllowance ?? 0);
      const set = activeCalls.get(customerId) ?? new Set<string>();
      if (set.size >= limit) {
        return {
          ok: false,
          rejection: {
            customerId,
            reason: "concurrency-exceeded",
            retryAfterMs: 30_000,
          },
        };
      }
      if (typeof tier.monthlyMinutes === "number") {
        const { bucket, key } = usageFor(customerId);
        if ((bucket.get(key) ?? 0) >= tier.monthlyMinutes) {
          return {
            ok: false,
            rejection: {
              customerId,
              reason: "monthly-minutes-exceeded",
            },
          };
        }
      }
      set.add(callId);
      activeCalls.set(customerId, set);
      return {
        ok: true,
        reservation: {
          callId,
          customerId,
          release: () => {
            set.delete(callId);
            if (set.size === 0) activeCalls.delete(customerId);
          },
          reservedAt: Date.now(),
        },
      };
    },
  };
};
