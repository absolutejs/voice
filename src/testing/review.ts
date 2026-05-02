import type { VoiceCallDisposition, VoiceServerMessage } from "../types";

type ReviewTimelineSource = "benchmark" | "stt" | "turn" | "twilio";
type TimelineTrafficSummary = {
  audioMs?: number;
  bytes: number;
  count: number;
  label: string;
};

export type VoiceCallReviewTimelineEvent = {
  atMs: number;
  event: string;
  source: ReviewTimelineSource;
  bytes?: number;
  chunkDurationMs?: number;
  chunkIndex?: number;
  confidence?: number;
  name?: string;
  reason?: string;
  text?: string;
  track?: string;
};

export type VoiceCallReviewConfig = {
  preset?: string;
  stt?: Record<string, unknown>;
  tts?: Record<string, unknown>;
  turnDetection?: Record<string, unknown>;
};

export type VoiceCallReviewPostCallSummary = {
  label: string;
  recommendedAction: string;
  reason?: string;
  summary: string;
  target?: string;
};

export type VoiceCallReviewSummary = {
  clearLatencyMs?: number;
  elapsedMs?: number;
  firstOutboundMediaLatencyMs?: number;
  firstTurnLatencyMs?: number;
  markLatencyMs?: number;
  outcome?: VoiceCallDisposition;
  outboundMediaCount?: number;
  pass: boolean;
  termRecall?: number;
  turnCount?: number;
  wordErrorRate?: number;
};

export type VoiceCallReviewArtifact = {
  id?: string;
  config?: VoiceCallReviewConfig;
  errors: string[];
  expectedText?: string;
  fixtureId?: string;
  generatedAt?: number;
  latencyBreakdown: Array<{
    label: string;
    valueMs: number;
  }>;
  notes: string[];
  path?: string;
  postCall?: VoiceCallReviewPostCallSummary;
  summary: VoiceCallReviewSummary;
  title: string;
  timeline: VoiceCallReviewTimelineEvent[];
  transcript: {
    actual: string;
    expected?: string;
  };
};

export type StoredVoiceCallReviewArtifact = VoiceCallReviewArtifact & {
  id: string;
};

export type VoiceCallReviewStore<
  TArtifact extends StoredVoiceCallReviewArtifact =
    StoredVoiceCallReviewArtifact,
> = {
  get: (id: string) => Promise<TArtifact | undefined> | TArtifact | undefined;
  list: () => Promise<TArtifact[]> | TArtifact[];
  remove: (id: string) => Promise<void> | void;
  set: (id: string, artifact: TArtifact) => Promise<void> | void;
};

type LiveTelephonyFixture = {
  actualText: string;
  clearLatencyMs?: number;
  elapsedMs?: number;
  errors?: string[];
  expectedText?: string;
  fixtureId?: string;
  firstOutboundMediaLatencyMs?: number;
  firstTurnLatencyMs?: number;
  markLatencyMs?: number;
  outboundMediaCount?: number;
  passes: boolean;
  termRecall?: number;
  title?: string;
  turnCount?: number;
  wordErrorRate?: number;
};

type LiveTelephonyTraceEvent = VoiceCallReviewTimelineEvent;

type LiveTelephonyReviewInput = {
  fixtures?: LiveTelephonyFixture[];
  generatedAt?: number;
  trace?: LiveTelephonyTraceEvent[];
  ttsConfig?: Record<string, unknown>;
  turnDetectionConfig?: Record<string, unknown>;
  variant?: {
    description?: string;
    id?: string;
    model?: string;
  };
};

export type VoiceCallReviewRecorderOptions = {
  config?: VoiceCallReviewConfig;
  fixtureId?: string;
  now?: () => number;
  path?: string;
  title?: string;
};

export type VoiceCallReviewRecorder = {
  finalize: () => VoiceCallReviewArtifact;
  recordError: (error: unknown) => void;
  recordTwilioInbound: (input: {
    bytes?: number;
    chunkDurationMs?: number;
    event: "connected" | "mark" | "media" | "start" | "stop";
    name?: string;
    reason?: string;
    text?: string;
    track?: string;
  }) => void;
  recordTwilioOutbound: (input: {
    bytes?: number;
    chunkDurationMs?: number;
    event: "clear" | "mark" | "media";
    name?: string;
    reason?: string;
    text?: string;
    track?: string;
  }) => void;
  recordVoiceMessage: (message: VoiceServerMessage) => void;
};

const roundMetric = (value: number | undefined) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : undefined;

const formatMetric = (label: string, value: number | undefined, unit = "ms") =>
  typeof value === "number"
    ? `${label}: ${roundMetric(value)}${unit}`
    : undefined;

const findTimelineEvent = (
  timeline: VoiceCallReviewTimelineEvent[],
  event: string,
  source?: ReviewTimelineSource,
) =>
  timeline.find(
    (entry) =>
      entry.event === event &&
      (source === undefined || entry.source === source),
  );

const formatTimelineText = (entry: VoiceCallReviewTimelineEvent) => {
  const parts = [`- ${entry.atMs}ms`, `[${entry.source}]`, entry.event];
  if (entry.text) {
    parts.push(`"${entry.text}"`);
  }
  if (entry.reason) {
    parts.push(`reason=${entry.reason}`);
  }
  if (typeof entry.bytes === "number") {
    parts.push(`bytes=${entry.bytes}`);
  }
  if (typeof entry.confidence === "number") {
    parts.push(`confidence=${roundMetric(entry.confidence)}`);
  }
  if (entry.name) {
    parts.push(`name=${entry.name}`);
  }
  return parts.join(" ");
};

const isLowSignalTimelineEvent = (entry: VoiceCallReviewTimelineEvent) =>
  entry.event === "inbound-media" ||
  entry.event === "inbound-silence-pad" ||
  entry.event === "stt-send" ||
  entry.event === "tts-audio";

const summarizeTimelineTraffic = (timeline: VoiceCallReviewTimelineEvent[]) => {
  const summaries = new Map<string, TimelineTrafficSummary>();

  for (const entry of timeline) {
    const label =
      entry.event === "inbound-media"
        ? "inbound media chunks"
        : entry.event === "inbound-silence-pad"
          ? "inbound silence padding"
          : entry.event === "stt-send"
            ? "STT audio sends"
            : entry.event === "tts-audio"
              ? "post-first TTS audio chunks"
              : undefined;
    if (!label) {
      continue;
    }

    const summary = summaries.get(label) ?? {
      audioMs: 0,
      bytes: 0,
      count: 0,
      label,
    };
    summary.count += 1;
    summary.bytes += typeof entry.bytes === "number" ? entry.bytes : 0;
    summary.audioMs =
      (summary.audioMs ?? 0) +
      (typeof entry.chunkDurationMs === "number" ? entry.chunkDurationMs : 0);
    summaries.set(label, summary);
  }

  return [...summaries.values()];
};

const compactTimeline = (timeline: VoiceCallReviewTimelineEvent[]) => {
  const rows: string[] = [];
  let index = 0;

  while (index < timeline.length) {
    const current = timeline[index];
    if (!current) {
      break;
    }
    const isBurstEvent =
      isLowSignalTimelineEvent(current) ||
      (current.event === "media" && current.source === "twilio");

    if (!isBurstEvent) {
      rows.push(formatTimelineText(current));
      index += 1;
      continue;
    }

    let endIndex = index;
    let totalBytes = typeof current.bytes === "number" ? current.bytes : 0;
    let totalChunkDurationMs =
      typeof current.chunkDurationMs === "number" ? current.chunkDurationMs : 0;

    while (endIndex + 1 < timeline.length) {
      const next = timeline[endIndex + 1];
      if (!next) {
        break;
      }
      if (next.event !== current.event || next.source !== current.source) {
        break;
      }
      totalBytes += typeof next.bytes === "number" ? next.bytes : 0;
      totalChunkDurationMs +=
        typeof next.chunkDurationMs === "number" ? next.chunkDurationMs : 0;
      endIndex += 1;
    }

    const startAt = current.atMs;
    const endAt = timeline[endIndex]?.atMs ?? current.atMs;
    const count = endIndex - index + 1;
    const parts = [
      `- ${startAt}-${endAt}ms`,
      `[${current.source}]`,
      `${current.event} x${count}`,
    ];
    if (totalBytes > 0) {
      parts.push(`bytes=${totalBytes}`);
    }
    if (totalChunkDurationMs > 0) {
      parts.push(`audio=${roundMetric(totalChunkDurationMs)}ms`);
    }
    rows.push(parts.join(" "));
    index = endIndex + 1;
  }

  return rows;
};

export const withVoiceCallReviewId = <
  TArtifact extends VoiceCallReviewArtifact = VoiceCallReviewArtifact,
>(
  id: string,
  artifact: TArtifact,
): TArtifact & { id: string } => ({
  ...artifact,
  id,
});

export const createVoiceCallReviewFromLiveTelephonyReport = (
  report: LiveTelephonyReviewInput,
  options: {
    path?: string;
    preset?: string;
  } = {},
): VoiceCallReviewArtifact => {
  const fixture = report.fixtures?.[0];
  if (!fixture) {
    throw new Error(
      "Live telephony review requires at least one fixture result.",
    );
  }

  const timeline = [...(report.trace ?? [])].sort(
    (left, right) => left.atMs - right.atMs,
  );
  const firstPartial = findTimelineEvent(timeline, "partial", "stt");
  const commitEvent = findTimelineEvent(timeline, "commit", "turn");
  const firstTtsAudio = findTimelineEvent(
    timeline,
    "tts-first-audio",
    "benchmark",
  );
  const firstOutboundMedia = findTimelineEvent(timeline, "media", "twilio");
  const bargeInEvent = findTimelineEvent(timeline, "barge-in", "benchmark");
  const clearEvent = findTimelineEvent(timeline, "clear", "twilio");
  const lastSttText =
    [...timeline]
      .reverse()
      .find(
        (entry) =>
          entry.source === "stt" &&
          (entry.event === "partial" || entry.event === "final") &&
          typeof entry.text === "string" &&
          entry.text.length > 0,
      )?.text ?? undefined;
  const latencyBreakdown = [
    typeof firstPartial?.atMs === "number"
      ? {
          label: "start to first partial",
          valueMs: firstPartial.atMs,
        }
      : undefined,
    typeof firstPartial?.atMs === "number" &&
    typeof commitEvent?.atMs === "number"
      ? {
          label: "first partial to commit",
          valueMs: commitEvent.atMs - firstPartial.atMs,
        }
      : undefined,
    typeof commitEvent?.atMs === "number" &&
    typeof firstTtsAudio?.atMs === "number"
      ? {
          label: "commit to first TTS audio",
          valueMs: firstTtsAudio.atMs - commitEvent.atMs,
        }
      : undefined,
    typeof commitEvent?.atMs === "number" &&
    typeof firstOutboundMedia?.atMs === "number"
      ? {
          label: "commit to first outbound media",
          valueMs: firstOutboundMedia.atMs - commitEvent.atMs,
        }
      : undefined,
    typeof bargeInEvent?.atMs === "number" &&
    typeof clearEvent?.atMs === "number"
      ? {
          label: "barge-in to clear",
          valueMs: clearEvent.atMs - bargeInEvent.atMs,
        }
      : undefined,
  ].filter(
    (value): value is { label: string; valueMs: number } =>
      value !== undefined && value.valueMs >= 0,
  );
  const notes = [
    report.variant?.description,
    firstPartial?.text ? `First partial: "${firstPartial.text}"` : undefined,
    lastSttText ? `Last STT text: "${lastSttText}"` : undefined,
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return {
    config: {
      preset: options.preset,
      stt: report.variant
        ? {
            description: report.variant.description,
            id: report.variant.id,
            model: report.variant.model,
          }
        : undefined,
      tts: report.ttsConfig,
      turnDetection: report.turnDetectionConfig,
    },
    errors: fixture.errors ?? [],
    expectedText: fixture.expectedText,
    fixtureId: fixture.fixtureId,
    generatedAt: report.generatedAt,
    latencyBreakdown,
    notes,
    path: options.path,
    summary: {
      clearLatencyMs: roundMetric(fixture.clearLatencyMs),
      elapsedMs: roundMetric(fixture.elapsedMs),
      firstOutboundMediaLatencyMs: roundMetric(
        fixture.firstOutboundMediaLatencyMs,
      ),
      firstTurnLatencyMs: roundMetric(fixture.firstTurnLatencyMs),
      markLatencyMs: roundMetric(fixture.markLatencyMs),
      outboundMediaCount: fixture.outboundMediaCount,
      pass: fixture.passes,
      termRecall: roundMetric(fixture.termRecall),
      turnCount: fixture.turnCount,
      wordErrorRate: roundMetric(fixture.wordErrorRate),
    },
    title: fixture.title ?? "Voice Call Review",
    timeline,
    transcript: {
      actual: fixture.actualText,
      expected: fixture.expectedText,
    },
  };
};

const toErrorMessage = (error: unknown) => {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown call error";
};

export const createVoiceCallReviewRecorder = (
  options: VoiceCallReviewRecorderOptions = {},
): VoiceCallReviewRecorder => {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const errors: string[] = [];
  const timeline: VoiceCallReviewTimelineEvent[] = [];
  const committedTurns: string[] = [];
  const committedTurnIds = new Set<string>();

  const push = (
    source: ReviewTimelineSource,
    event: string,
    fields: Omit<
      VoiceCallReviewTimelineEvent,
      "atMs" | "event" | "source"
    > = {},
  ) => {
    timeline.push({
      atMs: Math.max(0, now() - startedAt),
      event,
      source,
      ...fields,
    });
  };

  return {
    finalize: () => {
      const sortedTimeline = [...timeline].sort(
        (left, right) => left.atMs - right.atMs,
      );
      const firstPartial = findTimelineEvent(sortedTimeline, "partial", "stt");
      const commitEvent = findTimelineEvent(sortedTimeline, "commit", "turn");
      const firstTtsAudio = findTimelineEvent(
        sortedTimeline,
        "tts-first-audio",
        "benchmark",
      );
      const firstOutboundMedia = findTimelineEvent(
        sortedTimeline,
        "media",
        "twilio",
      );
      const bargeInEvent = findTimelineEvent(
        sortedTimeline,
        "barge-in",
        "benchmark",
      );
      const clearEvent = findTimelineEvent(sortedTimeline, "clear", "twilio");
      const markEvent = findTimelineEvent(sortedTimeline, "mark", "twilio");
      const elapsedMs = sortedTimeline.at(-1)?.atMs ?? 0;
      const lastSttText =
        [...sortedTimeline]
          .reverse()
          .find(
            (entry) =>
              entry.source === "stt" &&
              (entry.event === "partial" || entry.event === "final") &&
              typeof entry.text === "string" &&
              entry.text.length > 0,
          )?.text ?? undefined;
      const latencyBreakdown = [
        typeof firstPartial?.atMs === "number"
          ? {
              label: "start to first partial",
              valueMs: firstPartial.atMs,
            }
          : undefined,
        typeof firstPartial?.atMs === "number" &&
        typeof commitEvent?.atMs === "number"
          ? {
              label: "first partial to commit",
              valueMs: commitEvent.atMs - firstPartial.atMs,
            }
          : undefined,
        typeof commitEvent?.atMs === "number" &&
        typeof firstTtsAudio?.atMs === "number"
          ? {
              label: "commit to first TTS audio",
              valueMs: firstTtsAudio.atMs - commitEvent.atMs,
            }
          : undefined,
        typeof commitEvent?.atMs === "number" &&
        typeof firstOutboundMedia?.atMs === "number"
          ? {
              label: "commit to first outbound media",
              valueMs: firstOutboundMedia.atMs - commitEvent.atMs,
            }
          : undefined,
        typeof bargeInEvent?.atMs === "number" &&
        typeof clearEvent?.atMs === "number"
          ? {
              label: "barge-in to clear",
              valueMs: clearEvent.atMs - bargeInEvent.atMs,
            }
          : undefined,
      ].filter(
        (value): value is { label: string; valueMs: number } =>
          value !== undefined && value.valueMs >= 0,
      );

      return {
        config: options.config,
        errors,
        fixtureId: options.fixtureId,
        generatedAt: now(),
        latencyBreakdown,
        notes: [
          firstPartial?.text
            ? `First partial: "${firstPartial.text}"`
            : undefined,
          lastSttText ? `Last STT text: "${lastSttText}"` : undefined,
        ].filter((value): value is string => typeof value === "string"),
        path: options.path,
        summary: {
          clearLatencyMs: roundMetric(
            typeof clearEvent?.atMs === "number" &&
              typeof bargeInEvent?.atMs === "number"
              ? clearEvent.atMs - bargeInEvent.atMs
              : undefined,
          ),
          elapsedMs: roundMetric(elapsedMs),
          firstOutboundMediaLatencyMs: roundMetric(firstOutboundMedia?.atMs),
          firstTurnLatencyMs: roundMetric(commitEvent?.atMs),
          markLatencyMs: roundMetric(markEvent?.atMs),
          outboundMediaCount: sortedTimeline.filter(
            (entry) => entry.source === "twilio" && entry.event === "media",
          ).length,
          pass: errors.length === 0,
          turnCount: committedTurns.length,
        },
        title: options.title ?? "Voice Call Review",
        timeline: sortedTimeline,
        transcript: {
          actual: committedTurns.join(" ").trim(),
        },
      } satisfies VoiceCallReviewArtifact;
    },
    recordError: (error) => {
      const message = toErrorMessage(error);
      errors.push(message);
      push("turn", "error", {
        reason: message,
      });
    },
    recordTwilioInbound: (input) => {
      push("twilio", input.event, {
        bytes: input.bytes,
        chunkDurationMs: input.chunkDurationMs,
        name: input.name,
        reason: input.reason,
        text: input.text,
        track: input.track,
      });
    },
    recordTwilioOutbound: (input) => {
      push("twilio", input.event, {
        bytes: input.bytes,
        chunkDurationMs: input.chunkDurationMs,
        name: input.name,
        reason: input.reason,
        text: input.text,
        track: input.track,
      });
    },
    recordVoiceMessage: (message) => {
      switch (message.type) {
        case "partial":
        case "final":
          push("stt", message.type, {
            confidence: message.transcript.confidence,
            text: message.transcript.text,
          });
          return;
        case "assistant":
          push("turn", "assistant", {
            text: message.text,
          });
          return;
        case "audio":
          push(
            "benchmark",
            timeline.some((entry) => entry.event === "tts-first-audio")
              ? "tts-audio"
              : "tts-first-audio",
            {
              bytes: Math.floor((message.chunkBase64.length * 3) / 4),
            },
          );
          return;
        case "turn":
          if (committedTurnIds.has(message.turn.id)) {
            return;
          }
          committedTurnIds.add(message.turn.id);
          committedTurns.push(message.turn.text);
          push("turn", "commit", {
            confidence: message.turn.quality?.averageConfidence,
            text: message.turn.text,
          });
          return;
        case "error":
          errors.push(message.message);
          push("turn", "error", {
            reason: message.message,
          });
          return;
        case "complete":
          push("turn", "complete", {
            text: message.sessionId,
          });
          return;
        case "session":
          push("turn", "session", {
            reason: message.status,
            text: message.sessionId,
          });
          return;
        case "pong":
          push("benchmark", "pong");
          return;
      }
    },
  };
};

const renderConfigSection = (config: VoiceCallReviewConfig | undefined) => {
  if (!config) {
    return "";
  }

  return [
    "## Config",
    "",
    "```json",
    JSON.stringify(config, null, 2),
    "```",
  ].join("\n");
};

const renderTimeline = (timeline: VoiceCallReviewTimelineEvent[]) => {
  const focusedTimeline = timeline.filter(
    (entry) => !isLowSignalTimelineEvent(entry),
  );
  if (focusedTimeline.length === 0) {
    return "## Timeline\n\n_No timeline events captured._";
  }

  const lines = compactTimeline(focusedTimeline);

  return ["## Timeline", "", ...lines].join("\n");
};

const renderTransportSummary = (timeline: VoiceCallReviewTimelineEvent[]) => {
  const summaries = summarizeTimelineTraffic(timeline);
  if (summaries.length === 0) {
    return "";
  }

  return [
    "## Transport Summary",
    "",
    ...summaries.map((summary) => {
      const parts = [`- ${summary.label}: ${summary.count}`];
      if (summary.bytes > 0) {
        parts.push(`${summary.bytes} bytes`);
      }
      if ((summary.audioMs ?? 0) > 0) {
        parts.push(`${roundMetric(summary.audioMs)}ms audio`);
      }
      return parts.join(", ");
    }),
  ].join("\n");
};

const renderLatencyBreakdown = (
  breakdown: VoiceCallReviewArtifact["latencyBreakdown"],
) => {
  if (breakdown.length === 0) {
    return "";
  }

  return [
    "## Latency Breakdown",
    "",
    ...breakdown.map(
      (entry) => `- ${entry.label}: ${roundMetric(entry.valueMs)}ms`,
    ),
  ].join("\n");
};

export const renderVoiceCallReviewMarkdown = (
  artifact: VoiceCallReviewArtifact,
) => {
  const summaryLines = [
    `- pass: ${artifact.summary.pass ? "yes" : "no"}`,
    formatMetric("first turn", artifact.summary.firstTurnLatencyMs),
    formatMetric(
      "first outbound media",
      artifact.summary.firstOutboundMediaLatencyMs,
    ),
    formatMetric("mark", artifact.summary.markLatencyMs),
    formatMetric("clear", artifact.summary.clearLatencyMs),
    formatMetric("elapsed", artifact.summary.elapsedMs),
    typeof artifact.summary.wordErrorRate === "number"
      ? `- word error rate: ${artifact.summary.wordErrorRate}`
      : undefined,
    typeof artifact.summary.termRecall === "number"
      ? `- term recall: ${artifact.summary.termRecall}`
      : undefined,
    typeof artifact.summary.turnCount === "number"
      ? `- turn count: ${artifact.summary.turnCount}`
      : undefined,
    typeof artifact.summary.outboundMediaCount === "number"
      ? `- outbound media count: ${artifact.summary.outboundMediaCount}`
      : undefined,
  ].filter((value): value is string => typeof value === "string");

  const notes = artifact.notes.length
    ? ["## Notes", "", ...artifact.notes.map((note) => `- ${note}`)].join("\n")
    : "";

  const errors = artifact.errors.length
    ? ["## Errors", "", ...artifact.errors.map((error) => `- ${error}`)].join(
        "\n",
      )
    : "";
  const latency = renderLatencyBreakdown(artifact.latencyBreakdown);
  const transportSummary = renderTransportSummary(artifact.timeline);

  return [
    `# ${artifact.title}`,
    "",
    artifact.path ? `Source: \`${artifact.path}\`` : undefined,
    artifact.fixtureId ? `Fixture: \`${artifact.fixtureId}\`` : undefined,
    "",
    "## Summary",
    "",
    ...summaryLines,
    "",
    "## Transcript",
    "",
    `- expected: ${artifact.transcript.expected ?? "_n/a_"}`,
    `- actual: ${artifact.transcript.actual}`,
    "",
    notes,
    notes ? "" : undefined,
    latency,
    latency ? "" : undefined,
    transportSummary,
    transportSummary ? "" : undefined,
    errors,
    errors ? "" : undefined,
    renderConfigSection(artifact.config),
    renderConfigSection(artifact.config) ? "" : undefined,
    renderTimeline(artifact.timeline),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderVoiceCallReviewHTML = (
  artifact: VoiceCallReviewArtifact,
) => {
  const notes = artifact.notes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  const latency = artifact.latencyBreakdown
    .map(
      (entry) =>
        `<li><strong>${escapeHtml(entry.label)}:</strong> ${roundMetric(entry.valueMs)}ms</li>`,
    )
    .join("");
  const transport = summarizeTimelineTraffic(artifact.timeline)
    .map((summary) => {
      const parts = [`${summary.count}`, "events"];
      if (summary.bytes > 0) {
        parts.push(`${summary.bytes} bytes`);
      }
      if ((summary.audioMs ?? 0) > 0) {
        parts.push(`${roundMetric(summary.audioMs)}ms audio`);
      }
      return `<li><strong>${escapeHtml(summary.label)}:</strong> ${escapeHtml(
        parts.join(", "),
      )}</li>`;
    })
    .join("");
  const timeline = compactTimeline(
    artifact.timeline.filter((entry) => !isLowSignalTimelineEvent(entry)),
  )
    .map((line) => `<li>${escapeHtml(line.replace(/^- /u, ""))}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; background: #0b0d10; color: #f4f4f5; }
    main { max-width: 980px; margin: 0 auto; display: grid; gap: 16px; }
    section { background: #13161b; border: 1px solid #232833; border-radius: 16px; padding: 18px; }
    h1, h2 { margin: 0 0 12px; }
    ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, monospace; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #0f1217; border-radius: 12px; padding: 14px; border: 1px solid #232833; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .metric { display: grid; gap: 4px; }
    .label { color: #a1a1aa; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .value { font-size: 1.05rem; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>${escapeHtml(artifact.title)}</h1>
      <div class="grid">
        <div class="metric"><div class="label">Pass</div><div class="value">${artifact.summary.pass ? "yes" : "no"}</div></div>
        <div class="metric"><div class="label">First Turn</div><div class="value">${artifact.summary.firstTurnLatencyMs ?? "n/a"}ms</div></div>
        <div class="metric"><div class="label">First Outbound Media</div><div class="value">${artifact.summary.firstOutboundMediaLatencyMs ?? "n/a"}ms</div></div>
        <div class="metric"><div class="label">Turn Count</div><div class="value">${artifact.summary.turnCount ?? "n/a"}</div></div>
      </div>
    </section>
    <section>
      <h2>Transcript</h2>
      <ul>
        <li><strong>Expected:</strong> ${escapeHtml(artifact.transcript.expected ?? "n/a")}</li>
        <li><strong>Actual:</strong> ${escapeHtml(artifact.transcript.actual || "n/a")}</li>
      </ul>
    </section>
    <section>
      <h2>Notes</h2>
      <ul>${notes || "<li>No notes.</li>"}</ul>
    </section>
    <section>
      <h2>Latency Breakdown</h2>
      <ul>${latency || "<li>No latency data.</li>"}</ul>
    </section>
    <section>
      <h2>Transport Summary</h2>
      <ul>${transport || "<li>No transport data.</li>"}</ul>
    </section>
    <section>
      <h2>Timeline</h2>
      <ul>${timeline || "<li>No timeline events.</li>"}</ul>
    </section>
    <section>
      <h2>Config</h2>
      <pre>${escapeHtml(JSON.stringify(artifact.config ?? {}, null, 2))}</pre>
    </section>
  </main>
</body>
</html>`;
};
