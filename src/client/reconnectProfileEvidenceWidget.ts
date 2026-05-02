import {
  createVoiceReconnectProfileEvidenceStore,
  type VoiceReconnectProfileEvidenceClientOptions,
  type VoiceReconnectProfileEvidenceSnapshot,
} from "./reconnectProfileEvidence";

export type VoiceReconnectProfileEvidenceMetricView = {
  label: string;
  value: string;
};

export type VoiceReconnectProfileEvidenceViewModel = {
  description: string;
  error: string | null;
  isLoading: boolean;
  label: string;
  latest?: {
    profileLabel: string;
    sessionId: string;
    surfaces: string;
  };
  links: Array<{ href: string; label: string }>;
  metrics: VoiceReconnectProfileEvidenceMetricView[];
  status: "empty" | "error" | "loading" | "ready" | "warning";
  title: string;
};

export type VoiceReconnectProfileEvidenceWidgetOptions =
  VoiceReconnectProfileEvidenceClientOptions & {
    description?: string;
    links?: Array<{ href: string; label: string }>;
    title?: string;
  };

const DEFAULT_TITLE = "Persisted Reconnect Evidence";
const DEFAULT_DESCRIPTION =
  "Real browser reconnect/resume evidence persisted into profile history so recovery claims are backed by durable traces.";
const DEFAULT_LINKS = [
  { href: "/voice/reconnect-contract", label: "Reconnect contract" },
  {
    href: "/api/voice/real-call-profile-history",
    label: "Profile history JSON",
  },
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

const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const formatAge = (value?: string) => {
  if (!value) {
    return "No evidence";
  }

  const elapsedMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return "Just now";
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
};

export const createVoiceReconnectProfileEvidenceViewModel = (
  snapshot: VoiceReconnectProfileEvidenceSnapshot,
  options: VoiceReconnectProfileEvidenceWidgetOptions = {},
): VoiceReconnectProfileEvidenceViewModel => {
  const report = snapshot.report;
  const latest = report?.latest;
  const latestAt = latest?.generatedAt ?? latest?.createdAt;

  return {
    description:
      options.description ?? latest?.profileDescription ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    label: snapshot.error
      ? "Unavailable"
      : report
        ? report.status === "pass"
          ? "Reconnect evidence passing"
          : report.status === "warn"
            ? "Reconnect evidence incomplete"
            : report.status === "fail"
              ? "Reconnect evidence failing"
              : "Waiting for reconnect evidence"
        : snapshot.isLoading
          ? "Checking"
          : "No reconnect evidence",
    latest: latest
      ? {
          profileLabel: latest.profileLabel ?? latest.profileId,
          sessionId: latest.sessionId,
          surfaces: (latest.surfaces ?? []).join(", ") || "browser",
        }
      : undefined,
    links: options.links ?? DEFAULT_LINKS,
    metrics: [
      { label: "Samples", value: formatCount(report?.sampleCount ?? 0) },
      { label: "Snapshots", value: formatCount(report?.snapshotCount ?? 0) },
      {
        label: "Resume p95",
        value: formatMs(
          report?.resumeLatencyP95Ms ?? latest?.reconnect?.resumeLatencyP95Ms,
        ),
      },
      { label: "Last proof", value: formatAge(latestAt) },
    ],
    status: snapshot.error
      ? "error"
      : report
        ? report.status === "pass"
          ? "ready"
          : report.status === "empty"
            ? "empty"
            : "warning"
        : snapshot.isLoading
          ? "loading"
          : "empty",
    title: options.title ?? DEFAULT_TITLE,
  };
};

export const renderVoiceReconnectProfileEvidenceHTML = (
  snapshot: VoiceReconnectProfileEvidenceSnapshot,
  options: VoiceReconnectProfileEvidenceWidgetOptions = {},
) => {
  const model = createVoiceReconnectProfileEvidenceViewModel(snapshot, options);
  const metrics = `<div class="absolute-voice-reconnect-evidence__metrics">${model.metrics
    .map(
      (metric) => `<article>
  <span>${escapeHtml(metric.label)}</span>
  <strong>${escapeHtml(metric.value)}</strong>
</article>`,
    )
    .join("")}</div>`;
  const latest = model.latest
    ? `<p class="absolute-voice-reconnect-evidence__latest">Latest ${escapeHtml(model.latest.profileLabel)} · ${escapeHtml(model.latest.sessionId)} · ${escapeHtml(model.latest.surfaces)}</p>`
    : `<p class="absolute-voice-reconnect-evidence__empty">No persisted reconnect profile evidence yet.</p>`;
  const links = model.links.length
    ? `<p class="absolute-voice-reconnect-evidence__links">${model.links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join("")}</p>`
    : "";

  return `<section class="absolute-voice-reconnect-evidence absolute-voice-reconnect-evidence--${escapeHtml(model.status)}">
  <header class="absolute-voice-reconnect-evidence__header">
    <span class="absolute-voice-reconnect-evidence__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-reconnect-evidence__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-reconnect-evidence__description">${escapeHtml(model.description)}</p>
  ${metrics}
  ${latest}
  ${links}
  ${model.error ? `<p class="absolute-voice-reconnect-evidence__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoiceReconnectProfileEvidenceCSS = () =>
  `.absolute-voice-reconnect-evidence{border:1px solid #bae6fd;border-radius:20px;background:#f0f9ff;color:#0f172a;padding:18px;box-shadow:0 18px 40px rgba(14,165,233,.12);font-family:inherit}.absolute-voice-reconnect-evidence--warning,.absolute-voice-reconnect-evidence--error{border-color:#fbbf24;background:#fffbeb}.absolute-voice-reconnect-evidence__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-reconnect-evidence__eyebrow{color:#0369a1;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-reconnect-evidence__label{font-size:24px;line-height:1}.absolute-voice-reconnect-evidence__description,.absolute-voice-reconnect-evidence__empty,.absolute-voice-reconnect-evidence__latest{color:#475569}.absolute-voice-reconnect-evidence__metrics{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px}.absolute-voice-reconnect-evidence__metrics article{background:#fff;border:1px solid #bae6fd;border-radius:16px;padding:12px}.absolute-voice-reconnect-evidence__metrics span{color:#64748b;display:block;font-size:11px;font-weight:800;text-transform:uppercase}.absolute-voice-reconnect-evidence__metrics strong{display:block;font-size:20px;margin-top:4px}.absolute-voice-reconnect-evidence__links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}.absolute-voice-reconnect-evidence__links a{border:1px solid #7dd3fc;border-radius:999px;color:#0369a1;font-weight:800;padding:6px 10px;text-decoration:none}.absolute-voice-reconnect-evidence__error{color:#9f1239;font-weight:700}@media (max-width:720px){.absolute-voice-reconnect-evidence__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

export const mountVoiceReconnectProfileEvidence = (
  element: Element,
  path = "/api/voice/reconnect-profile-evidence",
  options: VoiceReconnectProfileEvidenceWidgetOptions = {},
) => {
  const store = createVoiceReconnectProfileEvidenceStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceReconnectProfileEvidenceHTML(
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

export const defineVoiceReconnectProfileEvidenceElement = (
  tagName = "absolute-voice-reconnect-profile-evidence",
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
    class AbsoluteVoiceReconnectProfileEvidenceElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceReconnectProfileEvidence>;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 5000);
        this.mounted = mountVoiceReconnectProfileEvidence(
          this,
          this.getAttribute("path") ?? "/api/voice/reconnect-profile-evidence",
          {
            description: this.getAttribute("description") ?? undefined,
            intervalMs: Number.isFinite(intervalMs) ? intervalMs : 5000,
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
