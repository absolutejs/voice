export type VoiceRetentionPolicyOptions = {
  /** Maximum age in milliseconds; events older than this are eligible for purge. */
  maxAgeMs: number;
  /** Optional override that returns the timestamp for an event. Defaults to event.at. */
  resolveAt?: (event: unknown) => number | undefined;
};

export type VoiceRetentionStore<TRecord extends { id: string }> = {
  list: (filter?: Record<string, unknown>) => Promise<TRecord[]> | TRecord[];
  remove: (id: string) => Promise<void> | void;
};

export type VoicePurgeReport = {
  attempted: number;
  failed: number;
  purgedIds: string[];
  reason: "expired" | "manual";
  removed: number;
};

const defaultResolveAt = (event: unknown): number | undefined => {
  if (!event || typeof event !== "object") return undefined;
  const value = (event as Record<string, unknown>).at;
  return typeof value === "number" ? value : undefined;
};

export const purgeVoiceRetentionStore = async <TRecord extends { id: string }>(
  store: VoiceRetentionStore<TRecord>,
  options: VoiceRetentionPolicyOptions,
  now: number = Date.now(),
): Promise<VoicePurgeReport> => {
  const resolveAt = options.resolveAt ?? defaultResolveAt;
  const cutoff = now - Math.max(0, options.maxAgeMs);
  const records = await Promise.resolve(store.list());
  const purgedIds: string[] = [];
  let attempted = 0;
  let removed = 0;
  let failed = 0;
  for (const record of records) {
    const at = resolveAt(record);
    if (typeof at !== "number" || at >= cutoff) continue;
    attempted += 1;
    try {
      await Promise.resolve(store.remove(record.id));
      purgedIds.push(record.id);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted, failed, purgedIds, reason: "expired", removed };
};

export type VoiceRetentionScheduler = {
  start: () => void;
  stop: () => void;
};

export type CreateVoiceRetentionSchedulerOptions<
  TRecord extends { id: string },
> = {
  intervalMs?: number;
  onReport?: (report: VoicePurgeReport) => void;
  policy: VoiceRetentionPolicyOptions;
  store: VoiceRetentionStore<TRecord>;
};

export const createVoiceRetentionScheduler = <TRecord extends { id: string }>(
  options: CreateVoiceRetentionSchedulerOptions<TRecord>,
): VoiceRetentionScheduler => {
  const intervalMs = Math.max(60_000, options.intervalMs ?? 6 * 60 * 60_000);
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = async () => {
    const report = await purgeVoiceRetentionStore(options.store, options.policy);
    options.onReport?.(report);
  };
  return {
    start: () => {
      if (timer) return;
      timer = setInterval(() => {
        void run();
      }, intervalMs);
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
};
