import type { VoiceProviderContractMatrixRow } from "../providerStackRecommendations";
import {
  createVoiceProviderContractsStore,
  type VoiceProviderContractsClientOptions,
  type VoiceProviderContractsSnapshot,
} from "./providerContracts";

export type VoiceProviderContractRowView<TProvider extends string = string> =
  VoiceProviderContractMatrixRow<TProvider> & {
    detail: string;
    label: string;
    remediations: Array<{ detail: string; href?: string; label: string }>;
    rows: Array<{ label: string; value: string }>;
  };

export type VoiceProviderContractsViewModel<TProvider extends string = string> =
  {
    description: string;
    error: string | null;
    isLoading: boolean;
    label: string;
    rows: VoiceProviderContractRowView<TProvider>[];
    status: "empty" | "error" | "loading" | "ready" | "warning";
    title: string;
    updatedAt?: number;
  };

export type VoiceProviderContractsWidgetOptions =
  VoiceProviderContractsClientOptions & {
    description?: string;
    title?: string;
  };

const DEFAULT_TITLE = "Provider Contracts";
const DEFAULT_DESCRIPTION =
  "Production contract coverage for provider env, latency, fallback, streaming, and capabilities.";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatProvider = (provider: string) =>
  provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ") || provider;

const formatStatus = (status: string) =>
  status
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const contractDetail = (row: VoiceProviderContractMatrixRow) => {
  const failing = row.checks.filter((check) => check.status !== "pass");
  if (failing.length === 0) {
    return "Provider contract is production-ready.";
  }
  return failing
    .map((check) => `${check.label}: ${check.detail ?? check.status}`)
    .join(" ");
};

export const createVoiceProviderContractsViewModel = <
  TProvider extends string = string,
>(
  snapshot: VoiceProviderContractsSnapshot<TProvider>,
  options: VoiceProviderContractsWidgetOptions = {},
): VoiceProviderContractsViewModel<TProvider> => {
  const rows = (snapshot.report?.rows ?? []).map((row) => ({
    ...row,
    detail: contractDetail(row),
    label: `${formatProvider(row.provider)} ${row.kind.toUpperCase()}`,
    remediations: row.checks
      .filter((check) => check.status !== "pass" && check.remediation)
      .map((check) => ({
        detail: check.remediation?.detail ?? "",
        href: check.remediation?.href,
        label: check.remediation?.label ?? check.label,
      })),
    rows: [
      { label: "Status", value: formatStatus(row.status) },
      { label: "Selected", value: row.selected ? "Yes" : "No" },
      { label: "Configured", value: row.configured ? "Yes" : "No" },
      {
        label: "Checks",
        value: row.checks
          .map((check) => `${check.label}: ${formatStatus(check.status)}`)
          .join(", "),
      },
    ],
  }));
  const warningCount = snapshot.report
    ? snapshot.report.failed + snapshot.report.warned
    : rows.filter((row) => row.status !== "pass").length;

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    label: snapshot.error
      ? "Unavailable"
      : rows.length
        ? warningCount > 0
          ? `${warningCount} needs attention`
          : `${rows.length} passing`
        : snapshot.isLoading
          ? "Checking"
          : "No contracts",
    rows,
    status: snapshot.error
      ? "error"
      : rows.length
        ? warningCount > 0
          ? "warning"
          : "ready"
        : snapshot.isLoading
          ? "loading"
          : "empty",
    title: options.title ?? DEFAULT_TITLE,
    updatedAt: snapshot.updatedAt,
  };
};

export const renderVoiceProviderContractsHTML = <
  TProvider extends string = string,
>(
  snapshot: VoiceProviderContractsSnapshot<TProvider>,
  options: VoiceProviderContractsWidgetOptions = {},
) => {
  const model = createVoiceProviderContractsViewModel(snapshot, options);
  const rows = model.rows.length
    ? `<div class="absolute-voice-provider-contracts__rows">${model.rows
        .map(
          (
            row,
          ) => `<article class="absolute-voice-provider-contracts__row absolute-voice-provider-contracts__row--${escapeHtml(row.status)}">
  <header>
    <strong>${escapeHtml(row.label)}</strong>
    <span>${escapeHtml(formatStatus(row.status))}</span>
  </header>
  <p>${escapeHtml(row.detail)}</p>
  ${
    row.remediations.length
      ? `<ul class="absolute-voice-provider-contracts__remediations">${row.remediations
          .map(
            (remediation) =>
              `<li>${remediation.href ? `<a href="${escapeHtml(remediation.href)}">${escapeHtml(remediation.label)}</a>` : `<strong>${escapeHtml(remediation.label)}</strong>`}<span>${escapeHtml(remediation.detail)}</span></li>`,
          )
          .join("")}</ul>`
      : ""
  }
  <dl>${row.rows
    .map(
      (item) => `<div>
    <dt>${escapeHtml(item.label)}</dt>
    <dd>${escapeHtml(item.value)}</dd>
  </div>`,
    )
    .join("")}</dl>
</article>`,
        )
        .join("")}</div>`
    : '<p class="absolute-voice-provider-contracts__empty">Configure provider contracts to see production coverage.</p>';

  return `<section class="absolute-voice-provider-contracts absolute-voice-provider-contracts--${escapeHtml(model.status)}">
  <header class="absolute-voice-provider-contracts__header">
    <span class="absolute-voice-provider-contracts__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-provider-contracts__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-provider-contracts__description">${escapeHtml(model.description)}</p>
  ${rows}
  ${model.error ? `<p class="absolute-voice-provider-contracts__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoiceProviderContractsCSS = () =>
  `.absolute-voice-provider-contracts{border:1px solid #b8dcc7;border-radius:20px;background:#f7fff9;color:#09140d;padding:18px;box-shadow:0 18px 40px rgba(21,83,45,.12);font-family:inherit}.absolute-voice-provider-contracts--error,.absolute-voice-provider-contracts--warning{border-color:#f2a7a7;background:#fff7f4}.absolute-voice-provider-contracts__header,.absolute-voice-provider-contracts__row header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-provider-contracts__eyebrow{color:#166534;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-provider-contracts__label{font-size:24px;line-height:1}.absolute-voice-provider-contracts__description,.absolute-voice-provider-contracts__row p,.absolute-voice-provider-contracts__row dt,.absolute-voice-provider-contracts__empty{color:#405448}.absolute-voice-provider-contracts__rows{display:grid;gap:12px;margin-top:14px}.absolute-voice-provider-contracts__row{background:#fff;border:1px solid #d6eadb;border-radius:16px;padding:14px}.absolute-voice-provider-contracts__row--pass{border-color:#86efac}.absolute-voice-provider-contracts__row--warn,.absolute-voice-provider-contracts__row--fail{border-color:#f2a7a7}.absolute-voice-provider-contracts__row p{margin:10px 0}.absolute-voice-provider-contracts__remediations{display:grid;gap:8px;list-style:none;margin:0 0 10px;padding:0}.absolute-voice-provider-contracts__remediations li{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;display:grid;gap:3px;padding:8px}.absolute-voice-provider-contracts__remediations a,.absolute-voice-provider-contracts__remediations strong{color:#9a3412}.absolute-voice-provider-contracts__remediations span{color:#7c2d12}.absolute-voice-provider-contracts__row dl{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0}.absolute-voice-provider-contracts__row div{background:#f7fff9;border:1px solid #d6eadb;border-radius:12px;padding:8px}.absolute-voice-provider-contracts__row dt{font-size:12px}.absolute-voice-provider-contracts__row dd{font-weight:800;margin:4px 0 0}.absolute-voice-provider-contracts__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProviderContracts = <TProvider extends string = string>(
  element: Element,
  path = "/api/provider-contracts",
  options: VoiceProviderContractsWidgetOptions = {},
) => {
  const store = createVoiceProviderContractsStore<TProvider>(path, options);
  const render = () => {
    element.innerHTML = renderVoiceProviderContractsHTML(
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

export const defineVoiceProviderContractsElement = (
  tagName = "absolute-voice-provider-contracts",
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
    class AbsoluteVoiceProviderContractsElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceProviderContracts>;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 5000);
        this.mounted = mountVoiceProviderContracts(
          this,
          this.getAttribute("path") ?? "/api/provider-contracts",
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
