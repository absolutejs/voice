import { Elysia } from "elysia";
import {
  summarizeVoiceAssistantRuns,
  type VoiceAssistantRunsSummary,
} from "./assistant";
import {
  renderVoiceProviderHealthHTML,
  summarizeVoiceProviderHealth,
  type VoiceProviderHealthSummary,
} from "./providerHealth";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";

export type VoiceAssistantHealthFailure = {
  at: number;
  assistantId?: string;
  error?: string;
  provider?: string;
  rateLimited?: boolean;
  replayHref?: string;
  sessionId: string;
  status?: string;
  turnId?: string;
  type: StoredVoiceTraceEvent["type"];
};

export type VoiceAssistantHealthSummary<TProvider extends string = string> = {
  assistantRuns: VoiceAssistantRunsSummary;
  providerHealth: VoiceProviderHealthSummary<TProvider>[];
  recentFailures: VoiceAssistantHealthFailure[];
};

export type VoiceAssistantHealthSummaryOptions<
  TProvider extends string = string,
> = {
  events?: StoredVoiceTraceEvent[];
  maxFailures?: number;
  providers?: readonly TProvider[];
  replayHref?:
    | false
    | string
    | ((failure: Omit<VoiceAssistantHealthFailure, "replayHref">) => string);
  store?: VoiceTraceEventStore;
};

export type VoiceAssistantHealthHTMLHandlerOptions<
  TProvider extends string = string,
> = VoiceAssistantHealthSummaryOptions<TProvider> & {
  headers?: HeadersInit;
  render?: (
    summary: VoiceAssistantHealthSummary<TProvider>,
  ) => string | Promise<string>;
};

export type VoiceAssistantHealthRoutesOptions<
  TProvider extends string = string,
> = VoiceAssistantHealthHTMLHandlerOptions<TProvider> & {
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderCountMap = (values: Record<string, number>) => {
  const entries = Object.entries(values).sort(
    (left, right) => right[1] - left[1],
  );

  if (entries.length === 0) {
    return '<p class="voice-assistant-health-empty">No data yet.</p>';
  }

  return [
    '<div class="voice-assistant-health-metrics">',
    ...entries.map(
      ([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><strong>${String(value)}</strong></div>`,
    ),
    "</div>",
  ].join("");
};

const getString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getRecentFailures = (
  events: StoredVoiceTraceEvent[],
  maxFailures: number,
  replayHref: VoiceAssistantHealthSummaryOptions["replayHref"],
): VoiceAssistantHealthFailure[] =>
  events
    .filter(
      (event) =>
        (event.type === "session.error" &&
          (event.payload.providerStatus === "error" ||
            typeof event.payload.error === "string")) ||
        (event.type === "assistant.guardrail" &&
          event.payload.action === "blocked"),
    )
    .toReversed()
    .slice(0, maxFailures)
    .map((event) => {
      const failure: Omit<VoiceAssistantHealthFailure, "replayHref"> = {
        at: event.at,
        assistantId: getString(event.payload.assistantId),
        error: getString(event.payload.error),
        provider: getString(event.payload.provider),
        rateLimited: event.payload.rateLimited === true ? true : undefined,
        sessionId: event.sessionId,
        status: getString(event.payload.providerStatus),
        turnId: event.turnId,
        type: event.type,
      };
      const href =
        replayHref === false
          ? undefined
          : typeof replayHref === "function"
            ? replayHref(failure)
            : `${replayHref ?? "/api/voice-sessions"}/${encodeURIComponent(event.sessionId)}/replay/htmx`;

      return {
        ...failure,
        replayHref: href,
      };
    });

export const summarizeVoiceAssistantHealth = async <
  TProvider extends string = string,
>(
  options: VoiceAssistantHealthSummaryOptions<TProvider>,
): Promise<VoiceAssistantHealthSummary<TProvider>> => {
  const events = options.events ?? (await options.store?.list()) ?? [];

  return {
    assistantRuns: await summarizeVoiceAssistantRuns({ events }),
    providerHealth: await summarizeVoiceProviderHealth({
      events,
      providers: options.providers,
    }),
    recentFailures: getRecentFailures(
      events,
      options.maxFailures ?? 8,
      options.replayHref,
    ),
  };
};

export const renderVoiceAssistantHealthHTML = <
  TProvider extends string = string,
>(
  summary: VoiceAssistantHealthSummary<TProvider>,
) => {
  const assistant = summary.assistantRuns.assistants[0];
  const failures = summary.recentFailures;

  return [
    '<div class="voice-assistant-health">',
    '<section class="voice-assistant-health-grid">',
    `<article><span>Runs</span><strong>${String(assistant?.runCount ?? 0)}</strong></article>`,
    `<article><span>Sessions</span><strong>${String(assistant?.sessions ?? 0)}</strong></article>`,
    `<article><span>Guardrails</span><strong>${String(assistant?.guardrailCount ?? 0)}</strong></article>`,
    `<article><span>Avg latency</span><strong>${String(assistant?.averageElapsedMs ?? 0)}ms</strong></article>`,
    "</section>",
    "<section>",
    "<h3>Provider Health</h3>",
    renderVoiceProviderHealthHTML(summary.providerHealth),
    "</section>",
    '<section class="voice-assistant-health-columns">',
    `<article><h3>Outcomes</h3>${renderCountMap(assistant?.outcomes ?? {})}</article>`,
    `<article><h3>Variants</h3>${renderCountMap(assistant?.variants ?? {})}</article>`,
    `<article><h3>Tools</h3>${renderCountMap(assistant?.toolCalls ?? {})}</article>`,
    `<article><h3>Artifact Plans</h3>${renderCountMap(assistant?.artifactPlans ?? {})}</article>`,
    "</section>",
    "<section>",
    "<h3>Recent Failures</h3>",
    failures.length === 0
      ? '<p class="voice-assistant-health-empty">No failures yet.</p>'
      : [
          '<div class="voice-assistant-health-failures">',
          ...failures.map((failure) =>
            [
              "<article>",
              `<strong>${escapeHtml(failure.provider ?? failure.assistantId ?? failure.type)}</strong>`,
              `<span>${escapeHtml(failure.status ?? (failure.rateLimited ? "rate-limited" : "error"))}</span>`,
              failure.error ? `<p>${escapeHtml(failure.error)}</p>` : "",
              `<small>${escapeHtml(failure.sessionId)}${failure.turnId ? ` / ${escapeHtml(failure.turnId)}` : ""}</small>`,
              failure.replayHref
                ? `<p><a href="${escapeHtml(failure.replayHref)}">Open replay</a></p>`
                : "",
              "</article>",
            ].join(""),
          ),
          "</div>",
        ].join(""),
    "</section>",
    "</div>",
  ].join("");
};

export const createVoiceAssistantHealthJSONHandler =
  <TProvider extends string = string>(
    options: VoiceAssistantHealthSummaryOptions<TProvider>,
  ) =>
  async () =>
    summarizeVoiceAssistantHealth(options);

export const createVoiceAssistantHealthHTMLHandler =
  <TProvider extends string = string>(
    options: VoiceAssistantHealthHTMLHandlerOptions<TProvider>,
  ) =>
  async () => {
    const summary = await summarizeVoiceAssistantHealth(options);
    const render = options.render ?? renderVoiceAssistantHealthHTML;
    const body = await render(summary);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceAssistantHealthRoutes = <
  TProvider extends string = string,
>(
  options: VoiceAssistantHealthRoutesOptions<TProvider>,
) => {
  const path = options.path ?? "/api/assistant-health";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-assistant-health",
  }).get(path, createVoiceAssistantHealthJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceAssistantHealthHTMLHandler(options));
  }

  return routes;
};
