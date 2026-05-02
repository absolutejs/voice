import { Elysia } from "elysia";
import {
  summarizeVoiceProviderHealth,
  type VoiceProviderHealthStatus,
  type VoiceProviderHealthSummary,
  type VoiceProviderHealthSummaryOptions,
} from "./providerHealth";

export type VoiceProviderCapabilityKind = "llm" | "stt" | "tts" | "custom";

export type VoiceProviderCapabilityDefinition<
  TProvider extends string = string,
> = {
  configured?: boolean;
  description?: string;
  features?: string[];
  kind: VoiceProviderCapabilityKind;
  label?: string;
  model?: string;
  provider: TProvider;
  selected?: boolean;
};

export type VoiceProviderCapabilitySummary<TProvider extends string = string> =
  VoiceProviderCapabilityDefinition<TProvider> & {
    configured: boolean;
    health?: VoiceProviderHealthSummary<TProvider>;
    status: VoiceProviderHealthStatus | "selected" | "unconfigured";
  };

export type VoiceProviderCapabilityReport<TProvider extends string = string> = {
  capabilities: VoiceProviderCapabilitySummary<TProvider>[];
  checkedAt: number;
  configured: number;
  selected: number;
  total: number;
  unconfigured: number;
};

export type VoiceProviderCapabilityOptions<TProvider extends string = string> =
  VoiceProviderHealthSummaryOptions<TProvider> & {
    features?: Partial<Record<TProvider, string[]>>;
    llmProviders?: readonly TProvider[];
    models?: Partial<Record<TProvider, string>>;
    providers?: readonly VoiceProviderCapabilityDefinition<TProvider>[];
    selected?: Partial<Record<VoiceProviderCapabilityKind, TProvider>>;
    sttProviders?: readonly TProvider[];
    ttsProviders?: readonly TProvider[];
  };

export type VoiceProviderCapabilityHandlerOptions<
  TProvider extends string = string,
> = VoiceProviderCapabilityOptions<TProvider>;

export type VoiceProviderCapabilityHTMLHandlerOptions<
  TProvider extends string = string,
> = VoiceProviderCapabilityHandlerOptions<TProvider> & {
  headers?: HeadersInit;
  render?: (
    report: VoiceProviderCapabilityReport<TProvider>,
  ) => string | Promise<string>;
  title?: string;
};

export type VoiceProviderCapabilityRoutesOptions<
  TProvider extends string = string,
> = VoiceProviderCapabilityHTMLHandlerOptions<TProvider> & {
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

const fromProviderList = <TProvider extends string>(
  kind: VoiceProviderCapabilityKind,
  providers: readonly TProvider[] | undefined,
  options: VoiceProviderCapabilityOptions<TProvider>,
): VoiceProviderCapabilityDefinition<TProvider>[] =>
  (providers ?? []).map((provider) => ({
    configured: true,
    features: options.features?.[provider],
    kind,
    model: options.models?.[provider],
    provider,
    selected: options.selected?.[kind] === provider,
  }));

const resolveCapabilityDefinitions = <TProvider extends string>(
  options: VoiceProviderCapabilityOptions<TProvider>,
) => {
  const definitions = [
    ...fromProviderList("llm", options.llmProviders, options),
    ...fromProviderList("stt", options.sttProviders, options),
    ...fromProviderList("tts", options.ttsProviders, options),
    ...(options.providers ?? []),
  ];
  const seen = new Set<string>();

  return definitions.filter((definition) => {
    const key = `${definition.kind}:${definition.provider}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const summarizeVoiceProviderCapabilities = async <
  TProvider extends string = string,
>(
  options: VoiceProviderCapabilityOptions<TProvider>,
): Promise<VoiceProviderCapabilityReport<TProvider>> => {
  const definitions = resolveCapabilityDefinitions(options);
  const providerNames = [
    ...new Set(definitions.map((entry) => entry.provider)),
  ];
  const health = await summarizeVoiceProviderHealth<TProvider>({
    events: options.events,
    now: options.now,
    providers: providerNames,
    store: options.store,
  });
  const healthByProvider = new Map(
    health.map((entry) => [entry.provider, entry]),
  );
  const capabilities = definitions.map((definition) => {
    const configured = definition.configured !== false;
    const providerHealth = healthByProvider.get(definition.provider);
    const selected =
      definition.selected === true ||
      options.selected?.[definition.kind] === definition.provider;
    const status: VoiceProviderCapabilitySummary<TProvider>["status"] =
      !configured
        ? "unconfigured"
        : selected
          ? "selected"
          : (providerHealth?.status ?? "idle");

    return {
      ...definition,
      configured,
      features: definition.features ?? options.features?.[definition.provider],
      health: providerHealth,
      model: definition.model ?? options.models?.[definition.provider],
      selected,
      status,
    };
  });

  return {
    capabilities,
    checkedAt: Date.now(),
    configured: capabilities.filter((entry) => entry.configured).length,
    selected: capabilities.filter((entry) => entry.selected).length,
    total: capabilities.length,
    unconfigured: capabilities.filter((entry) => !entry.configured).length,
  };
};

export const renderVoiceProviderCapabilityHTML = <
  TProvider extends string = string,
>(
  report: VoiceProviderCapabilityReport<TProvider>,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Provider Capabilities";
  const cards = report.capabilities
    .map((capability) => {
      const features = (capability.features ?? [])
        .map((feature) => `<span class="pill">${escapeHtml(feature)}</span>`)
        .join("");
      return `<article class="card ${escapeHtml(capability.status)}">
  <div class="card-header">
    <div>
      <p class="eyebrow">${escapeHtml(capability.kind)}</p>
      <h2>${escapeHtml(capability.label ?? capability.provider)}</h2>
    </div>
    <strong>${escapeHtml(capability.status)}</strong>
  </div>
  ${capability.description ? `<p>${escapeHtml(capability.description)}</p>` : ""}
  <dl>
    <div><dt>Configured</dt><dd>${capability.configured ? "yes" : "no"}</dd></div>
    <div><dt>Selected</dt><dd>${capability.selected ? "yes" : "no"}</dd></div>
    <div><dt>Model</dt><dd>${escapeHtml(capability.model ?? "default")}</dd></div>
    <div><dt>Runs</dt><dd>${String(capability.health?.runCount ?? 0)}</dd></div>
    <div><dt>Errors</dt><dd>${String(capability.health?.errorCount ?? 0)}</dd></div>
  </dl>
  ${features ? `<div class="features">${features}</div>` : ""}
</article>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#101316;color:#f6f2e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.card{background:#181d22;border:1px solid #2a323a;border-radius:20px;margin-bottom:16px;padding:20px}.hero{background:linear-gradient(135deg,rgba(14,165,233,.16),rgba(34,197,94,.12))}.eyebrow{color:#7dd3fc;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0 1rem}.summary,.features{display:flex;flex-wrap:wrap;gap:10px}.pill{background:#0f1217;border:1px solid #3f3f46;border-radius:999px;padding:7px 10px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.card-header{align-items:flex-start;display:flex;gap:16px;justify-content:space-between}.selected,.healthy{color:#86efac}.unconfigured,.degraded,.rate-limited,.suppressed{color:#fca5a5}.idle,.recoverable{color:#fde68a}dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}dt{color:#a8b0b8;font-size:.8rem}dd{margin:0}@media(max-width:800px){main{padding:18px}.card-header{display:block}}</style></head><body><main><section class="hero"><p class="eyebrow">Provider Discovery</p><h1>${escapeHtml(title)}</h1><div class="summary"><span class="pill">${String(report.configured)} configured</span><span class="pill">${String(report.selected)} selected</span><span class="pill">${String(report.unconfigured)} missing</span><span class="pill">${String(report.total)} total</span></div></section><section class="grid">${cards || '<article class="card"><p>No provider capabilities configured.</p></article>'}</section></main></body></html>`;
};

export const createVoiceProviderCapabilityJSONHandler =
  <TProvider extends string = string>(
    options: VoiceProviderCapabilityHandlerOptions<TProvider>,
  ) =>
  async () =>
    summarizeVoiceProviderCapabilities(options);

export const createVoiceProviderCapabilityHTMLHandler =
  <TProvider extends string = string>(
    options: VoiceProviderCapabilityHTMLHandlerOptions<TProvider>,
  ) =>
  async () => {
    const report = await summarizeVoiceProviderCapabilities(options);
    const render =
      options.render ??
      ((input) => renderVoiceProviderCapabilityHTML(input, options));
    const body = await render(report);

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...options.headers,
      },
    });
  };

export const createVoiceProviderCapabilityRoutes = <
  TProvider extends string = string,
>(
  options: VoiceProviderCapabilityRoutesOptions<TProvider>,
) => {
  const path = options.path ?? "/api/provider-capabilities";
  const htmlPath =
    options.htmlPath === undefined ? `${path}/htmx` : options.htmlPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-provider-capabilities",
  }).get(path, createVoiceProviderCapabilityJSONHandler(options));

  if (htmlPath) {
    routes.get(htmlPath, createVoiceProviderCapabilityHTMLHandler(options));
  }

  return routes;
};
