import {
  createVoiceCallDebuggerStore,
  type VoiceCallDebuggerClientOptions,
  type VoiceCallDebuggerClientState,
} from "./callDebugger";

export type VoiceCallDebuggerLaunchViewModel = {
  description: string;
  error: string | null;
  href: string;
  isLoading: boolean;
  label: string;
  rows: Array<{ label: string; value: string }>;
  status: "empty" | "error" | "loading" | "ready" | "warning";
  title: string;
  updatedAt?: number;
};

export type VoiceCallDebuggerLaunchOptions = VoiceCallDebuggerClientOptions & {
  description?: string;
  href?:
    | string
    | ((input: { report?: VoiceCallDebuggerClientState["report"] }) => string);
  linkLabel?: string;
  title?: string;
};

const DEFAULT_TITLE = "Call Debugger";
const DEFAULT_DESCRIPTION =
  "Open the latest call artifact with snapshot, operations record, failure replay, provider path, transcript, and incident markdown.";
const DEFAULT_LINK_LABEL = "Open debugger";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const defaultHref = (
  path: string,
  report?: VoiceCallDebuggerClientState["report"],
) => {
  if (path.startsWith("/api/voice-call-debugger/")) {
    return path.replace("/api/voice-call-debugger/", "/voice-call-debugger/");
  }
  return report
    ? `/voice-call-debugger/${encodeURIComponent(report.sessionId)}`
    : path;
};

const resolveHref = (
  path: string,
  state: VoiceCallDebuggerClientState,
  options: VoiceCallDebuggerLaunchOptions,
) => {
  if (typeof options.href === "function") {
    return options.href({ report: state.report });
  }
  return options.href ?? defaultHref(path, state.report);
};

export const createVoiceCallDebuggerLaunchViewModel = (
  path: string,
  state: VoiceCallDebuggerClientState,
  options: VoiceCallDebuggerLaunchOptions = {},
): VoiceCallDebuggerLaunchViewModel => {
  const report = state.report;
  const href = resolveHref(path, state, options);

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: state.error,
    href,
    isLoading: state.isLoading,
    label: state.error
      ? "Unavailable"
      : report
        ? `${report.status} · ${report.sessionId}`
        : state.isLoading
          ? "Loading"
          : "No call loaded",
    rows: report
      ? [
          {
            label: "Events",
            value: String(report.operationsRecord.summary.eventCount),
          },
          {
            label: "Turns",
            value: String(report.operationsRecord.summary.turnCount),
          },
          {
            label: "Errors",
            value: String(report.operationsRecord.summary.errorCount),
          },
          {
            label: "Provider recovery",
            value:
              report.operationsRecord.providerDecisionSummary.recoveryStatus,
          },
          {
            label: "Fallbacks",
            value: String(
              report.operationsRecord.providerDecisionSummary.fallbacks,
            ),
          },
          { label: "Snapshot", value: report.snapshot.status },
        ]
      : [],
    status: state.error
      ? "error"
      : report
        ? report.status === "healthy"
          ? "ready"
          : "warning"
        : state.isLoading
          ? "loading"
          : "empty",
    title: options.title ?? DEFAULT_TITLE,
    updatedAt: state.updatedAt,
  };
};

export const renderVoiceCallDebuggerLaunchHTML = (
  path: string,
  state: VoiceCallDebuggerClientState,
  options: VoiceCallDebuggerLaunchOptions = {},
) => {
  const model = createVoiceCallDebuggerLaunchViewModel(path, state, options);
  const rows = model.rows.length
    ? `<dl>${model.rows
        .map(
          (row) => `<div>
    <dt>${escapeHtml(row.label)}</dt>
    <dd>${escapeHtml(row.value)}</dd>
  </div>`,
        )
        .join("")}</dl>`
    : '<p class="absolute-voice-call-debugger-launch__empty">Load a call debugger report to see the latest support artifact.</p>';

  return `<section class="absolute-voice-call-debugger-launch absolute-voice-call-debugger-launch--${escapeHtml(model.status)}">
  <header class="absolute-voice-call-debugger-launch__header">
    <span class="absolute-voice-call-debugger-launch__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-call-debugger-launch__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-call-debugger-launch__description">${escapeHtml(model.description)}</p>
  <a class="absolute-voice-call-debugger-launch__link" href="${escapeHtml(model.href)}">${escapeHtml(options.linkLabel ?? DEFAULT_LINK_LABEL)}</a>
  ${rows}
  ${model.error ? `<p class="absolute-voice-call-debugger-launch__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const mountVoiceCallDebuggerLaunch = (
  element: Element,
  path: string,
  options: VoiceCallDebuggerLaunchOptions = {},
) => {
  const store = createVoiceCallDebuggerStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceCallDebuggerLaunchHTML(
      path,
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

export const defineVoiceCallDebuggerLaunchElement = (
  tagName = "absolute-voice-call-debugger-launch",
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
    class AbsoluteVoiceCallDebuggerLaunchElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceCallDebuggerLaunch>;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 0);
        this.mounted = mountVoiceCallDebuggerLaunch(
          this,
          this.getAttribute("path") ?? "/api/voice-call-debugger/latest",
          {
            description: this.getAttribute("description") ?? undefined,
            href: this.getAttribute("href") ?? undefined,
            intervalMs: Number.isFinite(intervalMs) ? intervalMs : 0,
            linkLabel: this.getAttribute("link-label") ?? undefined,
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
