import type {
  StoredVoiceAuditEvent,
  VoiceAuditEventFilter,
  VoiceAuditEventStore,
} from "./audit";
import {
  redactVoiceTraceText,
  resolveVoiceTraceRedactionOptions,
  type VoiceTraceRedactionConfig,
  type VoiceResolvedTraceRedactionOptions,
} from "./trace";
import {
  summarizeVoiceAuditTrail,
  type VoiceAuditTrailSummary,
} from "./auditRoutes";

export type VoiceAuditExport = {
  events: StoredVoiceAuditEvent[];
  exportedAt: number;
  filter?: VoiceAuditEventFilter;
  redacted: boolean;
  summary: VoiceAuditTrailSummary;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeRedactionKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const resolveReplacement = (input: {
  key?: string;
  options: VoiceResolvedTraceRedactionOptions;
  path: string[];
  value: string;
}) =>
  typeof input.options.replacement === "function"
    ? input.options.replacement({
        key: input.key,
        path: input.path,
        value: input.value,
      })
    : input.options.replacement;

const redactAuditValue = (
  value: unknown,
  config: VoiceTraceRedactionConfig,
  options: VoiceResolvedTraceRedactionOptions,
  path: string[],
): unknown => {
  const key = path.at(-1);
  const normalizedKey = key ? normalizeRedactionKey(key) : undefined;
  const sensitiveKeys = new Set(options.keys.map(normalizeRedactionKey));
  const textKeys = new Set(options.textKeys.map(normalizeRedactionKey));

  if (
    normalizedKey &&
    sensitiveKeys.has(normalizedKey) &&
    (value === null ||
      ["boolean", "number", "string", "undefined"].includes(typeof value))
  ) {
    return resolveReplacement({
      key,
      options,
      path,
      value: String(value ?? ""),
    });
  }

  if (typeof value === "string") {
    const shouldRedactText =
      options.redactText &&
      (!normalizedKey ||
        textKeys.has(normalizedKey) ||
        path.length === 0 ||
        path[0] === "payload" ||
        path[0] === "metadata");
    return shouldRedactText
      ? redactVoiceTraceText(value, config, {
          key,
          path,
        })
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactAuditValue(item, config, options, [...path, String(index)]),
    );
  }

  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactAuditValue(entryValue, config, options, [...path, entryKey]),
      ]),
    );
  }

  return value;
};

export const redactVoiceAuditEvent = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(
  event: TEvent,
  options: VoiceTraceRedactionConfig = {},
): TEvent => {
  const resolved = resolveVoiceTraceRedactionOptions(options);
  return {
    ...event,
    actor: redactAuditValue(event.actor, options, resolved, [
      "actor",
    ]) as TEvent["actor"],
    metadata: redactAuditValue(event.metadata, options, resolved, [
      "metadata",
    ]) as TEvent["metadata"],
    payload: redactAuditValue(event.payload, options, resolved, [
      "payload",
    ]) as TEvent["payload"],
    resource: redactAuditValue(event.resource, options, resolved, [
      "resource",
    ]) as TEvent["resource"],
  };
};

export const redactVoiceAuditEvents = <
  TEvent extends StoredVoiceAuditEvent = StoredVoiceAuditEvent,
>(
  events: TEvent[],
  options: VoiceTraceRedactionConfig = {},
) => events.map((event) => redactVoiceAuditEvent(event, options));

export const exportVoiceAuditTrail = async (input: {
  filter?: VoiceAuditEventFilter;
  redact?: VoiceTraceRedactionConfig;
  store: VoiceAuditEventStore;
}): Promise<VoiceAuditExport> => {
  const events = await input.store.list(input.filter);
  const exportedEvents = input.redact
    ? redactVoiceAuditEvents(events, input.redact)
    : events;

  return {
    events: exportedEvents,
    exportedAt: Date.now(),
    filter: input.filter,
    redacted: Boolean(input.redact),
    summary: summarizeVoiceAuditTrail(exportedEvents),
  };
};

const formatAuditValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const renderAuditEventMarkdown = (event: StoredVoiceAuditEvent) => {
  const actor = event.actor
    ? `${event.actor.kind}:${event.actor.id}`
    : "unknown";
  const resource = event.resource
    ? `${event.resource.type}${event.resource.id ? `:${event.resource.id}` : ""}`
    : "";
  const detail = [
    `actor=${actor}`,
    resource ? `resource=${resource}` : undefined,
    event.sessionId ? `session=${event.sessionId}` : undefined,
    event.traceId ? `trace=${event.traceId}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return `- ${new Date(event.at).toISOString()} [${event.type}] ${event.action} ${event.outcome ?? "recorded"} ${detail} ${formatAuditValue(event.payload)}`.trim();
};

export const renderVoiceAuditMarkdown = (
  events: StoredVoiceAuditEvent[],
  options: {
    redact?: VoiceTraceRedactionConfig;
    title?: string;
  } = {},
) => {
  const renderEvents = options.redact
    ? redactVoiceAuditEvents(events, options.redact)
    : events;
  const summary = summarizeVoiceAuditTrail(renderEvents);
  const lines = [
    `# ${options.title ?? "Voice Audit Trail"}`,
    "",
    `Events: ${summary.total}`,
    `Errors: ${summary.errors}`,
    `Latest: ${summary.latestAt ? new Date(summary.latestAt).toISOString() : "never"}`,
    "",
    "## Event Types",
    "",
    ...summary.byType.map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## Events",
    "",
    ...renderEvents.map(renderAuditEventMarkdown),
  ];

  return lines.join("\n");
};

export const renderVoiceAuditHTML = (
  events: StoredVoiceAuditEvent[],
  options: {
    redact?: VoiceTraceRedactionConfig;
    title?: string;
  } = {},
) => {
  const title = options.title ?? "Voice Audit Trail";
  const markdown = renderVoiceAuditMarkdown(events, options);
  const renderEvents = options.redact
    ? redactVoiceAuditEvents(events, options.redact)
    : events;
  const summary = summarizeVoiceAuditTrail(renderEvents);
  const rows = renderEvents
    .map(
      (event) =>
        `<tr><td>${escapeHtml(new Date(event.at).toISOString())}</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.outcome ?? "")}</td><td><code>${escapeHtml(JSON.stringify(event.payload ?? {}))}</code></td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;line-height:1.45;background:#f8f7f2;color:#181713}main{max-width:1100px;margin:auto}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin:1rem 0}.card{background:white;border:1px solid #ded9cc;border-radius:12px;padding:1rem}table{border-collapse:collapse;width:100%;background:white;border:1px solid #ded9cc}th,td{border-bottom:1px solid #eee8dc;padding:.65rem;text-align:left;vertical-align:top}code{white-space:pre-wrap;word-break:break-word}pre{background:#181713;color:#f8f7f2;padding:1rem;border-radius:12px;overflow:auto}</style></head><body><main><h1>${escapeHtml(title)}</h1><section class="summary"><div class="card"><strong>Events</strong><br>${summary.total}</div><div class="card"><strong>Errors</strong><br>${summary.errors}</div><div class="card"><strong>Latest</strong><br>${summary.latestAt ? escapeHtml(new Date(summary.latestAt).toLocaleString()) : "never"}</div></section><table><thead><tr><th>At</th><th>Type</th><th>Action</th><th>Outcome</th><th>Payload</th></tr></thead><tbody>${rows}</tbody></table><h2>Markdown Export</h2><pre>${escapeHtml(markdown)}</pre></main></body></html>`;
};

export const buildVoiceAuditExport = (
  events: StoredVoiceAuditEvent[],
  options: {
    redact?: VoiceTraceRedactionConfig;
    title?: string;
  } = {},
) => {
  const exportEvents = options.redact
    ? redactVoiceAuditEvents(events, options.redact)
    : events;

  return {
    events: exportEvents,
    html: renderVoiceAuditHTML(events, options),
    markdown: renderVoiceAuditMarkdown(events, options),
    summary: summarizeVoiceAuditTrail(exportEvents),
  };
};
