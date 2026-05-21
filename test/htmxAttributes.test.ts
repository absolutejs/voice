import { describe, expect, test } from "bun:test";
import {
  buildVoiceHTMXAttributes,
  wrapVoiceHTMLInHTMXContainer,
  wrapVoiceHTMLWithHTMXPolling,
} from "../src/client/htmxAttributes";

describe("buildVoiceHTMXAttributes", () => {
  test("returns empty string when nothing to emit", () => {
    expect(buildVoiceHTMXAttributes(undefined)).toBe("");
    expect(buildVoiceHTMXAttributes({})).toBe("");
  });

  test("emits hx-get + hx-trigger + hx-swap when polling", () => {
    expect(
      buildVoiceHTMXAttributes({
        poll: true,
        pollIntervalMs: 7_000,
        refreshUrl: "/voice/ops",
      }),
    ).toBe(' hx-get="/voice/ops" hx-trigger="every 7s" hx-swap="outerHTML"');
  });

  test("clamps pollIntervalMs to at least 1 second", () => {
    expect(
      buildVoiceHTMXAttributes({
        poll: true,
        pollIntervalMs: 100,
        refreshUrl: "/a",
      }),
    ).toContain('hx-trigger="every 1s"');
  });

  test("honors custom swap + target", () => {
    expect(
      buildVoiceHTMXAttributes({
        poll: true,
        pollIntervalMs: 3_000,
        refreshUrl: "/a",
        swap: "innerHTML",
        target: "#dashboard",
      }),
    ).toContain('hx-target="#dashboard"');
  });

  test("includes pushAttributes with hx- prefix auto-added", () => {
    expect(
      buildVoiceHTMXAttributes({
        pushAttributes: { boost: "true", "hx-on": "click" },
      }),
    ).toBe(' hx-boost="true" hx-on="click"');
  });

  test("escapes attribute values", () => {
    expect(
      buildVoiceHTMXAttributes({
        poll: true,
        pollIntervalMs: 1_000,
        refreshUrl: '"><script>alert(1)</script>',
      }),
    ).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("wrapVoiceHTMLWithHTMXPolling", () => {
  test("injects attributes into the first opening tag", () => {
    const out = wrapVoiceHTMLWithHTMXPolling(
      '<section class="x">hi</section>',
      { poll: true, pollIntervalMs: 5_000, refreshUrl: "/r" },
    );
    expect(out).toBe(
      '<section hx-get="/r" hx-trigger="every 5s" hx-swap="outerHTML" class="x">hi</section>',
    );
  });

  test("returns HTML unchanged when attrs produce nothing", () => {
    const html = "<section>hi</section>";
    expect(wrapVoiceHTMLWithHTMXPolling(html, undefined)).toBe(html);
    expect(wrapVoiceHTMLWithHTMXPolling(html, { poll: true })).toBe(html);
  });

  test("returns HTML unchanged when no first tag is found", () => {
    expect(
      wrapVoiceHTMLWithHTMXPolling("just text", {
        poll: true,
        pollIntervalMs: 5_000,
        refreshUrl: "/r",
      }),
    ).toBe("just text");
  });

  test("works with self-closing tags", () => {
    const out = wrapVoiceHTMLWithHTMXPolling("<input />", {
      poll: true,
      pollIntervalMs: 1_000,
      refreshUrl: "/r",
    });
    expect(out).toContain('hx-get="/r"');
  });
});

describe("wrapVoiceHTMLInHTMXContainer", () => {
  test("wraps content in a div with hx attributes", () => {
    const out = wrapVoiceHTMLInHTMXContainer("<p>inner</p>", {
      className: "ops-status",
      poll: true,
      pollIntervalMs: 4_000,
      refreshUrl: "/voice/ops-status",
    });
    expect(
      out.startsWith('<div class="ops-status" hx-get="/voice/ops-status"'),
    ).toBe(true);
    expect(out).toContain("<p>inner</p>");
    expect(out.endsWith("</div>")).toBe(true);
  });

  test("uses a custom element tag when provided", () => {
    const out = wrapVoiceHTMLInHTMXContainer("inner", {
      elementTag: "article",
      poll: true,
      pollIntervalMs: 1_000,
      refreshUrl: "/x",
    });
    expect(out.startsWith("<article")).toBe(true);
    expect(out.endsWith("</article>")).toBe(true);
  });
});
