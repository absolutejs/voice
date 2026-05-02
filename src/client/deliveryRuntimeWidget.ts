import {
  createVoiceDeliveryRuntimeStore,
  type VoiceDeliveryRuntimeClientOptions,
  type VoiceDeliveryRuntimeSnapshot,
} from "./deliveryRuntime";
import type { VoiceDeliveryRuntimeSummary } from "../deliveryRuntime";

export type VoiceDeliveryRuntimeSurfaceView = {
  deadLettered: number;
  detail: string;
  failed: number;
  id: "audit" | "trace";
  label: string;
  pending: number;
  status: "pass" | "warn" | "disabled";
  total: number;
};

export type VoiceDeliveryRuntimeViewModel = {
  description: string;
  error: string | null;
  actionError: string | null;
  actionStatus: VoiceDeliveryRuntimeSnapshot["actionStatus"];
  isLoading: boolean;
  isRunning: boolean;
  label: string;
  status: "pass" | "warn" | "loading" | "error";
  surfaces: VoiceDeliveryRuntimeSurfaceView[];
  title: string;
  updatedAt?: number;
};

export type VoiceDeliveryRuntimeWidgetOptions =
  VoiceDeliveryRuntimeClientOptions & {
    description?: string;
    includeActions?: boolean;
    title?: string;
  };

const DEFAULT_TITLE = "Voice Delivery Runtime";
const DEFAULT_DESCRIPTION =
  "Audit and trace delivery worker health from your AbsoluteJS voice app.";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const createSurface = (
  id: "audit" | "trace",
  summary:
    | VoiceDeliveryRuntimeSummary["audit"]
    | VoiceDeliveryRuntimeSummary["trace"],
): VoiceDeliveryRuntimeSurfaceView => {
  if (!summary) {
    return {
      deadLettered: 0,
      detail: "Worker disabled",
      failed: 0,
      id,
      label: id === "audit" ? "Audit delivery" : "Trace delivery",
      pending: 0,
      status: "disabled",
      total: 0,
    };
  }

  const blocked = summary.failed + summary.deadLettered;
  return {
    deadLettered: summary.deadLettered,
    detail: `${summary.delivered}/${summary.total} delivered, ${summary.pending} pending`,
    failed: summary.failed,
    id,
    label: id === "audit" ? "Audit delivery" : "Trace delivery",
    pending: summary.pending,
    status: blocked > 0 ? "warn" : "pass",
    total: summary.total,
  };
};

export const createVoiceDeliveryRuntimeViewModel = (
  snapshot: VoiceDeliveryRuntimeSnapshot,
  options: VoiceDeliveryRuntimeWidgetOptions = {},
): VoiceDeliveryRuntimeViewModel => {
  const report = snapshot.report;
  const surfaces = [
    createSurface("audit", report?.summary.audit),
    createSurface("trace", report?.summary.trace),
  ];
  const hasWarnings = surfaces.some((surface) => surface.status === "warn");

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    actionError: snapshot.actionError,
    actionStatus: snapshot.actionStatus,
    isLoading: snapshot.isLoading,
    isRunning: Boolean(report?.isRunning),
    label: snapshot.error
      ? "Unavailable"
      : report
        ? report.isRunning
          ? "Running"
          : "Stopped"
        : "Checking",
    status: snapshot.error
      ? "error"
      : report
        ? hasWarnings
          ? "warn"
          : "pass"
        : "loading",
    surfaces,
    title: options.title ?? DEFAULT_TITLE,
    updatedAt: snapshot.updatedAt,
  };
};

export const renderVoiceDeliveryRuntimeHTML = (
  snapshot: VoiceDeliveryRuntimeSnapshot,
  options: VoiceDeliveryRuntimeWidgetOptions = {},
) => {
  const model = createVoiceDeliveryRuntimeViewModel(snapshot, options);
  const surfaces = model.surfaces
    .map(
      (
        surface,
      ) => `<li class="absolute-voice-delivery-runtime__surface absolute-voice-delivery-runtime__surface--${escapeHtml(surface.status)}">
  <span>${escapeHtml(surface.label)}</span>
  <strong>${escapeHtml(surface.detail)}</strong>
  <small>${String(surface.failed)} failed &middot; ${String(surface.deadLettered)} dead-lettered</small>
</li>`,
    )
    .join("");
  const actions =
    options.includeActions === false
      ? ""
      : `<div class="absolute-voice-delivery-runtime__actions">
  <button type="button" data-absolute-voice-delivery-runtime-action="tick">${model.actionStatus === "running" ? "Working..." : "Tick workers"}</button>
  <button type="button" data-absolute-voice-delivery-runtime-action="requeue-dead-letters"${model.surfaces.some((surface) => surface.deadLettered > 0) ? "" : " disabled"}>Requeue dead letters</button>
</div>`;
  const actionError = model.actionError
    ? `<p class="absolute-voice-delivery-runtime__error">${escapeHtml(model.actionError)}</p>`
    : "";

  return `<section class="absolute-voice-delivery-runtime absolute-voice-delivery-runtime--${escapeHtml(model.status)}">
  <header class="absolute-voice-delivery-runtime__header">
    <span class="absolute-voice-delivery-runtime__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-delivery-runtime__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-delivery-runtime__description">${escapeHtml(model.description)}</p>
  <ul class="absolute-voice-delivery-runtime__surfaces">${surfaces}</ul>
  ${actions}
  ${actionError}
  ${model.error ? `<p class="absolute-voice-delivery-runtime__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoiceDeliveryRuntimeCSS = () =>
  `.absolute-voice-delivery-runtime{border:1px solid #c9d8cf;border-radius:20px;background:#f6fff9;color:#0d1b12;padding:18px;box-shadow:0 18px 40px rgba(19,55,35,.12);font-family:inherit}.absolute-voice-delivery-runtime--warn,.absolute-voice-delivery-runtime--error{border-color:#f2b56b;background:#fff9ed}.absolute-voice-delivery-runtime__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-delivery-runtime__eyebrow{color:#4e6b59;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-delivery-runtime__label{font-size:28px;line-height:1}.absolute-voice-delivery-runtime__description{color:#33483b;margin:12px 0 0}.absolute-voice-delivery-runtime__surfaces{display:grid;gap:8px;list-style:none;margin:16px 0 0;padding:0}.absolute-voice-delivery-runtime__surface{background:#fff;border:1px solid #d9eadf;border-radius:14px;display:grid;gap:4px;padding:10px 12px}.absolute-voice-delivery-runtime__surface--warn{border-color:#f2b56b}.absolute-voice-delivery-runtime__surface--disabled{opacity:.72}.absolute-voice-delivery-runtime__surface span,.absolute-voice-delivery-runtime__surface small{color:#587063}.absolute-voice-delivery-runtime__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.absolute-voice-delivery-runtime__actions button{background:#134e2d;border:0;border-radius:999px;color:#f6fff9;cursor:pointer;font:inherit;font-weight:800;padding:8px 12px}.absolute-voice-delivery-runtime__actions button:disabled{cursor:not-allowed;opacity:.48}.absolute-voice-delivery-runtime__error{color:#9f1239;font-weight:700}`;

export const mountVoiceDeliveryRuntime = (
  element: Element,
  path = "/api/voice-delivery-runtime",
  options: VoiceDeliveryRuntimeWidgetOptions = {},
) => {
  const store = createVoiceDeliveryRuntimeStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceDeliveryRuntimeHTML(
      store.getSnapshot(),
      options,
    );
  };
  const unsubscribe = store.subscribe(render);
  const handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const action = target.closest(
      "[data-absolute-voice-delivery-runtime-action]",
    );
    const actionName = action?.getAttribute(
      "data-absolute-voice-delivery-runtime-action",
    );
    if (actionName === "tick") {
      void store.tick().catch(() => {});
    }
    if (actionName === "requeue-dead-letters") {
      void store.requeueDeadLetters().catch(() => {});
    }
  };
  element.addEventListener?.("click", handleClick);
  render();
  void store.refresh().catch(() => {});

  return {
    close: () => {
      element.removeEventListener?.("click", handleClick);
      unsubscribe();
      store.close();
    },
    refresh: store.refresh,
  };
};

export const defineVoiceDeliveryRuntimeElement = (
  tagName = "absolute-voice-delivery-runtime",
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
    class AbsoluteVoiceDeliveryRuntimeElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceDeliveryRuntime>;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 5000);
        this.mounted = mountVoiceDeliveryRuntime(
          this,
          this.getAttribute("path") ?? "/api/voice-delivery-runtime",
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
