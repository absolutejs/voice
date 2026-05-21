import type { StoredVoiceTraceEvent } from "../core/trace";
import type { VoiceCostBreakdown } from "../core/costAccounting";

export type VoiceCostDashboardBucket = {
  bucketKey: string;
  callCount: number;
  llmUsd: number;
  sttUsd: number;
  telephonyMinutes: number;
  telephonyUsd: number;
  totalUsd: number;
  ttsUsd: number;
};

export type VoiceCostDashboardReport = {
  buckets: VoiceCostDashboardBucket[];
  generatedAt: number;
  grandTotal: VoiceCostDashboardBucket;
  windowEndMs: number;
  windowStartMs: number;
};

export type VoiceCostDashboardOptions = {
  bucketBy?: "day" | "hour" | "month";
  events: ReadonlyArray<StoredVoiceTraceEvent>;
  /** Inclusive bucket start filter, epoch ms. */
  fromMs?: number;
  /** Inclusive bucket end filter, epoch ms. */
  toMs?: number;
};

const padTwo = (value: number) => String(value).padStart(2, "0");

const formatBucketKey = (
  epochMs: number,
  bucketBy: "day" | "hour" | "month",
) => {
  const date = new Date(epochMs);
  const y = date.getUTCFullYear();
  const m = padTwo(date.getUTCMonth() + 1);
  const d = padTwo(date.getUTCDate());
  const h = padTwo(date.getUTCHours());
  if (bucketBy === "month") return `${y}-${m}`;
  if (bucketBy === "day") return `${y}-${m}-${d}`;
  return `${y}-${m}-${d}T${h}`;
};

const isCostBreakdown = (value: unknown): value is VoiceCostBreakdown =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as VoiceCostBreakdown).totalUsd === "number";

const emptyBucket = (bucketKey: string): VoiceCostDashboardBucket => ({
  bucketKey,
  callCount: 0,
  llmUsd: 0,
  sttUsd: 0,
  telephonyMinutes: 0,
  telephonyUsd: 0,
  totalUsd: 0,
  ttsUsd: 0,
});

const accumulate = (
  bucket: VoiceCostDashboardBucket,
  payload: VoiceCostBreakdown,
) => {
  bucket.callCount += 1;
  bucket.llmUsd += payload.llm.usd;
  bucket.sttUsd += payload.stt.usd;
  bucket.ttsUsd += payload.tts.usd;
  bucket.telephonyUsd += payload.telephony.usd;
  bucket.telephonyMinutes += payload.telephony.minutes;
  bucket.totalUsd += payload.totalUsd;
};

const roundCurrency = (bucket: VoiceCostDashboardBucket) => {
  bucket.llmUsd = Math.round(bucket.llmUsd * 1_000_000) / 1_000_000;
  bucket.sttUsd = Math.round(bucket.sttUsd * 1_000_000) / 1_000_000;
  bucket.ttsUsd = Math.round(bucket.ttsUsd * 1_000_000) / 1_000_000;
  bucket.telephonyUsd = Math.round(bucket.telephonyUsd * 1_000_000) / 1_000_000;
  bucket.totalUsd = Math.round(bucket.totalUsd * 1_000_000) / 1_000_000;
};

export const buildVoiceCostDashboardReport = (
  options: VoiceCostDashboardOptions,
): VoiceCostDashboardReport => {
  const bucketBy = options.bucketBy ?? "day";
  const fromMs = options.fromMs ?? Number.NEGATIVE_INFINITY;
  const toMs = options.toMs ?? Number.POSITIVE_INFINITY;
  const buckets = new Map<string, VoiceCostDashboardBucket>();
  const grandTotal = emptyBucket("total");
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  for (const event of options.events) {
    if (event.type !== "cost.ready") continue;
    if (event.at < fromMs || event.at > toMs) continue;
    if (!isCostBreakdown(event.payload)) continue;
    minMs = Math.min(minMs, event.at);
    maxMs = Math.max(maxMs, event.at);
    const bucketKey = formatBucketKey(event.at, bucketBy);
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = emptyBucket(bucketKey);
      buckets.set(bucketKey, bucket);
    }
    accumulate(bucket, event.payload);
    accumulate(grandTotal, event.payload);
  }
  for (const bucket of buckets.values()) {
    roundCurrency(bucket);
  }
  roundCurrency(grandTotal);
  return {
    buckets: Array.from(buckets.values()).sort((a, b) =>
      a.bucketKey.localeCompare(b.bucketKey),
    ),
    generatedAt: Date.now(),
    grandTotal,
    windowEndMs: Number.isFinite(maxMs) ? maxMs : 0,
    windowStartMs: Number.isFinite(minMs) ? minMs : 0,
  };
};
