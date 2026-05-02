import {
  createVoiceProfileSwitchRecommendationStore,
  type VoiceProfileSwitchRecommendationClientOptions,
  type VoiceProfileSwitchRecommendationSnapshot,
} from "./profileSwitchRecommendation";

export type VoiceProfileSwitchRecommendationWidgetOptions =
  VoiceProfileSwitchRecommendationClientOptions & {
    description?: string;
    title?: string;
  };

const DEFAULT_TITLE = "Profile Switch Recommendation";
const DEFAULT_DESCRIPTION =
  "Compares the current session against measured profile evidence and recommends whether to switch stacks.";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatRoute = (routes: Record<string, string> | undefined) =>
  routes
    ? Object.entries(routes)
        .map(([role, provider]) => `${role}: ${provider}`)
        .join(", ")
    : "No route";

export const renderVoiceProfileSwitchRecommendationHTML = (
  snapshot: VoiceProfileSwitchRecommendationSnapshot,
  options: VoiceProfileSwitchRecommendationWidgetOptions = {},
) => {
  const recommendation = snapshot.recommendation;
  const status = snapshot.error
    ? "error"
    : recommendation
      ? recommendation.status
      : snapshot.isLoading
        ? "loading"
        : "empty";
  const label = snapshot.error
    ? "Unavailable"
    : recommendation
      ? recommendation.status === "switch"
        ? `Switch to ${recommendation.recommendedProfile?.label ?? recommendation.recommendedProfile?.profileId ?? "recommended profile"}`
        : recommendation.status === "stay"
          ? "Keep current profile"
          : "Needs evidence"
      : snapshot.isLoading
        ? "Checking"
        : "No recommendation";
  const body = recommendation
    ? `<div class="absolute-voice-profile-switch__body">
  <p><strong>Current:</strong> ${escapeHtml(recommendation.currentProfile?.label ?? recommendation.currentProfile?.profileId ?? "Unknown")}</p>
  <p><strong>Recommended:</strong> ${escapeHtml(recommendation.recommendedProfile?.label ?? recommendation.recommendedProfile?.profileId ?? "None")}</p>
  <p><strong>Routes:</strong> ${escapeHtml(formatRoute(recommendation.recommendedProfile?.providerRoutes))}</p>
  <ul>${recommendation.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
  <em>${escapeHtml(recommendation.nextMove)}</em>
</div>`
    : `<p class="absolute-voice-profile-switch__empty">${escapeHtml(snapshot.error ?? "Run session traffic to populate a recommendation.")}</p>`;

  return `<section class="absolute-voice-profile-switch absolute-voice-profile-switch--${escapeHtml(status)}">
  <header class="absolute-voice-profile-switch__header">
    <span class="absolute-voice-profile-switch__eyebrow">${escapeHtml(options.title ?? DEFAULT_TITLE)}</span>
    <strong class="absolute-voice-profile-switch__label">${escapeHtml(label)}</strong>
  </header>
  <p class="absolute-voice-profile-switch__description">${escapeHtml(options.description ?? DEFAULT_DESCRIPTION)}</p>
  ${body}
  ${snapshot.error ? `<p class="absolute-voice-profile-switch__error">${escapeHtml(snapshot.error)}</p>` : ""}
</section>`;
};

export const getVoiceProfileSwitchRecommendationCSS = () =>
  `.absolute-voice-profile-switch{border:1px solid #fed7aa;border-radius:20px;background:#fff7ed;color:#1c1917;padding:18px;box-shadow:0 18px 40px rgba(234,88,12,.12);font-family:inherit}.absolute-voice-profile-switch--switch{border-color:#fdba74}.absolute-voice-profile-switch--stay{border-color:#86efac;background:#f0fdf4}.absolute-voice-profile-switch--warn,.absolute-voice-profile-switch--error{border-color:#fca5a5;background:#fff1f2}.absolute-voice-profile-switch__header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-profile-switch__eyebrow{color:#c2410c;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-profile-switch__label{font-size:24px;line-height:1}.absolute-voice-profile-switch__description,.absolute-voice-profile-switch__body em,.absolute-voice-profile-switch__empty{color:#57534e}.absolute-voice-profile-switch__body{background:#fff;border:1px solid #fed7aa;border-radius:16px;margin-top:14px;padding:14px}.absolute-voice-profile-switch__body p{margin:.35rem 0}.absolute-voice-profile-switch__body ul{margin:.75rem 0;padding-left:1.2rem}.absolute-voice-profile-switch__body em{display:block}.absolute-voice-profile-switch__error{color:#9f1239;font-weight:700}`;

export const mountVoiceProfileSwitchRecommendation = (
  element: Element,
  path = "/api/voice/profile-switch-recommendation",
  options: VoiceProfileSwitchRecommendationWidgetOptions = {},
) => {
  const store = createVoiceProfileSwitchRecommendationStore(path, options);
  const render = () => {
    element.innerHTML = renderVoiceProfileSwitchRecommendationHTML(
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

export const defineVoiceProfileSwitchRecommendationElement = (
  tagName = "absolute-voice-profile-switch",
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
    class AbsoluteVoiceProfileSwitchElement extends HTMLElement {
      private mounted?: ReturnType<
        typeof mountVoiceProfileSwitchRecommendation
      >;

      connectedCallback() {
        const intervalMs = Number(this.getAttribute("interval-ms") ?? 5000);
        this.mounted = mountVoiceProfileSwitchRecommendation(
          this,
          this.getAttribute("path") ??
            "/api/voice/profile-switch-recommendation",
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
