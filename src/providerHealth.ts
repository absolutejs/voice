import { Elysia } from "elysia";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";

export type VoiceProviderHealthStatus =
  | "healthy"
  | "idle"
  | "rate-limited"
  | "degraded"
  | "recoverable"
  | "suppressed";

export type VoiceProviderHealthSummary<TProvider extends string = string> = {
  averageElapsedMs?: number;
  errorCount: number;
  fallbackCount: number;
  lastError?: string;
  lastErrorAt?: number;
  lastSuccessAt?: number;
  provider: TProvider;
  rateLimited: boolean;
  recommended: boolean;
  runCount: number;
  status: VoiceProviderHealthStatus;
  suppressionRemainingMs?: number;
  suppressedUntil?: number;
  timeoutCount: number;
};

export type VoiceProviderHealthSummaryOptions<
  TProvider extends string = string,
> = {
  events?: StoredVoiceTraceEvent[];
  now?: number;
  providers?: readonly TProvider[];
  store?: VoiceTraceEventStore;
};

export type VoiceProviderHealthHandlerOptions<
  TProvider extends string = string,
> = VoiceProviderHealthSummaryOptions<TProvider>;

export type VoiceProviderHealthHTMLHandlerOptions<
  TProvider extends string = string,
> = VoiceProviderHealthHandlerOptions<TProvider> & {
  headers?: HeadersInit;
  render?: (
    providers: VoiceProviderHealthSummary<TProvider>[],
  ) => string | Promise<string>;
};

export type VoiceProviderHealthRoutesOptions<
  TProvider extends string = string,
> = VoiceProviderHealthHTMLHandlerOptions<TProvider> & {
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

type ProviderEntry<TProvider extends string> =
  VoiceProviderHealthSummary<TProvider> & {
    elapsedCount: number;
    elapsedTotal: number;
  };

const getString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const isProviderStatus = (value: unknown) =>
  value === "success" || value === "fallback" || value === "error";

export const summarizeVoiceProviderHealth = async <
  TProvider extends string = string,
>(
  input: StoredVoiceTraceEvent[] | VoiceProviderHealthSummaryOptions<TProvider>,
): Promise<VoiceProviderHealthSummary<TProvider>[]> => {
  const options: VoiceProviderHealthSummaryOptions<TProvider> = Array.isArray(
    input,
  )
    ? { events: input }
    : input;
  const events = options.events ?? (await options.store?.list()) ?? [];
  const providers = options.providers ?? [];
  const providerSet = new Set<string>(providers);
  const now = options.now ?? Date.now();
  const entries = new Map<TProvider, ProviderEntry<TProvider>>();
  const isAllowedProvider = (value: unknown): value is TProvider =>
    typeof value === "string" &&
    (providerSet.size === 0 || providerSet.has(value));
  const getEntry = (provider: TProvider) => {
    const existing = entries.get(provider);
    if (existing) {
      return existing;
    }
    const entry: ProviderEntry<TProvider> = {
      elapsedCount: 0,
      elapsedTotal: 0,
      errorCount: 0,
      fallbackCount: 0,
      provider,
      rateLimited: false,
      recommended: false,
      runCount: 0,
      status: "idle",
      timeoutCount: 0,
    };
    entries.set(provider, entry);
    return entry;
  };

  for (const provider of providers) {
    getEntry(provider);
  }

  const hasProviderRouterEvents = events.some(
    (event) =>
      event.type === "session.error" &&
      isAllowedProvider(event.payload.provider) &&
      isProviderStatus(event.payload.providerStatus),
  );

  for (const event of events) {
    if (event.type === "assistant.run") {
      if (hasProviderRouterEvents) {
        continue;
      }
      const provider = event.payload.variantId;
      if (!isAllowedProvider(provider)) {
        continue;
      }
      const entry = getEntry(provider);
      entry.runCount += 1;
      const elapsedMs = getNumber(event.payload.elapsedMs);
      if (elapsedMs !== undefined) {
        entry.elapsedCount += 1;
        entry.elapsedTotal += elapsedMs;
      }
      continue;
    }

    if (event.type !== "session.error") {
      continue;
    }

    const provider = event.payload.provider;
    if (!isAllowedProvider(provider)) {
      continue;
    }
    const providerStatus = isProviderStatus(event.payload.providerStatus)
      ? event.payload.providerStatus
      : undefined;
    const applyProviderHealth = () => {
      const entry = getEntry(provider);
      const providerHealth = event.payload.providerHealth;
      if (providerHealth && typeof providerHealth === "object") {
        const suppressedUntil = getNumber(
          (providerHealth as Record<string, unknown>).suppressedUntil,
        );
        if (suppressedUntil !== undefined) {
          entry.suppressedUntil = suppressedUntil;
        }
      }
      const suppressedUntil = getNumber(event.payload.suppressedUntil);
      if (suppressedUntil !== undefined) {
        entry.suppressedUntil = suppressedUntil;
      }
      const suppressionRemainingMs = getNumber(
        event.payload.suppressionRemainingMs,
      );
      if (suppressionRemainingMs !== undefined) {
        entry.suppressionRemainingMs = suppressionRemainingMs;
      }
      return entry;
    };

    if (providerStatus === "success" || providerStatus === "fallback") {
      const entry = applyProviderHealth();
      entry.runCount += 1;
      entry.lastSuccessAt = event.at;
      if (providerStatus === "success") {
        entry.lastError = undefined;
        entry.rateLimited = false;
        entry.suppressedUntil = undefined;
        entry.suppressionRemainingMs = undefined;
      }
      const elapsedMs = getNumber(event.payload.elapsedMs);
      if (elapsedMs !== undefined) {
        entry.elapsedCount += 1;
        entry.elapsedTotal += elapsedMs;
      }
      const selectedProvider = event.payload.selectedProvider;
      if (
        providerStatus === "fallback" &&
        isAllowedProvider(selectedProvider) &&
        selectedProvider !== provider
      ) {
        getEntry(selectedProvider).fallbackCount += 1;
      }
      continue;
    }

    const entry = applyProviderHealth();
    entry.errorCount += 1;
    if (event.payload.timedOut === true) {
      entry.timeoutCount += 1;
    }
    entry.lastError = getString(event.payload.error);
    entry.lastErrorAt = event.at;
    entry.rateLimited ||= event.payload.rateLimited === true;
  }

  const summaries = [...entries.values()].map((entry) => {
    const hadSuppression =
      typeof entry.suppressedUntil === "number" ||
      typeof entry.suppressionRemainingMs === "number";
    const suppressionRemainingMs =
      typeof entry.suppressedUntil === "number"
        ? Math.max(0, entry.suppressedUntil - now)
        : entry.suppressionRemainingMs;
    const activeSuppression =
      typeof suppressionRemainingMs === "number" && suppressionRemainingMs > 0;
    const recoverable = hadSuppression && !activeSuppression;
    const averageElapsedMs =
      entry.elapsedCount > 0
        ? Math.round(entry.elapsedTotal / entry.elapsedCount)
        : undefined;
    const status: VoiceProviderHealthStatus = activeSuppression
      ? "suppressed"
      : recoverable
        ? "recoverable"
        : entry.rateLimited
          ? "rate-limited"
          : entry.errorCount > 0 &&
              (!entry.lastSuccessAt ||
                !entry.lastErrorAt ||
                entry.lastErrorAt > entry.lastSuccessAt)
            ? "degraded"
            : entry.runCount > 0
              ? "healthy"
              : "idle";

    return {
      averageElapsedMs,
      errorCount: entry.errorCount,
      fallbackCount: entry.fallbackCount,
      lastError: entry.lastError,
      lastErrorAt: entry.lastErrorAt,
      lastSuccessAt: entry.lastSuccessAt,
      provider: entry.provider,
      rateLimited: entry.rateLimited,
      recommended: false,
      runCount: entry.runCount,
      status,
      suppressionRemainingMs: activeSuppression
        ? suppressionRemainingMs
        : undefined,
      suppressedUntil: entry.suppressedUntil,
      timeoutCount: entry.timeoutCount,
    };
  });
  const recommended = summaries
    .filter((entry) => entry.status === "healthy")
    .sort(
      (left, right) =>
        (left.averageElapsedMs ?? Number.MAX_SAFE_INTEGER) -
        (right.averageElapsedMs ?? Number.MAX_SAFE_INTEGER),
    )[0];

  if (recommended) {
    recommended.recommended = true;
  }

  return summaries;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderVoiceProviderHealthHTML = (
  providers: VoiceProviderHealthSummary[],
) =>
  providers.length === 0
    ? '<p class="voice-provider-empty">No provider status yet.</p>'
    : [
        '<div class="voice-provider-health">',
        ...providers.map((provider) => {
          const suppressionSeconds =
            typeof provider.suppressionRemainingMs === "number"
              ? Math.ceil(provider.suppressionRemainingMs / 1000)
              : undefined;
          return [
            `<article class="voice-provider-card ${escapeHtml(provider.status)}">`,
            '<div class="voice-provider-card-header">',
            `<strong>${escapeHtml(provider.provider)}</strong>`,
            `<span>${escapeHtml(provider.status)}${provider.recommended ? " · recommended" : ""}</span>`,
            "</div>",
            "<dl>",
            `<div><dt>Runs</dt><dd>${String(provider.runCount)}</dd></div>`,
            `<div><dt>Avg latency</dt><dd>${String(provider.averageElapsedMs ?? 0)}ms</dd></div>`,
            `<div><dt>Errors</dt><dd>${String(provider.errorCount)}</dd></div>`,
            `<div><dt>Timeouts</dt><dd>${String(provider.timeoutCount)}</dd></div>`,
            `<div><dt>Fallbacks</dt><dd>${String(provider.fallbackCount)}</dd></div>`,
            "</dl>",
            suppressionSeconds
              ? `<p>Temporarily suppressed for ${String(suppressionSeconds)}s.</p>`
              : "",
            provider.lastError
              ? `<p>${escapeHtml(provider.lastError)}</p>`
              : "",
            "</article>",
          ].join("");
        }),
        "</div>",
      ].join("");

export const createVoiceProviderHealthJSONHandler =
  <TProvider extends string = string>(
    options: VoiceProviderHealthHandlerOptions<TProvider>,
  ) =>
  async () =>
    summarizeVoiceProviderHealth(options);

export const createVoiceProviderHealthHTMLHandler =
  <TProvider extends string = string>(
    options: VoiceProviderHealthHTMLHandlerOptions<TProvider>,
  ) =>
  async () => {
    const providers = await summarizeVoiceProviderHealth(options);
    const render = options.render ?? renderVoiceProviderHealthHTML;
    const body = await render(providers);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceProviderHealthRoutes = <
  TProvider extends string = string,
>(
  options: VoiceProviderHealthRoutesOptions<TProvider>,
) => {
  const path = options.path ?? "/api/provider-status";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-provider-health",
  }).get(path, createVoiceProviderHealthJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceProviderHealthHTMLHandler(options));
  }

  return routes;
};
