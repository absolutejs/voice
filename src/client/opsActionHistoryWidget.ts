import {
  createVoiceOpsActionHistoryStore,
  type VoiceOpsActionHistoryClientOptions,
  type VoiceOpsActionHistorySnapshot,
} from "./opsActionHistory";

export type VoiceOpsActionHistoryWidgetOptions =
  VoiceOpsActionHistoryClientOptions & {
    limit?: number;
    title?: string;
  };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderVoiceOpsActionHistoryWidgetHTML = (
  snapshot: VoiceOpsActionHistorySnapshot,
  options: VoiceOpsActionHistoryWidgetOptions = {},
) => {
  const report = snapshot.report;
  const entries = (report?.entries ?? []).slice(0, options.limit ?? 5);
  const rows = entries
    .map(
      (entry) =>
        `<li class="absolute-voice-ops-action-history__entry absolute-voice-ops-action-history__entry--${entry.ok ? "success" : "error"}"><span>${escapeHtml(entry.actionId)}</span><strong>${escapeHtml(entry.ok ? "Success" : "Failed")}</strong><small>${escapeHtml(new Date(entry.at).toLocaleString())}${entry.status ? ` · HTTP ${String(entry.status)}` : ""}</small></li>`,
    )
    .join("");

  return `<section class="absolute-voice-ops-action-history">
  <header><span>Operator proof</span><strong>${escapeHtml(options.title ?? "Action History")}</strong></header>
  <p>${String(report?.total ?? 0)} action(s), ${String(report?.failed ?? 0)} failed.</p>
  <ul>${rows || "<li>No operator actions recorded yet.</li>"}</ul>
  ${snapshot.error ? `<p class="absolute-voice-ops-action-history__error">${escapeHtml(snapshot.error)}</p>` : ""}
</section>`;
};

export const getVoiceOpsActionHistoryCSS = () =>
  `.absolute-voice-ops-action-history{border:1px solid #d8d2c4;border-radius:20px;background:#fffaf0;color:#16130d;padding:18px;font-family:inherit}.absolute-voice-ops-action-history header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-ops-action-history header span{color:#73664f;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-ops-action-history header strong{font-size:24px}.absolute-voice-ops-action-history p{color:#514733}.absolute-voice-ops-action-history ul{display:grid;gap:8px;list-style:none;margin:12px 0 0;padding:0}.absolute-voice-ops-action-history__entry{background:#fff;border:1px solid #eee4d2;border-radius:14px;display:grid;gap:3px;padding:10px 12px}.absolute-voice-ops-action-history__entry--error{border-color:#f2a7a7}.absolute-voice-ops-action-history__entry span{font-weight:800}.absolute-voice-ops-action-history__entry small{color:#655944}.absolute-voice-ops-action-history__error{color:#9f1239;font-weight:700}`;

export const mountVoiceOpsActionHistory = (
  element: Element,
  path = "/api/voice/ops-actions/history",
  options: VoiceOpsActionHistoryWidgetOptions = {},
) => {
  const store = createVoiceOpsActionHistoryStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceOpsActionHistoryWidgetHTML(
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
