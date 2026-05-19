import type { StoredVoiceTraceEvent } from "./trace";

export type VoiceOTELAttribute =
  | { key: string; value: { boolValue: boolean } }
  | { key: string; value: { doubleValue: number } }
  | { key: string; value: { intValue: string } }
  | { key: string; value: { stringValue: string } };

export type VoiceOTELSpan = {
  attributes: VoiceOTELAttribute[];
  endTimeUnixNano: string;
  kind: number;
  name: string;
  parentSpanId?: string;
  spanId: string;
  startTimeUnixNano: string;
  status: { code: number };
  traceId: string;
};

export type VoiceOTELResourceSpans = {
  resource: { attributes: VoiceOTELAttribute[] };
  scopeSpans: ReadonlyArray<{
    scope: { name: string; version?: string };
    spans: VoiceOTELSpan[];
  }>;
};

export type VoiceOTELPayload = {
  resourceSpans: VoiceOTELResourceSpans[];
};

export type VoiceTurnLatencySpanStage = {
  at: number;
  stage: string;
};

export type VoiceTurnLatencySpanSet = {
  endedAt: number;
  scenarioId?: string;
  sessionId: string;
  stages: VoiceTurnLatencySpanStage[];
  startedAt: number;
  turnId: string;
};

const SCOPE_NAME = "@absolutejs/voice";
const SPAN_KIND_INTERNAL = 1;
const STATUS_OK = 1;

const HEX_CHARS = "0123456789abcdef";

const hashToHex = (input: string, length: number) => {
  let hash = 0xcbf29ce4_84222325n;
  const prime = 0x100000001_b3n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  let hex = hash.toString(16).padStart(16, "0");
  while (hex.length < length) {
    let next = 0n;
    for (const ch of hex) {
      next = (next * 31n + BigInt(HEX_CHARS.indexOf(ch))) & 0xffffffffffffffffn;
    }
    hex += next.toString(16).padStart(16, "0");
  }
  return hex.slice(0, length);
};

export const buildOTELTraceId = (sessionId: string) =>
  hashToHex(`voice-trace:${sessionId}`, 32);

export const buildOTELSpanId = (sessionId: string, suffix: string) =>
  hashToHex(`voice-span:${sessionId}:${suffix}`, 16);

const toUnixNano = (ms: number) => `${Math.trunc(ms * 1_000_000)}`;

const stringAttr = (key: string, value: string): VoiceOTELAttribute => ({
  key,
  value: { stringValue: value },
});

export const aggregateVoiceTurnLatencySpans = (
  events: StoredVoiceTraceEvent[],
): VoiceTurnLatencySpanSet[] => {
  const byTurn = new Map<string, VoiceTurnLatencySpanSet>();
  for (const event of events) {
    if (event.type !== "turn_latency.stage" || !event.turnId) {
      continue;
    }
    const stage =
      typeof event.payload?.stage === "string" ? event.payload.stage : undefined;
    if (!stage) {
      continue;
    }
    const key = `${event.sessionId}::${event.turnId}`;
    const existing = byTurn.get(key);
    if (!existing) {
      byTurn.set(key, {
        endedAt: event.at,
        scenarioId: event.scenarioId,
        sessionId: event.sessionId,
        stages: [{ at: event.at, stage }],
        startedAt: event.at,
        turnId: event.turnId,
      });
      continue;
    }
    existing.stages.push({ at: event.at, stage });
    existing.startedAt = Math.min(existing.startedAt, event.at);
    existing.endedAt = Math.max(existing.endedAt, event.at);
  }
  return Array.from(byTurn.values()).sort(
    (left, right) => left.startedAt - right.startedAt,
  );
};

export type VoiceOTELExporterOptions = {
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  resourceAttributes?: Record<string, string>;
  serviceName?: string;
  url: string;
};

export const buildVoiceOTELPayload = (
  spanSets: VoiceTurnLatencySpanSet[],
  options: { resourceAttributes?: Record<string, string>; serviceName?: string } = {},
): VoiceOTELPayload => {
  const resourceAttributes: VoiceOTELAttribute[] = [
    stringAttr("service.name", options.serviceName ?? "absolutejs-voice"),
  ];
  for (const [key, value] of Object.entries(options.resourceAttributes ?? {})) {
    resourceAttributes.push(stringAttr(key, value));
  }

  const spans: VoiceOTELSpan[] = [];
  for (const set of spanSets) {
    const traceId = buildOTELTraceId(set.sessionId);
    const parentSpanId = buildOTELSpanId(set.sessionId, `turn:${set.turnId}`);
    spans.push({
      attributes: [
        stringAttr("voice.session_id", set.sessionId),
        stringAttr("voice.turn_id", set.turnId),
        ...(set.scenarioId
          ? [stringAttr("voice.scenario_id", set.scenarioId)]
          : []),
      ],
      endTimeUnixNano: toUnixNano(set.endedAt),
      kind: SPAN_KIND_INTERNAL,
      name: "voice.turn",
      spanId: parentSpanId,
      startTimeUnixNano: toUnixNano(set.startedAt),
      status: { code: STATUS_OK },
      traceId,
    });
    for (let index = 0; index < set.stages.length; index += 1) {
      const stage = set.stages[index]!;
      const next = set.stages[index + 1];
      const endsAt = next ? next.at : set.endedAt;
      spans.push({
        attributes: [
          stringAttr("voice.session_id", set.sessionId),
          stringAttr("voice.turn_id", set.turnId),
          stringAttr("voice.stage", stage.stage),
        ],
        endTimeUnixNano: toUnixNano(endsAt),
        kind: SPAN_KIND_INTERNAL,
        name: `voice.turn.stage.${stage.stage}`,
        parentSpanId,
        spanId: buildOTELSpanId(set.sessionId, `${set.turnId}:${stage.stage}:${index}`),
        startTimeUnixNano: toUnixNano(stage.at),
        status: { code: STATUS_OK },
        traceId,
      });
    }
  }

  return {
    resourceSpans: [
      {
        resource: { attributes: resourceAttributes },
        scopeSpans: [{ scope: { name: SCOPE_NAME }, spans }],
      },
    ],
  };
};

export type VoiceOTELExporter = {
  export: (events: StoredVoiceTraceEvent[]) => Promise<{ ok: boolean; status?: number }>;
};

export const createVoiceOTELHTTPExporter = (
  options: VoiceOTELExporterOptions,
): VoiceOTELExporter => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    export: async (events) => {
      const spanSets = aggregateVoiceTurnLatencySpans(events);
      if (spanSets.length === 0) {
        return { ok: true };
      }
      const payload = buildVoiceOTELPayload(spanSets, {
        resourceAttributes: options.resourceAttributes,
        serviceName: options.serviceName,
      });
      const response = await fetchImpl(options.url, {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        method: "POST",
      });
      return { ok: response.ok, status: response.status };
    },
  };
};
