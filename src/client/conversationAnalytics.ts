import type { StoredVoiceTraceEvent } from "../core/trace";

type VoiceTrafficBucket = {
  bucketKey: string;
  callsCompleted: number;
  callsFailed: number;
  callsTransferred: number;
  callsVoicemail: number;
  callsTotal: number;
  totalDurationMs: number;
};

export type VoiceTrafficSummary = {
  buckets: VoiceTrafficBucket[];
  callsByDisposition: Record<string, number>;
  transferReasons: Record<string, number>;
  topTransferTargets: Array<{ count: number; target: string }>;
  totals: VoiceTrafficBucket;
  windowEndMs: number;
  windowStartMs: number;
};

export type SummarizeVoiceCallTrafficOptions = {
  bucketBy?: "day" | "hour" | "month";
  events: ReadonlyArray<StoredVoiceTraceEvent>;
  fromMs?: number;
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

const emptyBucket = (bucketKey: string): VoiceTrafficBucket => ({
  bucketKey,
  callsCompleted: 0,
  callsFailed: 0,
  callsTotal: 0,
  callsTransferred: 0,
  callsVoicemail: 0,
  totalDurationMs: 0,
});

type CallLifecycleStart = {
  type: "start";
};

type CallLifecycleEnd = {
  disposition?: string;
  type: "end";
};

type CallLifecycleTransfer = {
  reason?: string;
  target?: string;
  type: "transfer";
};

const isStart = (payload: unknown): payload is CallLifecycleStart =>
  Boolean(payload) &&
  typeof payload === "object" &&
  (payload as { type?: string }).type === "start";

const isEnd = (payload: unknown): payload is CallLifecycleEnd =>
  Boolean(payload) &&
  typeof payload === "object" &&
  (payload as { type?: string }).type === "end";

const isTransfer = (payload: unknown): payload is CallLifecycleTransfer =>
  Boolean(payload) &&
  typeof payload === "object" &&
  (payload as { type?: string }).type === "transfer";

export const summarizeVoiceCallTraffic = (
  options: SummarizeVoiceCallTrafficOptions,
): VoiceTrafficSummary => {
  const bucketBy = options.bucketBy ?? "day";
  const fromMs = options.fromMs ?? Number.NEGATIVE_INFINITY;
  const toMs = options.toMs ?? Number.POSITIVE_INFINITY;
  const buckets = new Map<string, VoiceTrafficBucket>();
  const totals = emptyBucket("total");
  const callsByDisposition: Record<string, number> = {};
  const transferReasons: Record<string, number> = {};
  const transferTargets: Record<string, number> = {};
  const callStarts = new Map<string, number>();
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  for (const event of options.events) {
    if (event.type !== "call.lifecycle") continue;
    if (event.at < fromMs || event.at > toMs) continue;
    minMs = Math.min(minMs, event.at);
    maxMs = Math.max(maxMs, event.at);
    const { payload } = event;
    if (isStart(payload)) {
      callStarts.set(event.sessionId, event.at);
      continue;
    }
    if (isTransfer(payload)) {
      const reason = payload.reason ?? "unspecified";
      transferReasons[reason] = (transferReasons[reason] ?? 0) + 1;
      if (payload.target) {
        transferTargets[payload.target] =
          (transferTargets[payload.target] ?? 0) + 1;
      }
      continue;
    }
    if (!isEnd(payload)) continue;
    const startedAt = callStarts.get(event.sessionId);
    callStarts.delete(event.sessionId);
    const bucketKey = formatBucketKey(event.at, bucketBy);
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = emptyBucket(bucketKey);
      buckets.set(bucketKey, bucket);
    }
    const disposition = payload.disposition ?? "unspecified";
    bucket.callsTotal += 1;
    totals.callsTotal += 1;
    if (disposition === "transferred") {
      bucket.callsTransferred += 1;
      totals.callsTransferred += 1;
    }
    if (disposition === "voicemail") {
      bucket.callsVoicemail += 1;
      totals.callsVoicemail += 1;
    }
    if (disposition === "failed") {
      bucket.callsFailed += 1;
      totals.callsFailed += 1;
    }
    if (disposition === "completed" || disposition === "closed") {
      bucket.callsCompleted += 1;
      totals.callsCompleted += 1;
    }
    if (typeof startedAt === "number") {
      const duration = Math.max(0, event.at - startedAt);
      bucket.totalDurationMs += duration;
      totals.totalDurationMs += duration;
    }
    callsByDisposition[disposition] =
      (callsByDisposition[disposition] ?? 0) + 1;
  }

  const topTransferTargets = Object.entries(transferTargets)
    .map(([target, count]) => ({ count, target }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    buckets: Array.from(buckets.values()).sort((a, b) =>
      a.bucketKey.localeCompare(b.bucketKey),
    ),
    callsByDisposition,
    topTransferTargets,
    totals,
    transferReasons,
    windowEndMs: Number.isFinite(maxMs) ? maxMs : 0,
    windowStartMs: Number.isFinite(minMs) ? minMs : 0,
  };
};
