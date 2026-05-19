export type VoiceHTMXPollingAttributes = {
  /** Set true to emit hx-get/hx-trigger when refreshUrl is also provided. */
  poll?: boolean;
  /** Polling cadence. Default 5_000ms. Clamped to >= 1_000ms. */
  pollIntervalMs?: number;
  /** Extra HTMX attributes to splice in. Keys without the 'hx-' prefix have it added. */
  pushAttributes?: Record<string, string>;
  /** URL hx-get fires against. Without it, polling is skipped. */
  refreshUrl?: string;
  /** hx-swap value. Default 'outerHTML'. */
  swap?: string;
  /** Optional hx-target selector. */
  target?: string;
};

const escapeAttr = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeHxKey = (key: string) =>
  key.startsWith("hx-") ? key : `hx-${key}`;

export const buildVoiceHTMXAttributes = (
  attrs: VoiceHTMXPollingAttributes | undefined,
): string => {
  if (!attrs) return "";
  const out: string[] = [];
  if (attrs.poll && attrs.refreshUrl) {
    const intervalSec = Math.max(
      1,
      Math.round((attrs.pollIntervalMs ?? 5_000) / 1_000),
    );
    out.push(`hx-get="${escapeAttr(attrs.refreshUrl)}"`);
    out.push(`hx-trigger="every ${intervalSec}s"`);
    out.push(`hx-swap="${escapeAttr(attrs.swap ?? "outerHTML")}"`);
    if (attrs.target) {
      out.push(`hx-target="${escapeAttr(attrs.target)}"`);
    }
  } else if (attrs.swap || attrs.target) {
    if (attrs.swap) out.push(`hx-swap="${escapeAttr(attrs.swap)}"`);
    if (attrs.target) out.push(`hx-target="${escapeAttr(attrs.target)}"`);
  }
  for (const [rawKey, value] of Object.entries(attrs.pushAttributes ?? {})) {
    const key = normalizeHxKey(rawKey);
    out.push(`${key}="${escapeAttr(value)}"`);
  }
  return out.length === 0 ? "" : ` ${out.join(" ")}`;
};

const FIRST_TAG_RE = /^(\s*)<([a-zA-Z][\w-]*)((?:\s|>|\/))/;

/**
 * Injects HTMX polling attributes into the first opening tag of an HTML string.
 * Returns the original HTML unchanged when attrs produce no attributes.
 */
export const wrapVoiceHTMLWithHTMXPolling = (
  html: string,
  attrs: VoiceHTMXPollingAttributes | undefined,
): string => {
  const attrString = buildVoiceHTMXAttributes(attrs);
  if (!attrString) return html;
  const match = FIRST_TAG_RE.exec(html);
  if (!match) return html;
  const [matched, leading, tag, terminator] = match;
  const replaced = `${leading}<${tag}${attrString}${terminator}`;
  return html.replace(matched, replaced);
};

/**
 * Wraps arbitrary HTML in a self-refreshing div that polls refreshUrl.
 * Use this when the inner HTML doesn't have a stable root element to mutate.
 */
export const wrapVoiceHTMLInHTMXContainer = (
  html: string,
  attrs: VoiceHTMXPollingAttributes & {
    className?: string;
    elementTag?: string;
  },
): string => {
  const tag = attrs.elementTag ?? "div";
  const classAttr = attrs.className
    ? ` class="${escapeAttr(attrs.className)}"`
    : "";
  const hx = buildVoiceHTMXAttributes(attrs);
  return `<${tag}${classAttr}${hx}>${html}</${tag}>`;
};
