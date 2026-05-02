import type {
  VoiceSessionObservabilityLink,
  VoiceSessionObservabilityTurn,
} from "../sessionObservability";
import {
  createVoiceSessionObservabilityStore,
  type VoiceSessionObservabilityClientOptions,
  type VoiceSessionObservabilitySnapshot,
} from "./sessionObservability";

export type VoiceSessionObservabilityTurnView =
  VoiceSessionObservabilityTurn & {
    durationLabel: string;
    label: string;
  };

export type VoiceSessionObservabilityViewModel = {
  description: string;
  error: string | null;
  isLoading: boolean;
  label: string;
  links: VoiceSessionObservabilityLink[];
  sessionId?: string;
  status: "empty" | "error" | "failed" | "loading" | "ready" | "warning";
  title: string;
  turns: VoiceSessionObservabilityTurnView[];
  updatedAt?: number;
};

export type VoiceSessionObservabilityWidgetOptions =
  VoiceSessionObservabilityClientOptions & {
    description?: string;
    maxTurns?: number;
    title?: string;
  };

const DEFAULT_TITLE = "Session Observability";
const DEFAULT_DESCRIPTION =
  "One support/debug report for a voice call across traces, provider recovery, tools, handoffs, guardrails, turn waterfalls, and incident handoff.";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMs = (value: number | undefined) =>
  typeof value === "number" ? `${value}ms` : "n/a";

export const createVoiceSessionObservabilityViewModel = (
  snapshot: VoiceSessionObservabilitySnapshot,
  options: VoiceSessionObservabilityWidgetOptions = {},
): VoiceSessionObservabilityViewModel => {
  const report = snapshot.report;
  const turns = (report?.turns ?? [])
    .slice(0, options.maxTurns ?? 3)
    .map((turn) => ({
      ...turn,
      durationLabel: formatMs(turn.durationMs),
      label: `${turn.transcripts} transcripts / ${turn.toolCalls} tools / ${turn.providerDecisions} provider decisions`,
    }));

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    label: snapshot.error
      ? "Unavailable"
      : report
        ? `${report.summary.turns} turns / ${report.summary.fallbacks} fallbacks / ${report.summary.errors} errors`
        : snapshot.isLoading
          ? "Checking"
          : "No session loaded",
    links: report?.links ?? [],
    sessionId: report?.sessionId,
    status: snapshot.error
      ? "error"
      : report?.status === "failed"
        ? "failed"
        : report?.status === "warning"
          ? "warning"
          : report
            ? "ready"
            : snapshot.isLoading
              ? "loading"
              : "empty",
    title: options.title ?? DEFAULT_TITLE,
    turns,
    updatedAt: snapshot.updatedAt,
  };
};

const renderLinks = (links: readonly VoiceSessionObservabilityLink[]) =>
  links.length
    ? `<p class="absolute-voice-session-observability__actions">${links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join("")}</p>`
    : "";

export const renderVoiceSessionObservabilityHTML = (
  snapshot: VoiceSessionObservabilitySnapshot,
  options: VoiceSessionObservabilityWidgetOptions = {},
) => {
  const model = createVoiceSessionObservabilityViewModel(snapshot, options);
  const turns = model.turns.length
    ? `<div class="absolute-voice-session-observability__turns">${model.turns
        .map(
          (turn) =>
            `<article class="absolute-voice-session-observability__turn"><header><strong>${escapeHtml(turn.turnId)}</strong><span>${escapeHtml(turn.durationLabel)}</span></header><p>${escapeHtml(turn.label)}</p></article>`,
        )
        .join("")}</div>`
    : '<p class="absolute-voice-session-observability__empty">Open a voice session to see turn waterfalls.</p>';

  return `<section class="absolute-voice-session-observability absolute-voice-session-observability--${escapeHtml(model.status)}">
  <header class="absolute-voice-session-observability__header">
    <span class="absolute-voice-session-observability__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-session-observability__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-session-observability__description">${escapeHtml(model.description)}</p>
  ${model.sessionId ? `<p class="absolute-voice-session-observability__session">${escapeHtml(model.sessionId)}</p>` : ""}
  ${renderLinks(model.links)}
  ${turns}
  ${model.error ? `<p class="absolute-voice-session-observability__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoiceSessionObservabilityCSS = () =>
  `.absolute-voice-session-observability{border:1px solid #c8d9bf;border-radius:20px;background:#fbfff3;color:#18220d;padding:18px;box-shadow:0 18px 40px rgba(24,34,13,.12);font-family:inherit}.absolute-voice-session-observability--error,.absolute-voice-session-observability--failed{border-color:#f2a7a7;background:#fff5f3}.absolute-voice-session-observability--warning{border-color:#fbbf24;background:#fffaf0}.absolute-voice-session-observability__header,.absolute-voice-session-observability__turn header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-session-observability__eyebrow{color:#4d7c0f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-session-observability__label{font-size:24px;line-height:1}.absolute-voice-session-observability__description,.absolute-voice-session-observability__turn p,.absolute-voice-session-observability__empty,.absolute-voice-session-observability__session{color:#4b5f3e}.absolute-voice-session-observability__actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.absolute-voice-session-observability__actions a{color:#3f6212;font-weight:800}.absolute-voice-session-observability__turns{display:grid;gap:12px;margin-top:14px}.absolute-voice-session-observability__turn{background:#fff;border:1px solid #dcebcf;border-radius:16px;padding:14px}.absolute-voice-session-observability__turn p{margin:10px 0 0}.absolute-voice-session-observability__empty{margin:14px 0 0}.absolute-voice-session-observability__error{color:#9f1239;font-weight:700}`;

export const mountVoiceSessionObservability = (
  element: Element,
  path: string,
  options: VoiceSessionObservabilityWidgetOptions = {},
) => {
  const store = createVoiceSessionObservabilityStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceSessionObservabilityHTML(
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

export const defineVoiceSessionObservabilityElement = (
  tagName = "absolute-voice-session-observability",
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
    class AbsoluteVoiceSessionObservabilityElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceSessionObservability>;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 5000);
        const maxTurns = Number(this.getAttribute("max-turns") ?? 3);
        this.mounted = mountVoiceSessionObservability(
          this,
          this.getAttribute("path") ??
            "/api/voice/session-observability/latest",
          {
            description: this.getAttribute("description") ?? undefined,
            intervalMs: Number.isFinite(intervalMs) ? intervalMs : 5000,
            maxTurns: Number.isFinite(maxTurns) ? maxTurns : 3,
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
