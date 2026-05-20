/**
 * Escape a value for safe interpolation into HTML text/attributes. Accepts any
 * value (non-strings are stringified) and escapes the five HTML-significant
 * characters.
 */
export const escapeHtml = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
