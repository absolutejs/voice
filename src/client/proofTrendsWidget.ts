import {
  formatVoiceProofTrendAge,
  type VoiceProofTrendReport,
} from "../proofTrends";
import {
  createVoiceProofTrendsStore,
  type VoiceProofTrendsClientOptions,
  type VoiceProofTrendsSnapshot,
} from "./proofTrends";

export type VoiceProofTrendsMetricView = {
  label: string;
  value: string;
};

export type VoiceProofTrendsViewModel = {
  description: string;
  error: string | null;
  isLoading: boolean;
  label: string;
  links: Array<{ href: string; label: string }>;
  metrics: VoiceProofTrendsMetricView[];
  report?: VoiceProofTrendReport;
  status: "empty" | "error" | "loading" | "ready" | "warning";
  title: string;
  updatedAt?: number;
};

export type VoiceProofTrendsWidgetOptions = VoiceProofTrendsClientOptions & {
  description?: string;
  links?: Array<{ href: string; label: string }>;
  title?: string;
};

const DEFAULT_TITLE = "Sustained Proof Trends";
const DEFAULT_DESCRIPTION =
  "Repeated-cycle provider, latency, recovery, and readiness evidence with freshness gating.";
const DEFAULT_LINKS = [
  { href: "/voice/proof-trends", label: "Trend page" },
  { href: "/api/voice/proof-trends", label: "Trend JSON" },
];

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMs = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}ms`
    : "n/a";

const statusLabel = (report: VoiceProofTrendReport | undefined) => {
  if (!report) {
    return "No trend report";
  }
  if (report.status === "pass") {
    return `${report.summary.cycles ?? report.cycles.length} cycles passing`;
  }
  return report.status;
};

export const createVoiceProofTrendsViewModel = (
  snapshot: VoiceProofTrendsSnapshot,
  options: VoiceProofTrendsWidgetOptions = {},
): VoiceProofTrendsViewModel => {
  const report = snapshot.report;
  const metrics: VoiceProofTrendsMetricView[] = report
    ? [
        { label: "Status", value: report.status.toUpperCase() },
        {
          label: "Cycles",
          value: String(report.summary.cycles ?? report.cycles.length),
        },
        {
          label: "Provider p95",
          value: formatMs(report.summary.maxProviderP95Ms),
        },
        { label: "Turn p95", value: formatMs(report.summary.maxTurnP95Ms) },
        { label: "Live p95", value: formatMs(report.summary.maxLiveP95Ms) },
        {
          label: "Artifact age",
          value: formatVoiceProofTrendAge(report.ageMs),
        },
        {
          label: "Stale after",
          value: formatVoiceProofTrendAge(report.maxAgeMs),
        },
      ]
    : [];

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    label: snapshot.error
      ? "Unavailable"
      : report
        ? statusLabel(report)
        : snapshot.isLoading
          ? "Checking"
          : "No trend report",
    links: options.links ?? DEFAULT_LINKS,
    metrics,
    report,
    status: snapshot.error
      ? "error"
      : report
        ? report.status === "pass"
          ? "ready"
          : "warning"
        : snapshot.isLoading
          ? "loading"
          : "empty",
    title: options.title ?? DEFAULT_TITLE,
    updatedAt: snapshot.updatedAt,
  };
};

export const renderVoiceProofTrendsHTML = (
  snapshot: VoiceProofTrendsSnapshot,
  options: VoiceProofTrendsWidgetOptions = {},
) => {
  const model = createVoiceProofTrendsViewModel(snapshot, options);
  const metrics = model.metrics.length
    ? `<div class="absolute-voice-proof-trends__metrics">${model.metrics
        .map(
          (metric) => `<article>
  <span>${escapeHtml(metric.label)}</span>
  <strong>${escapeHtml(metric.value)}</strong>
</article>`,
        )
        .join("")}</div>`
    : `<p class="absolute-voice-proof-trends__empty">${
        model.error
          ? escapeHtml(model.error)
          : "Run the sustained proof trends script to populate evidence."
      }</p>`;
  const links = model.links.length
    ? `<p class="absolute-voice-proof-trends__links">${model.links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join("")}</p>`
    : "";

  return `<section class="absolute-voice-proof-trends absolute-voice-proof-trends--${escapeHtml(model.status)}">
  <header class="absolute-voice-proof-trends__header">
    <span class="absolute-voice-proof-trends__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-proof-trends__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-proof-trends__description">${escapeHtml(model.description)}</p>
  ${metrics}
  ${links}
  ${model.error ? `<p class="absolute-voice-proof-trends__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoiceProofTrendsCSS = () =>
  `.absolute-voice-proof-trends{border:1px solid #99f6e4;border-radius:20px;background:#f0fdfa;color:#0f172a;padding:18px;box-shadow:0 18px 40px rgba(13,148,136,.12);font-family:inherit}.absolute-voice-proof-trends--warning,.absolute-voice-proof-trends--error{border-color:#f2a7a7;background:#fff7f4}.absolute-voice-proof-trends__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-proof-trends__eyebrow{color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-proof-trends__label{font-size:24px;line-height:1}.absolute-voice-proof-trends__description,.absolute-voice-proof-trends__empty{color:#475569}.absolute-voice-proof-trends__metrics{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:14px}.absolute-voice-proof-trends__metrics article{background:#fff;border:1px solid #ccfbf1;border-radius:16px;padding:12px}.absolute-voice-proof-trends__metrics span{color:#64748b;display:block;font-size:12px;font-weight:800;text-transform:uppercase}.absolute-voice-proof-trends__metrics strong{display:block;font-size:20px;margin-top:4px}.absolute-voice-proof-trends__links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}.absolute-voice-proof-trends__links a{border:1px solid #99f6e4;border-radius:999px;color:#0f766e;font-weight:800;padding:6px 10px;text-decoration:none}.absolute-voice-proof-trends__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProofTrends = (
  element: Element,
  path = "/api/voice/proof-trends",
  options: VoiceProofTrendsWidgetOptions = {},
) => {
  const store = createVoiceProofTrendsStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceProofTrendsHTML(
      store.getSnapshot(),
      options,
    );
  };
  const unsubscribe = store.subscribe(render);
  render();
  void store.refresh().catch(() => {});

  return {
    close: () => {
      unsubscribe();
      store.close();
    },
    refresh: store.refresh,
  };
};

export const defineVoiceProofTrendsElement = (
  tagName = "absolute-voice-proof-trends",
) => {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(tagName)
  ) {
    return;
  }

  customElements.define(
    tagName,
    class AbsoluteVoiceProofTrendsElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceProofTrends>;

      connectedCallback() {
        this.mounted = mountVoiceProofTrends(
          this,
          this.getAttribute("path") ?? "/api/voice/proof-trends",
          {
            description: this.getAttribute("description") ?? undefined,
            intervalMs:
              Number(this.getAttribute("interval-ms") ?? 0) || undefined,
            title: this.getAttribute("title") ?? undefined,
          },
        );
      }

      disconnectedCallback() {
        this.mounted?.close();
        this.mounted = undefined;
      }
    },
  );
};
