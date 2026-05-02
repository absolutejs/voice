import { Elysia } from "elysia";
import type { AudioFormat } from "./types";
import type { StoredVoiceTraceEvent } from "./trace";

export type VoiceRealtimeChannelStatus = "fail" | "pass" | "warn";

export type VoiceRealtimeChannelRuntimeSample = {
  format?: AudioFormat;
  observedAt?: number;
  kind:
    | "assistant-audio"
    | "browser-capture"
    | "input-audio"
    | "reconnect"
    | "turn-commit";
  latencyMs?: number;
  ok?: boolean;
  sessionId?: string;
  source?: string;
  turnId?: string;
};

export type VoiceRealtimeChannelBrowserCapture = {
  audioContextSampleRateHz?: number;
  channelCount?: 1 | 2;
  processorBufferSize?: number;
  sampleRateHz?: number;
};

export type VoiceRealtimeChannelReportOptions = {
  browserCapture?: VoiceRealtimeChannelBrowserCapture;
  expectedInputFormat?: AudioFormat;
  expectedOutputFormat?: AudioFormat;
  inputFormat?: AudioFormat;
  maxFirstAudioLatencyMs?: number;
  minAssistantAudioSamples?: number;
  minInputAudioSamples?: number;
  operationsRecordHref?: string;
  outputFormat?: AudioFormat;
  provider: string;
  readinessHref?: string;
  runtimeSamples?: VoiceRealtimeChannelRuntimeSample[];
  surface?: string;
};

export type VoiceRealtimeChannelIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type VoiceRealtimeChannelReport = {
  browserCapture?: VoiceRealtimeChannelBrowserCapture & {
    resamplingRequired: boolean;
    resamplingTargetHz?: number;
  };
  checkedAt: number;
  inputFormat: AudioFormat;
  issues: VoiceRealtimeChannelIssue[];
  operationsRecordHref?: string;
  outputFormat: AudioFormat;
  provider: string;
  readinessHref?: string;
  runtime: {
    assistantAudioSamples: number;
    firstAudioLatencyMs?: number;
    inputAudioSamples: number;
    samples: VoiceRealtimeChannelRuntimeSample[];
  };
  status: VoiceRealtimeChannelStatus;
  surface: string;
};

export type VoiceRealtimeChannelAssertionInput = {
  maxFirstAudioLatencyMs?: number;
  minAssistantAudioSamples?: number;
  minInputAudioSamples?: number;
  requireBrowserCapture?: boolean;
  requireOperationsRecordHref?: boolean;
  requirePass?: boolean;
  requireReadinessHref?: boolean;
};

export type VoiceRealtimeChannelAssertionReport = {
  issues: string[];
  ok: boolean;
  provider: string;
  status: VoiceRealtimeChannelStatus;
  surface: string;
};

export type VoiceRealtimeChannelRoutesOptions =
  VoiceRealtimeChannelReportOptions & {
    headers?: HeadersInit;
    htmlPath?: false | string;
    markdownPath?: false | string;
    name?: string;
    path?: string;
    render?: (report: VoiceRealtimeChannelReport) => Promise<string> | string;
    source?:
      | (() =>
          | Promise<VoiceRealtimeChannelReportOptions>
          | VoiceRealtimeChannelReportOptions)
      | VoiceRealtimeChannelReportOptions;
    title?: string;
  };

const DEFAULT_REALTIME_FORMAT: AudioFormat = {
  channels: 1,
  container: "raw",
  encoding: "pcm_s16le",
  sampleRateHz: 24_000,
};

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatLabel = (format: AudioFormat) =>
  `${format.container}/${format.encoding}/${String(format.sampleRateHz)}hz/${String(format.channels)}ch`;

const formatMatches = (actual: AudioFormat, expected: AudioFormat) =>
  actual.container === expected.container &&
  actual.encoding === expected.encoding &&
  actual.sampleRateHz === expected.sampleRateHz &&
  actual.channels === expected.channels;

const validateFormat = (
  label: string,
  actual: AudioFormat,
  expected: AudioFormat,
  issues: VoiceRealtimeChannelIssue[],
) => {
  if (!formatMatches(actual, expected)) {
    issues.push({
      code: `${label}-format-mismatch`,
      message: `${label} format ${formatLabel(actual)} does not match expected ${formatLabel(expected)}.`,
      severity: "error",
    });
  }
  if (actual.container !== "raw" || actual.encoding !== "pcm_s16le") {
    issues.push({
      code: `${label}-unsupported-encoding`,
      message: `${label} must use raw pcm_s16le audio for realtime proof.`,
      severity: "error",
    });
  }
  if (actual.channels !== 1) {
    issues.push({
      code: `${label}-not-mono`,
      message: `${label} should be mono for realtime provider input/output.`,
      severity: "error",
    });
  }
};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const eventHasRealtimeAssistantProof = (event: StoredVoiceTraceEvent) =>
  event.type === "turn.assistant" &&
  (event.payload.realtimeConfigured === true ||
    event.payload.mode === "realtime" ||
    event.metadata?.realtime === true);

export const buildVoiceRealtimeChannelRuntimeSamplesFromTrace = (
  events: readonly StoredVoiceTraceEvent[],
  options: {
    format?: AudioFormat;
    source?: string;
  } = {},
): VoiceRealtimeChannelRuntimeSample[] => {
  const format = options.format ?? DEFAULT_REALTIME_FORMAT;
  const source = options.source ?? "trace-store";
  const samples: VoiceRealtimeChannelRuntimeSample[] = [];
  const stagesByTurn = new Map<string, Map<string, number>>();

  for (const event of events) {
    if (event.type !== "turn_latency.stage" || !event.turnId) {
      continue;
    }
    const stage = readString(event.payload.stage);
    if (!stage) {
      continue;
    }
    const stages = stagesByTurn.get(event.turnId) ?? new Map<string, number>();
    stages.set(stage, event.at);
    stagesByTurn.set(event.turnId, stages);
  }

  for (const event of [...events].sort((left, right) => left.at - right.at)) {
    if (event.type === "turn.committed") {
      samples.push({
        format,
        kind: "input-audio",
        observedAt: event.at,
        ok: true,
        sessionId: event.sessionId,
        source,
        turnId: event.turnId,
      });
      samples.push({
        kind: "turn-commit",
        observedAt: event.at,
        ok: true,
        sessionId: event.sessionId,
        source,
        turnId: event.turnId,
      });
      continue;
    }

    if (eventHasRealtimeAssistantProof(event)) {
      const stages = event.turnId ? stagesByTurn.get(event.turnId) : undefined;
      const committedAt = stages?.get("turn_committed");
      const audioAt =
        stages?.get("assistant_audio_received") ??
        stages?.get("tts_send_completed") ??
        stages?.get("assistant_text_started") ??
        event.at;
      const latencyMs =
        committedAt !== undefined
          ? Math.max(0, audioAt - committedAt)
          : readNumber(event.payload.elapsedMs);

      samples.push({
        format,
        kind: "assistant-audio",
        latencyMs,
        observedAt: event.at,
        ok: event.payload.status !== "realtime-send-failed",
        sessionId: event.sessionId,
        source,
        turnId: event.turnId,
      });
      continue;
    }

    if (event.type === "client.reconnect") {
      samples.push({
        kind: "reconnect",
        observedAt: event.at,
        ok: event.payload.status !== "failed",
        sessionId: event.sessionId,
        source,
        turnId: event.turnId,
      });
    }
  }

  return samples;
};

export const buildVoiceRealtimeChannelReport = (
  options: VoiceRealtimeChannelReportOptions,
): VoiceRealtimeChannelReport => {
  const expectedInputFormat =
    options.expectedInputFormat ?? DEFAULT_REALTIME_FORMAT;
  const expectedOutputFormat =
    options.expectedOutputFormat ?? expectedInputFormat;
  const inputFormat = options.inputFormat ?? expectedInputFormat;
  const outputFormat = options.outputFormat ?? expectedOutputFormat;
  const runtimeSamples = options.runtimeSamples ?? [];
  const issues: VoiceRealtimeChannelIssue[] = [];

  validateFormat("input", inputFormat, expectedInputFormat, issues);
  validateFormat("output", outputFormat, expectedOutputFormat, issues);

  const browserCapture = options.browserCapture
    ? {
        ...options.browserCapture,
        resamplingRequired:
          options.browserCapture.audioContextSampleRateHz !== undefined &&
          options.browserCapture.audioContextSampleRateHz !==
            inputFormat.sampleRateHz,
        resamplingTargetHz: inputFormat.sampleRateHz,
      }
    : undefined;

  if (!browserCapture) {
    issues.push({
      code: "browser-capture-missing",
      message:
        "Browser capture settings are missing; realtime proof cannot show capture-to-provider format negotiation.",
      severity: "warning",
    });
  } else {
    if (browserCapture.sampleRateHz !== inputFormat.sampleRateHz) {
      issues.push({
        code: "browser-capture-target-mismatch",
        message: `Browser capture target ${String(browserCapture.sampleRateHz ?? "unknown")}hz does not match realtime input ${String(inputFormat.sampleRateHz)}hz.`,
        severity: "error",
      });
    }
    if ((browserCapture.channelCount ?? 1) !== inputFormat.channels) {
      issues.push({
        code: "browser-capture-channel-mismatch",
        message: `Browser capture channel count ${String(browserCapture.channelCount ?? "unknown")} does not match realtime input ${String(inputFormat.channels)}.`,
        severity: "error",
      });
    }
  }

  for (const sample of runtimeSamples) {
    if (sample.ok === false) {
      issues.push({
        code: "runtime-sample-failed",
        message: `Realtime runtime sample failed: ${sample.kind}.`,
        severity: "error",
      });
    }
    if (sample.format && !formatMatches(sample.format, inputFormat)) {
      issues.push({
        code: "runtime-format-mismatch",
        message: `Runtime sample ${sample.kind} used ${formatLabel(sample.format)} instead of ${formatLabel(inputFormat)}.`,
        severity: "error",
      });
    }
  }

  const inputAudioSamples = runtimeSamples.filter(
    (sample) => sample.kind === "input-audio",
  ).length;
  const assistantAudioSamples = runtimeSamples.filter(
    (sample) => sample.kind === "assistant-audio",
  ).length;
  const firstAudioLatencyMs = runtimeSamples
    .filter(
      (sample) =>
        sample.kind === "assistant-audio" &&
        typeof sample.latencyMs === "number" &&
        Number.isFinite(sample.latencyMs),
    )
    .map((sample) => sample.latencyMs as number)
    .sort((a, b) => a - b)[0];
  const minInputAudioSamples = options.minInputAudioSamples ?? 1;
  const minAssistantAudioSamples = options.minAssistantAudioSamples ?? 1;
  const maxFirstAudioLatencyMs = options.maxFirstAudioLatencyMs;

  if (inputAudioSamples < minInputAudioSamples) {
    issues.push({
      code: "runtime-input-audio-missing",
      message: `Expected at least ${String(minInputAudioSamples)} realtime input audio sample(s), found ${String(inputAudioSamples)}.`,
      severity: "warning",
    });
  }
  if (assistantAudioSamples < minAssistantAudioSamples) {
    issues.push({
      code: "runtime-assistant-audio-missing",
      message: `Expected at least ${String(minAssistantAudioSamples)} realtime assistant audio sample(s), found ${String(assistantAudioSamples)}.`,
      severity: "warning",
    });
  }
  if (
    maxFirstAudioLatencyMs !== undefined &&
    (firstAudioLatencyMs === undefined ||
      firstAudioLatencyMs > maxFirstAudioLatencyMs)
  ) {
    issues.push({
      code: "first-audio-latency-over-budget",
      message: `Expected first realtime assistant audio at or below ${String(maxFirstAudioLatencyMs)}ms, found ${String(firstAudioLatencyMs ?? "missing")}ms.`,
      severity: "warning",
    });
  }

  const status: VoiceRealtimeChannelStatus = issues.some(
    (issue) => issue.severity === "error",
  )
    ? "fail"
    : issues.length > 0
      ? "warn"
      : "pass";

  return {
    browserCapture,
    checkedAt: Date.now(),
    inputFormat,
    issues,
    operationsRecordHref: options.operationsRecordHref,
    outputFormat,
    provider: options.provider,
    readinessHref: options.readinessHref,
    runtime: {
      assistantAudioSamples,
      firstAudioLatencyMs,
      inputAudioSamples,
      samples: runtimeSamples,
    },
    status,
    surface: options.surface ?? "Direct realtime/duplex providers",
  };
};

export const evaluateVoiceRealtimeChannelEvidence = (
  report: VoiceRealtimeChannelReport,
  input: VoiceRealtimeChannelAssertionInput = {},
): VoiceRealtimeChannelAssertionReport => {
  const issues: string[] = [];
  if ((input.requirePass ?? false) && report.status !== "pass") {
    issues.push(
      `Expected realtime channel proof to pass, found ${report.status}.`,
    );
  }
  if (input.requireBrowserCapture && !report.browserCapture) {
    issues.push("Missing browser capture negotiation proof.");
  }
  if (input.requireOperationsRecordHref && !report.operationsRecordHref) {
    issues.push("Missing operations-record link for realtime channel proof.");
  }
  if (input.requireReadinessHref && !report.readinessHref) {
    issues.push("Missing readiness link for realtime channel proof.");
  }
  if (
    input.minInputAudioSamples !== undefined &&
    report.runtime.inputAudioSamples < input.minInputAudioSamples
  ) {
    issues.push(
      `Expected at least ${String(input.minInputAudioSamples)} realtime input audio samples, found ${String(report.runtime.inputAudioSamples)}.`,
    );
  }
  if (
    input.minAssistantAudioSamples !== undefined &&
    report.runtime.assistantAudioSamples < input.minAssistantAudioSamples
  ) {
    issues.push(
      `Expected at least ${String(input.minAssistantAudioSamples)} realtime assistant audio samples, found ${String(report.runtime.assistantAudioSamples)}.`,
    );
  }
  if (
    input.maxFirstAudioLatencyMs !== undefined &&
    (report.runtime.firstAudioLatencyMs === undefined ||
      report.runtime.firstAudioLatencyMs > input.maxFirstAudioLatencyMs)
  ) {
    issues.push(
      `Expected first realtime assistant audio at or below ${String(input.maxFirstAudioLatencyMs)}ms, found ${String(report.runtime.firstAudioLatencyMs ?? "missing")}ms.`,
    );
  }

  return {
    issues,
    ok: issues.length === 0,
    provider: report.provider,
    status: report.status,
    surface: report.surface,
  };
};

export const assertVoiceRealtimeChannelEvidence = (
  report: VoiceRealtimeChannelReport,
  input: VoiceRealtimeChannelAssertionInput = {},
): VoiceRealtimeChannelAssertionReport => {
  const assertion = evaluateVoiceRealtimeChannelEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice realtime channel assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const renderVoiceRealtimeChannelMarkdown = (
  report: VoiceRealtimeChannelReport,
) =>
  [
    "# Voice Realtime Channel Proof",
    "",
    `- Status: ${report.status}`,
    `- Provider: ${report.provider}`,
    `- Surface: ${report.surface}`,
    `- Input format: ${formatLabel(report.inputFormat)}`,
    `- Output format: ${formatLabel(report.outputFormat)}`,
    `- Browser capture: ${report.browserCapture ? `${String(report.browserCapture.sampleRateHz)}hz target, ${String(report.browserCapture.channelCount ?? 1)}ch` : "missing"}`,
    `- Resampling required: ${report.browserCapture?.resamplingRequired ? "yes" : "no"}`,
    `- Input audio samples: ${String(report.runtime.inputAudioSamples)}`,
    `- Assistant audio samples: ${String(report.runtime.assistantAudioSamples)}`,
    `- First audio latency: ${String(report.runtime.firstAudioLatencyMs ?? "n/a")}ms`,
    "",
    "## Issues",
    "",
    ...(report.issues.length
      ? report.issues.map(
          (issue) =>
            `- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,
        )
      : ["- None"]),
  ].join("\n");

export const renderVoiceRealtimeChannelHTML = (
  report: VoiceRealtimeChannelReport,
  title = "Voice Realtime Channel Proof",
) => {
  const issues = report.issues
    .map(
      (issue) =>
        `<li class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.code)}</strong>: ${escapeHtml(issue.message)}</li>`,
    )
    .join("");
  const rows = report.runtime.samples
    .map(
      (sample) =>
        `<tr><td>${escapeHtml(sample.kind)}</td><td>${escapeHtml(sample.source ?? "runtime")}</td><td>${escapeHtml(sample.format ? formatLabel(sample.format) : "n/a")}</td><td>${escapeHtml(sample.latencyMs ?? "n/a")}</td><td>${escapeHtml(sample.ok ?? true)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101418;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1080px;padding:32px}.hero,.card{background:#17201d;border:1px solid #2e3d36;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.18),rgba(59,130,246,.12))}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}.summary{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.metric{background:#101814;border:1px solid #2e3d36;border-radius:18px;padding:14px}.metric span{color:#a8b5ad;display:block;font-size:.78rem;text-transform:uppercase}.metric strong{display:block;font-size:1.65rem;margin-top:5px}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:7px 11px}.pass{color:#86efac}.warn{color:#fde68a}.fail,.error{color:#fecaca}.warning{color:#fde68a}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2e3d36;padding:10px;text-align:left}.links a{color:#5eead4;margin-right:12px}</style></head><body><main><section class="hero"><p class="eyebrow">Realtime / duplex readiness</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(report.status)}">${escapeHtml(report.status)}</p><p>Provider <strong>${escapeHtml(report.provider)}</strong> · ${escapeHtml(report.surface)}</p><p class="links">${report.readinessHref ? `<a href="${escapeHtml(report.readinessHref)}">Readiness</a>` : ""}${report.operationsRecordHref ? `<a href="${escapeHtml(report.operationsRecordHref)}">Operations record</a>` : ""}</p><section class="summary"><div class="metric"><span>Input</span><strong>${escapeHtml(formatLabel(report.inputFormat))}</strong></div><div class="metric"><span>Output</span><strong>${escapeHtml(formatLabel(report.outputFormat))}</strong></div><div class="metric"><span>Browser capture</span><strong>${escapeHtml(report.browserCapture ? `${String(report.browserCapture.sampleRateHz)}hz` : "missing")}</strong></div><div class="metric"><span>Resampling</span><strong>${report.browserCapture?.resamplingRequired ? "required" : "not required"}</strong></div><div class="metric"><span>Input samples</span><strong>${String(report.runtime.inputAudioSamples)}</strong></div><div class="metric"><span>Assistant samples</span><strong>${String(report.runtime.assistantAudioSamples)}</strong></div></section></section><section class="card"><h2>Issues</h2><ul>${issues || '<li class="pass">No realtime channel issues.</li>'}</ul></section><section class="card"><h2>Runtime Samples</h2><table><thead><tr><th>Kind</th><th>Source</th><th>Format</th><th>Latency ms</th><th>OK</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No runtime samples configured.</td></tr>'}</tbody></table></section></main></body></html>`;
};

export const createVoiceRealtimeChannelRoutes = (
  options: VoiceRealtimeChannelRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/realtime-channel";
  const htmlPath = options.htmlPath ?? "/voice/realtime-channel";
  const markdownPath = options.markdownPath ?? "/voice/realtime-channel.md";
  const headers = options.headers ?? {};
  const title = options.title ?? "Voice Realtime Channel Proof";
  const resolveOptions = async () => {
    const source =
      typeof options.source === "function"
        ? await options.source()
        : (options.source ?? options);
    const {
      headers: _headers,
      htmlPath: _htmlPath,
      markdownPath: _markdownPath,
      name: _name,
      path: _path,
      render: _render,
      source: _source,
      title: _title,
      ...reportOptions
    } = {
      ...options,
      ...source,
    };
    return reportOptions satisfies VoiceRealtimeChannelReportOptions;
  };
  const report = async () =>
    buildVoiceRealtimeChannelReport(await resolveOptions());
  const app = new Elysia({
    name: options.name ?? "voice-realtime-channel",
  }).get(
    path,
    async () =>
      new Response(JSON.stringify(await report(), null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...headers,
        },
      }),
  );

  if (htmlPath !== false) {
    app.get(htmlPath, async () => {
      const current = await report();
      const body = options.render
        ? await options.render(current)
        : renderVoiceRealtimeChannelHTML(current, title);
      return new Response(body, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...headers,
        },
      });
    });
  }

  if (markdownPath !== false) {
    app.get(
      markdownPath,
      async () =>
        new Response(renderVoiceRealtimeChannelMarkdown(await report()), {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            ...headers,
          },
        }),
    );
  }

  return app;
};
