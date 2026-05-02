import { Elysia } from "elysia";
import {
  summarizeVoiceProviderHealth,
  type VoiceProviderHealthSummary,
} from "./providerHealth";
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from "./trace";
import type {
  VoiceIOProviderFailureSimulationMode,
  VoiceIOProviderFailureSimulationResult,
} from "./testing/ioProviderSimulator";

export type VoiceRoutingEventKind = "llm" | "stt" | "tts";

export type VoiceRoutingEvent = {
  at: number;
  attempt?: number;
  elapsedMs?: number;
  error?: string;
  fallbackProvider?: string;
  kind: VoiceRoutingEventKind;
  latencyBudgetMs?: number;
  operation?: string;
  profileId?: string;
  profileLabel?: string;
  provider?: string;
  providerRoutes?: Record<string, string>;
  routing?: string;
  scenarioId?: string;
  selectedProvider?: string;
  sessionId: string;
  status?: string;
  suppressionRemainingMs?: number;
  timedOut: boolean;
  turnId?: string;
};

export type VoiceRoutingDecisionSummary = VoiceRoutingEvent;

export type VoiceRoutingDecisionSummaryOptions = {
  kind?: VoiceRoutingEventKind;
  limit?: number;
  sessionId?: string;
  store: VoiceTraceEventStore;
};

export type VoiceRoutingKindSummary = {
  errorCount: number;
  fallbackCount: number;
  latest?: VoiceRoutingEvent;
  providers: string[];
  runCount: number;
  timeoutCount: number;
};

export type VoiceRoutingSessionSummary = {
  errorCount: number;
  eventCount: number;
  fallbackCount: number;
  kinds: Record<VoiceRoutingEventKind, VoiceRoutingKindSummary>;
  lastEventAt: number;
  sessionId: string;
  startedAt: number;
  status: "healthy" | "fallback" | "degraded";
  timeoutCount: number;
};

export type VoiceRoutingSessionSummaryOptions = {
  limit?: number;
  sessionId?: string;
};

export type VoiceResilienceLink = {
  href: string;
  label: string;
};

export type VoiceResilienceSimulationProvider<
  TProvider extends string = string,
> = {
  configured?: boolean;
  provider: TProvider;
};

export type VoiceResilienceIOSimulator<TProvider extends string = string> = {
  failureProviders?: readonly TProvider[];
  fallbackRequiredProvider?: TProvider;
  fallbackRequiredMessage?: string;
  failureMessage?: string;
  label?: string;
  pathPrefix?: string;
  providers: readonly VoiceResilienceSimulationProvider<TProvider>[];
  recoveryMessage?: string;
  run: (
    provider: TProvider,
    mode: VoiceIOProviderFailureSimulationMode,
  ) => Promise<VoiceIOProviderFailureSimulationResult<TProvider>>;
};

export type VoiceResiliencePageData = {
  links?: readonly VoiceResilienceLink[];
  llmProviderHealth: VoiceProviderHealthSummary<string>[];
  routingEvents: VoiceRoutingEvent[];
  routingSessions: VoiceRoutingSessionSummary[];
  sttProviderHealth: VoiceProviderHealthSummary<string>[];
  sttSimulation?: VoiceResilienceIOSimulator<string>;
  title?: string;
  ttsProviderHealth: VoiceProviderHealthSummary<string>[];
  ttsSimulation?: VoiceResilienceIOSimulator<string>;
};

export type VoiceResilienceRoutesOptions = {
  headers?: HeadersInit;
  links?: readonly VoiceResilienceLink[];
  llmProviders?: readonly string[];
  name?: string;
  path?: string;
  render?: (input: VoiceResiliencePageData) => string | Promise<string>;
  sttProviders?: readonly string[];
  sttSimulation?: VoiceResilienceIOSimulator<string>;
  store: VoiceTraceEventStore;
  title?: string;
  ttsProviders?: readonly string[];
  ttsSimulation?: VoiceResilienceIOSimulator<string>;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getBoolean = (value: unknown) => value === true;

const isProviderStatus = (value: unknown) =>
  value === "error" || value === "fallback" || value === "success";

export const listVoiceRoutingEvents = (
  events: StoredVoiceTraceEvent[],
): VoiceRoutingEvent[] => {
  const routingEvents: VoiceRoutingEvent[] = [];

  for (const event of events) {
    if (event.type !== "session.error") {
      continue;
    }

    const provider = getString(event.payload.provider);
    const providerStatus = isProviderStatus(event.payload.providerStatus)
      ? event.payload.providerStatus
      : undefined;
    if (!provider || !providerStatus) {
      continue;
    }

    const kind = getString(event.payload.kind);
    routingEvents.push({
      at: event.at,
      attempt: getNumber(event.payload.attempt),
      elapsedMs: getNumber(event.payload.elapsedMs),
      error: getString(event.payload.error),
      fallbackProvider: getString(event.payload.fallbackProvider),
      kind: kind === "stt" || kind === "tts" ? kind : "llm",
      latencyBudgetMs: getNumber(event.payload.latencyBudgetMs),
      operation: getString(event.payload.operation),
      provider,
      routing: getString(event.payload.routing),
      scenarioId: event.scenarioId,
      selectedProvider: getString(event.payload.selectedProvider),
      sessionId: event.sessionId,
      status: providerStatus,
      suppressionRemainingMs: getNumber(event.payload.suppressionRemainingMs),
      timedOut: getBoolean(event.payload.timedOut),
      turnId: event.turnId,
    });
  }

  return routingEvents.sort((left, right) => right.at - left.at);
};

export const summarizeVoiceRoutingDecision = (
  events: StoredVoiceTraceEvent[],
  options: Omit<VoiceRoutingDecisionSummaryOptions, "store"> = {},
): VoiceRoutingDecisionSummary | null => {
  const routingEvents = listVoiceRoutingEvents(events).filter((event) => {
    if (options.kind && event.kind !== options.kind) {
      return false;
    }
    if (options.sessionId && event.sessionId !== options.sessionId) {
      return false;
    }
    return true;
  });
  const limited =
    typeof options.limit === "number" && options.limit >= 0
      ? routingEvents.slice(0, options.limit)
      : routingEvents;

  return limited[0] ?? null;
};

const createEmptyKindSummary = (): VoiceRoutingKindSummary => ({
  errorCount: 0,
  fallbackCount: 0,
  providers: [],
  runCount: 0,
  timeoutCount: 0,
});

export const summarizeVoiceRoutingSessions = (
  events: StoredVoiceTraceEvent[] | VoiceRoutingEvent[],
  options: VoiceRoutingSessionSummaryOptions = {},
): VoiceRoutingSessionSummary[] => {
  const routingEvents = (
    events.some((event) => "payload" in event)
      ? listVoiceRoutingEvents(events as StoredVoiceTraceEvent[])
      : [...(events as VoiceRoutingEvent[])]
  ).filter(
    (event) => !options.sessionId || event.sessionId === options.sessionId,
  );
  const sessions = new Map<string, VoiceRoutingSessionSummary>();

  for (const event of routingEvents) {
    const existing = sessions.get(event.sessionId);
    const summary =
      existing ??
      ({
        errorCount: 0,
        eventCount: 0,
        fallbackCount: 0,
        kinds: {
          llm: createEmptyKindSummary(),
          stt: createEmptyKindSummary(),
          tts: createEmptyKindSummary(),
        },
        lastEventAt: event.at,
        sessionId: event.sessionId,
        startedAt: event.at,
        status: "healthy",
        timeoutCount: 0,
      } satisfies VoiceRoutingSessionSummary);

    summary.eventCount += 1;
    summary.startedAt = Math.min(summary.startedAt, event.at);
    summary.lastEventAt = Math.max(summary.lastEventAt, event.at);
    if (event.status === "error") {
      summary.errorCount += 1;
    }
    if (event.status === "fallback") {
      summary.fallbackCount += 1;
    }
    if (event.timedOut) {
      summary.timeoutCount += 1;
    }

    const kind = summary.kinds[event.kind];
    kind.runCount += 1;
    if (event.status === "error") {
      kind.errorCount += 1;
    }
    if (event.status === "fallback") {
      kind.fallbackCount += 1;
    }
    if (event.timedOut) {
      kind.timeoutCount += 1;
    }
    if (event.provider && !kind.providers.includes(event.provider)) {
      kind.providers.push(event.provider);
    }
    if (!kind.latest || event.at > kind.latest.at) {
      kind.latest = event;
    }

    summary.status =
      summary.errorCount > 0 || summary.timeoutCount > 0
        ? "degraded"
        : summary.fallbackCount > 0
          ? "fallback"
          : "healthy";
    sessions.set(event.sessionId, summary);
  }

  const sorted = [...sessions.values()].sort(
    (left, right) => right.lastEventAt - left.lastEventAt,
  );

  return typeof options.limit === "number" && options.limit >= 0
    ? sorted.slice(0, options.limit)
    : sorted;
};

export const createVoiceRoutingDecisionSummary = async (
  options: VoiceRoutingDecisionSummaryOptions,
): Promise<VoiceRoutingDecisionSummary | null> => {
  const events = await options.store.list({
    sessionId: options.sessionId,
    type: "session.error",
  });

  return summarizeVoiceRoutingDecision(events, options);
};

const summarizeRoutingEvents = (events: VoiceRoutingEvent[]) => {
  const byKind = new Map<string, number>();
  let errors = 0;
  let fallbacks = 0;
  let timeouts = 0;

  for (const event of events) {
    byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    if (event.status === "error") {
      errors += 1;
    }
    if (event.status === "fallback") {
      fallbacks += 1;
    }
    if (event.timedOut) {
      timeouts += 1;
    }
  }

  return {
    byKind,
    errors,
    fallbacks,
    timeouts,
    total: events.length,
  };
};

const renderProviderCards = (
  title: string,
  providers: VoiceProviderHealthSummary<string>[],
) => {
  if (providers.length === 0) {
    return `<p class="muted">No ${escapeHtml(title)} provider health yet.</p>`;
  }

  return `<div class="provider-grid">${providers
    .map(
      (provider) => `
        <article class="card provider ${escapeHtml(provider.status)}">
          <div class="card-header">
            <strong>${escapeHtml(provider.provider)}</strong>
            <span>${escapeHtml(provider.status)}${provider.recommended ? " · recommended" : ""}</span>
          </div>
          <dl>
            <div><dt>Runs</dt><dd>${provider.runCount}</dd></div>
            <div><dt>Avg latency</dt><dd>${provider.averageElapsedMs ?? 0}ms</dd></div>
            <div><dt>Errors</dt><dd>${provider.errorCount}</dd></div>
            <div><dt>Timeouts</dt><dd>${provider.timeoutCount}</dd></div>
            <div><dt>Fallbacks</dt><dd>${provider.fallbackCount}</dd></div>
          </dl>
          ${provider.lastError ? `<p class="muted">${escapeHtml(provider.lastError)}</p>` : ""}
        </article>
      `,
    )
    .join("")}</div>`;
};

const renderTimeline = (events: VoiceRoutingEvent[]) => {
  if (events.length === 0) {
    return '<p class="muted">No provider routing events yet. Run the app or simulate provider failover.</p>';
  }

  return `<div class="timeline">${events
    .slice(0, 40)
    .map(
      (event) => `
        <article class="card event ${escapeHtml(event.status ?? "unknown")}">
          <div class="card-header">
            <strong>${escapeHtml(event.kind.toUpperCase())} ${escapeHtml(event.operation ?? "generate")}</strong>
            <span>${new Date(event.at).toLocaleString()}</span>
          </div>
          <p>
            <span class="pill">${escapeHtml(event.status ?? "unknown")}</span>
            <span class="pill">provider: ${escapeHtml(event.provider ?? "unknown")}</span>
            ${
              event.fallbackProvider
                ? `<span class="pill">fallback: ${escapeHtml(event.fallbackProvider)}</span>`
                : ""
            }
            ${event.timedOut ? '<span class="pill danger">timed out</span>' : ""}
          </p>
          <dl>
            <div><dt>Attempt</dt><dd>${event.attempt ?? 0}</dd></div>
            <div><dt>Elapsed</dt><dd>${event.elapsedMs ?? 0}ms</dd></div>
            <div><dt>Budget</dt><dd>${event.latencyBudgetMs ?? 0}ms</dd></div>
            <div><dt>Session</dt><dd>${escapeHtml(event.sessionId)}</dd></div>
          </dl>
          ${event.error ? `<p class="muted">${escapeHtml(event.error)}</p>` : ""}
        </article>
      `,
    )
    .join("")}</div>`;
};

const renderSessionKind = (
  kind: VoiceRoutingEventKind,
  summary: VoiceRoutingKindSummary,
) => {
  const latest = summary.latest;
  const provider = latest?.provider ?? summary.providers[0] ?? "none";
  const status = latest?.status ?? "idle";
  const fallback =
    latest?.fallbackProvider && latest.fallbackProvider !== provider
      ? ` -> ${latest.fallbackProvider}`
      : "";

  return `<div>
    <dt>${escapeHtml(kind.toUpperCase())}</dt>
    <dd>${escapeHtml(provider)}${escapeHtml(fallback)}</dd>
    <small>${escapeHtml(status)} · ${summary.runCount} event${summary.runCount === 1 ? "" : "s"} · ${summary.errorCount} error${summary.errorCount === 1 ? "" : "s"} · ${summary.fallbackCount} fallback${summary.fallbackCount === 1 ? "" : "s"}</small>
  </div>`;
};

const renderSessionSummaries = (sessions: VoiceRoutingSessionSummary[]) => {
  if (sessions.length === 0) {
    return '<p class="muted">No call-level routing summaries yet. Run a voice session or provider simulation.</p>';
  }

  return `<div class="session-grid">${sessions
    .slice(0, 12)
    .map(
      (session) => `
        <article class="card session ${escapeHtml(session.status)}">
          <div class="card-header">
            <strong>${escapeHtml(session.sessionId)}</strong>
            <span>${escapeHtml(session.status)}</span>
          </div>
          <p>
            <span class="pill">${session.eventCount} routing events</span>
            <span class="pill">${session.fallbackCount} fallbacks</span>
            <span class="pill">${session.errorCount} errors</span>
            <span class="pill">${session.timeoutCount} timeouts</span>
          </p>
          <dl>
            ${renderSessionKind("llm", session.kinds.llm)}
            ${renderSessionKind("stt", session.kinds.stt)}
            ${renderSessionKind("tts", session.kinds.tts)}
          </dl>
        </article>
      `,
    )
    .join("")}</div>`;
};

const renderSimulationControls = (
  kind: "stt" | "tts",
  simulation: VoiceResilienceIOSimulator<string> | undefined,
) => {
  if (!simulation) {
    return "";
  }

  const configuredProviders = simulation.providers.filter(
    (provider) => provider.configured !== false,
  );
  if (configuredProviders.length === 0) {
    return `<p class="muted">No ${kind.toUpperCase()} providers are configured for simulation.</p>`;
  }

  const pathPrefix = simulation.pathPrefix ?? `/api/${kind}-simulate`;
  const failureProviders =
    simulation.failureProviders ??
    configuredProviders.map(({ provider }) => provider);
  const canFail = (provider: string) =>
    configuredProviders.some((entry) => entry.provider === provider) &&
    (!simulation.fallbackRequiredProvider ||
      configuredProviders.some(
        (entry) => entry.provider === simulation.fallbackRequiredProvider,
      ));

  return `<div class="simulate-panel" data-sim-kind="${kind}" data-sim-prefix="${escapeHtml(pathPrefix)}">
    <p class="muted">${escapeHtml(simulation.failureMessage ?? `Simulate ${kind.toUpperCase()} provider failure without changing provider credentials.`)}</p>
    <div class="simulate-actions">
      ${failureProviders
        .map(
          (provider) =>
            `<button type="button" data-provider-fail="${escapeHtml(provider)}"${canFail(provider) ? "" : " disabled"}>Simulate ${escapeHtml(provider)} ${kind.toUpperCase()} failure</button>`,
        )
        .join("")}
      ${configuredProviders
        .map(
          (provider) =>
            `<button type="button" data-provider-recover="${escapeHtml(provider.provider)}">Mark ${escapeHtml(provider.provider)} recovered</button>`,
        )
        .join("")}
    </div>
    ${
      simulation.fallbackRequiredProvider &&
      !configuredProviders.some(
        (entry) => entry.provider === simulation.fallbackRequiredProvider,
      )
        ? `<p class="muted">${escapeHtml(simulation.fallbackRequiredMessage ?? `Configure ${simulation.fallbackRequiredProvider} to enable fallback simulation.`)}</p>`
        : ""
    }
    <pre class="simulate-output" hidden></pre>
  </div>`;
};

export const renderVoiceResilienceHTML = (input: VoiceResiliencePageData) => {
  const summary = summarizeRoutingEvents(input.routingEvents);
  const kindCounts = [...summary.byKind.entries()]
    .map(
      ([kind, count]) =>
        `<span class="pill">${escapeHtml(kind)}: ${String(count)}</span>`,
    )
    .join("");
  const links = input.links?.length
    ? input.links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join(" · ")
    : "";
  const snippet =
    escapeHtml(`const sttSimulator = createVoiceIOProviderFailureSimulator({
	kind: 'stt',
	providers: ['deepgram', 'assemblyai'],
	fallback: ['deepgram', 'assemblyai'],
	onProviderEvent: async (event, input) => {
		await traceStore.append({
			at: event.at,
			payload: { ...event, providerStatus: event.status },
			sessionId: input.sessionId,
			type: 'session.error'
		});
	}
});

app.use(
	createVoiceResilienceRoutes({
		store: traceStore,
		sttProviders: ['deepgram', 'assemblyai'],
		sttSimulation: {
			failureProviders: ['deepgram'],
			fallbackRequiredProvider: 'assemblyai',
			providers: [{ provider: 'deepgram' }, { provider: 'assemblyai' }],
			run: sttSimulator.run
		}
	})
);

app.use(
	createVoiceProductionReadinessRoutes({
		links: { resilience: '/resilience' },
		store: traceStore
	})
);`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title ?? "AbsoluteJS Voice Resilience")}</title>
  <style>
    :root { color-scheme: dark; }
    body { background: radial-gradient(circle at top left, #172554, #09090b 36%, #050505); color: #f4f4f5; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    main { display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; }
    section, .card { background: rgba(19, 22, 27, 0.92); border: 1px solid #27272a; border-radius: 20px; padding: 20px; }
    .hero { background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(245, 158, 11, 0.12)); }
    .grid, .provider-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .session-grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .timeline { display: grid; gap: 12px; }
    .card-header { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .card-header strong { font-size: 1.05rem; }
    .metric strong { display: block; font-size: 2rem; margin-top: 6px; }
    .muted, dt, span { color: #a1a1aa; }
    dl { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    dl div { background: #0f1217; border: 1px solid #27272a; border-radius: 12px; padding: 10px; }
    dd { font-weight: 800; margin: 4px 0 0; }
    .pill { background: #0f1217; border: 1px solid #3f3f46; border-radius: 999px; color: #d4d4d8; display: inline-flex; margin: 3px 4px 3px 0; padding: 5px 9px; }
    .danger { border-color: rgba(239, 68, 68, 0.75); color: #fecaca; }
    .event.error { border-color: rgba(239, 68, 68, 0.7); }
    .event.fallback, .session.fallback { border-color: rgba(245, 158, 11, 0.7); }
    .event.success, .provider.healthy, .session.healthy { border-color: rgba(34, 197, 94, 0.5); }
    .session.degraded { border-color: rgba(239, 68, 68, 0.7); }
    .provider.suppressed, .provider.degraded, .provider.rate-limited { border-color: rgba(239, 68, 68, 0.7); }
    .provider.recoverable { border-color: rgba(59, 130, 246, 0.7); }
    button { background: #f59e0b; border: 0; border-radius: 999px; color: #111827; cursor: pointer; font-weight: 800; padding: 10px 14px; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    .simulate-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .simulate-output { background: #050505; border: 1px solid #27272a; border-radius: 14px; color: #d4d4d8; overflow: auto; padding: 12px; white-space: pre-wrap; }
    .primitive { border-color: rgba(245, 158, 11, 0.45); }
    .primitive pre { background: #050505; border: 1px solid #27272a; border-radius: 14px; color: #fef3c7; overflow: auto; padding: 14px; }
    .primitive code { color: #fef3c7; }
    a { color: #f59e0b; }
    @media (max-width: 850px) { .grid, .provider-grid, .session-grid, dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Provider routing and resilience</h1>
      <p>One view for the production reliability story: LLM failover, STT/TTS routing, latency budgets, timeouts, and fallback decisions.</p>
      ${links ? `<p>${links}</p>` : ""}
      <p>${kindCounts || '<span class="pill">No routing events yet</span>'}</p>
    </section>
    <section class="primitive">
      <p class="muted">Copy into your app</p>
      <h2><code>createVoiceResilienceRoutes(...)</code> builds this failover proof surface</h2>
      <p class="muted">Mount one route group for provider health, routing traces, and failure simulation. Feed the same trace store into production readiness so unresolved provider errors fail the deploy gate while recovered fallback stays visible.</p>
      <pre><code>${snippet}</code></pre>
    </section>
    <section class="grid">
      <article class="card metric"><span>Total routing events</span><strong>${summary.total}</strong></article>
      <article class="card metric"><span>Fallbacks</span><strong>${summary.fallbacks}</strong></article>
      <article class="card metric"><span>Errors</span><strong>${summary.errors}</strong></article>
      <article class="card metric"><span>Timeouts</span><strong>${summary.timeouts}</strong></article>
    </section>
    <section>
      <h2>Call-level routing summaries</h2>
      <p class="muted">A compact per-call view of which LLM, STT, and TTS providers handled the session, including fallback and timeout counts.</p>
      ${renderSessionSummaries(input.routingSessions)}
    </section>
    <section>
      <h2>LLM provider health</h2>
      ${renderProviderCards("LLM", input.llmProviderHealth)}
    </section>
    <section>
      <h2>STT provider health</h2>
      ${renderSimulationControls("stt", input.sttSimulation)}
      ${renderProviderCards("STT", input.sttProviderHealth)}
    </section>
    <section>
      <h2>TTS provider health</h2>
      ${renderSimulationControls("tts", input.ttsSimulation)}
      ${renderProviderCards("TTS", input.ttsProviderHealth)}
    </section>
    <section>
      <h2>Routing timeline</h2>
      ${renderTimeline(input.routingEvents)}
    </section>
  </main>
  <script>
    const showResult = (panel, result) => {
      const output = panel.querySelector(".simulate-output");
      if (!output) return;
      output.hidden = false;
      output.textContent = JSON.stringify(result, null, 2);
    };
    document.querySelectorAll("[data-sim-prefix]").forEach((panel) => {
      const prefix = panel.getAttribute("data-sim-prefix");
      panel.querySelectorAll("[data-provider-fail]").forEach((button) => {
        button.addEventListener("click", async () => {
          const provider = button.getAttribute("data-provider-fail");
          const response = await fetch(prefix + "/failure?provider=" + encodeURIComponent(provider || ""), { method: "POST" });
          showResult(panel, await response.json());
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });
      });
      panel.querySelectorAll("[data-provider-recover]").forEach((button) => {
        button.addEventListener("click", async () => {
          const provider = button.getAttribute("data-provider-recover");
          const response = await fetch(prefix + "/recovery?provider=" + encodeURIComponent(provider || ""), { method: "POST" });
          showResult(panel, await response.json());
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });
      });
    });
  </script>
</body>
</html>`;
};

const providerFromQuery = <TProvider extends string>(
  value: unknown,
  providers: readonly VoiceResilienceSimulationProvider<TProvider>[],
): TProvider | undefined =>
  typeof value === "string" &&
  providers.some(
    (provider) => provider.provider === value && provider.configured !== false,
  )
    ? (value as TProvider)
    : undefined;

const registerSimulationRoutes = <TProvider extends string>(
  routes: Elysia,
  simulation: VoiceResilienceIOSimulator<TProvider> | undefined,
  defaultPathPrefix: string,
) => {
  if (!simulation) {
    return routes;
  }

  const pathPrefix = simulation.pathPrefix ?? defaultPathPrefix;
  routes.post(`${pathPrefix}/failure`, async ({ query, set }) => {
    const provider = providerFromQuery(query.provider, simulation.providers);
    if (!provider) {
      set.status = 400;
      return {
        error: "Provider is not configured for simulation.",
      };
    }
    if (
      simulation.failureProviders &&
      !simulation.failureProviders.includes(provider)
    ) {
      set.status = 400;
      return {
        error: `${provider} is not configured for failure simulation.`,
      };
    }
    if (
      simulation.fallbackRequiredProvider &&
      !simulation.providers.some(
        (entry) =>
          entry.provider === simulation.fallbackRequiredProvider &&
          entry.configured !== false,
      )
    ) {
      set.status = 400;
      return {
        error:
          simulation.fallbackRequiredMessage ??
          `Configure ${simulation.fallbackRequiredProvider} before simulating fallback.`,
      };
    }

    return simulation.run(provider, "failure");
  });
  routes.post(`${pathPrefix}/recovery`, async ({ query, set }) => {
    const provider = providerFromQuery(query.provider, simulation.providers);
    if (!provider) {
      set.status = 400;
      return {
        error: "Provider is not configured for simulation.",
      };
    }

    return simulation.run(provider, "recovery");
  });

  return routes;
};

export const createVoiceResilienceRoutes = (
  options: VoiceResilienceRoutesOptions,
) => {
  const path = options.path ?? "/resilience";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-resilience",
  }).get(path, async () => {
    const events = await options.store.list();
    const sttEvents = events.filter((event) => event.payload.kind === "stt");
    const ttsEvents = events.filter((event) => event.payload.kind === "tts");
    const routingEvents = listVoiceRoutingEvents(events);
    const data: VoiceResiliencePageData = {
      links: options.links,
      llmProviderHealth: await summarizeVoiceProviderHealth({
        events,
        providers: options.llmProviders ?? [],
      }),
      routingEvents,
      routingSessions: summarizeVoiceRoutingSessions(routingEvents),
      sttProviderHealth: await summarizeVoiceProviderHealth({
        events: sttEvents,
        providers: options.sttProviders ?? [],
      }),
      sttSimulation: options.sttSimulation,
      title: options.title,
      ttsProviderHealth: await summarizeVoiceProviderHealth({
        events: ttsEvents,
        providers: options.ttsProviders ?? [],
      }),
      ttsSimulation: options.ttsSimulation,
    };
    const body = await (options.render ?? renderVoiceResilienceHTML)(data);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  });

  registerSimulationRoutes(routes, options.sttSimulation, "/api/stt-simulate");
  registerSimulationRoutes(routes, options.ttsSimulation, "/api/tts-simulate");

  return routes;
};
