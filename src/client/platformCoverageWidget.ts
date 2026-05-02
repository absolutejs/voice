import type { VoicePlatformCoverageSurface } from "../platformCoverage";
import {
  createVoicePlatformCoverageStore,
  type VoicePlatformCoverageClientOptions,
  type VoicePlatformCoverageSnapshot,
} from "./platformCoverage";

export type VoicePlatformCoverageSurfaceView = VoicePlatformCoverageSurface & {
  detail: string;
  label: string;
};

export type VoicePlatformCoverageViewModel = {
  description: string;
  error: string | null;
  isLoading: boolean;
  label: string;
  links: Array<{ href: string; label: string }>;
  status: "empty" | "error" | "loading" | "ready" | "warning";
  surfaces: VoicePlatformCoverageSurfaceView[];
  title: string;
  updatedAt?: number;
};

export type VoicePlatformCoverageWidgetOptions =
  VoicePlatformCoverageClientOptions & {
    description?: string;
    links?: Array<{ href: string; label: string }>;
    limit?: number;
    title?: string;
  };

const DEFAULT_TITLE = "Platform Replacement Coverage";
const DEFAULT_DESCRIPTION =
  "Code-owned coverage for hosted voice-platform surfaces, backed by the same proof routes used by release evidence.";
const DEFAULT_LINKS = [
  { href: "/switching-from-vapi", label: "Switching guide" },
  { href: "/api/voice/vapi-coverage", label: "Coverage JSON" },
];

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatStatus = (status: string) =>
  status
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const surfaceDetail = (surface: VoicePlatformCoverageSurface) => {
  if (surface.status === "pass") {
    return surface.replacement;
  }
  if (surface.gap) {
    return surface.gap;
  }
  if (surface.missingEvidence?.length) {
    return `Missing evidence: ${surface.missingEvidence.join(", ")}`;
  }
  return surface.replacement;
};

export const createVoicePlatformCoverageViewModel = (
  snapshot: VoicePlatformCoverageSnapshot,
  options: VoicePlatformCoverageWidgetOptions = {},
): VoicePlatformCoverageViewModel => {
  const allSurfaces = snapshot.report?.coverage ?? [];
  const failing = allSurfaces.filter((surface) => surface.status !== "pass");
  const limit = options.limit ?? 6;
  const surfaces = allSurfaces.slice(0, limit).map((surface) => ({
    ...surface,
    detail: surfaceDetail(surface),
    label: surface.surface,
  }));

  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    error: snapshot.error,
    isLoading: snapshot.isLoading,
    label: snapshot.error
      ? "Unavailable"
      : snapshot.report
        ? failing.length
          ? `${failing.length} gaps`
          : `${snapshot.report.total} surfaces passing`
        : snapshot.isLoading
          ? "Checking"
          : "No coverage report",
    links: options.links ?? DEFAULT_LINKS,
    status: snapshot.error
      ? "error"
      : snapshot.report
        ? failing.length
          ? "warning"
          : "ready"
        : snapshot.isLoading
          ? "loading"
          : "empty",
    surfaces,
    title: options.title ?? DEFAULT_TITLE,
    updatedAt: snapshot.updatedAt,
  };
};

export const renderVoicePlatformCoverageHTML = (
  snapshot: VoicePlatformCoverageSnapshot,
  options: VoicePlatformCoverageWidgetOptions = {},
) => {
  const model = createVoicePlatformCoverageViewModel(snapshot, options);
  const surfaces = model.surfaces.length
    ? `<div class="absolute-voice-platform-coverage__surfaces">${model.surfaces
        .map(
          (
            surface,
          ) => `<article class="absolute-voice-platform-coverage__surface absolute-voice-platform-coverage__surface--${escapeHtml(surface.status)}">
  <header>
    <strong>${escapeHtml(surface.label)}</strong>
    <span>${escapeHtml(formatStatus(surface.status))}</span>
  </header>
  <p>${escapeHtml(surface.detail)}</p>
  <small>${surface.evidence.filter((item) => item.ok).length}/${surface.evidence.length} evidence checks passing</small>
</article>`,
        )
        .join("")}</div>`
    : `<p class="absolute-voice-platform-coverage__empty">${
        model.error
          ? escapeHtml(model.error)
          : "Run the proof pack to populate platform coverage evidence."
      }</p>`;
  const links = model.links.length
    ? `<p class="absolute-voice-platform-coverage__links">${model.links
        .map(
          (link) =>
            `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
        )
        .join("")}</p>`
    : "";

  return `<section class="absolute-voice-platform-coverage absolute-voice-platform-coverage--${escapeHtml(model.status)}">
  <header class="absolute-voice-platform-coverage__header">
    <span class="absolute-voice-platform-coverage__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-platform-coverage__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-platform-coverage__description">${escapeHtml(model.description)}</p>
  ${surfaces}
  ${links}
  ${model.error ? `<p class="absolute-voice-platform-coverage__error">${escapeHtml(model.error)}</p>` : ""}
</section>`;
};

export const getVoicePlatformCoverageCSS = () =>
  `.absolute-voice-platform-coverage{border:1px solid #c7d2fe;border-radius:20px;background:#f8fbff;color:#111827;padding:18px;box-shadow:0 18px 40px rgba(30,64,175,.12);font-family:inherit}.absolute-voice-platform-coverage--warning,.absolute-voice-platform-coverage--error{border-color:#f2a7a7;background:#fff7f4}.absolute-voice-platform-coverage__header,.absolute-voice-platform-coverage__surface header{align-items:start;display:flex;gap:12px;justify-content:space-between}.absolute-voice-platform-coverage__eyebrow{color:#1d4ed8;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.absolute-voice-platform-coverage__label{font-size:24px;line-height:1}.absolute-voice-platform-coverage__description,.absolute-voice-platform-coverage__surface p,.absolute-voice-platform-coverage__surface small,.absolute-voice-platform-coverage__empty{color:#475569}.absolute-voice-platform-coverage__surfaces{display:grid;gap:10px;margin-top:14px}.absolute-voice-platform-coverage__surface{background:#fff;border:1px solid #dbeafe;border-radius:16px;padding:12px}.absolute-voice-platform-coverage__surface--pass{border-color:#86efac}.absolute-voice-platform-coverage__surface--fail,.absolute-voice-platform-coverage__surface--missing,.absolute-voice-platform-coverage__surface--stale{border-color:#f2a7a7}.absolute-voice-platform-coverage__surface p{margin:8px 0}.absolute-voice-platform-coverage__surface span{text-transform:capitalize}.absolute-voice-platform-coverage__links{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}.absolute-voice-platform-coverage__links a{border:1px solid #bfdbfe;border-radius:999px;color:#1d4ed8;font-weight:800;padding:6px 10px;text-decoration:none}.absolute-voice-platform-coverage__error{color:#9f1239;font-weight:700}`;

export const mountVoicePlatformCoverage = (
  element: Element,
  path = "/api/voice/platform-coverage",
  options: VoicePlatformCoverageWidgetOptions = {},
) => {
  const store = createVoicePlatformCoverageStore(path, options);
  const render = () => {
    element.innerHTML = renderVoicePlatformCoverageHTML(
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

export const defineVoicePlatformCoverageElement = (
  tagName = "absolute-voice-platform-coverage",
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
    class AbsoluteVoicePlatformCoverageElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoicePlatformCoverage>;

      connectedCallback() {
        this.mounted = mountVoicePlatformCoverage(
          this,
          this.getAttribute("path") ?? "/api/voice/platform-coverage",
          {
            description: this.getAttribute("description") ?? undefined,
            intervalMs:
              Number(this.getAttribute("interval-ms") ?? 0) || undefined,
            limit: Number(this.getAttribute("limit") ?? 0) || undefined,
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
