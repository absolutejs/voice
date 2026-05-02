import { Elysia } from "elysia";

export type VoiceBrowserCallProfileStatus =
  | "empty"
  | "fail"
  | "pass"
  | "stale"
  | "warn";

export type VoiceBrowserCallProfileFrameworkSummary = {
  messageCount?: number;
  openSockets?: number;
  receivedBytes?: number;
  sentBytes?: number;
};

export type VoiceBrowserCallProfileFrameworkEvidence = {
  error?: string;
  framework: string;
  ok?: boolean;
  summary?: VoiceBrowserCallProfileFrameworkSummary;
  url?: string;
};

export type VoiceBrowserCallProfileSummary = {
  failedFrameworks: string[];
  openSockets: number;
  passedFrameworks: string[];
  receivedBytes: number;
  sentBytes: number;
  totalFrameworks: number;
  totalMessages: number;
};

export type VoiceBrowserCallProfileReportInput = {
  ageMs?: number;
  baseUrl?: string;
  frameworks?: string[];
  freshUntil?: string;
  generatedAt?: string;
  maxAgeMs?: number;
  now?: Date | number | string;
  ok?: boolean;
  outputDir?: string;
  profileId?: string;
  results?: VoiceBrowserCallProfileFrameworkEvidence[];
  runId?: string;
  source?: string;
  status?: VoiceBrowserCallProfileStatus;
  summary?: Partial<VoiceBrowserCallProfileSummary> &
    VoiceBrowserCallProfileFrameworkSummary;
};

export type VoiceBrowserCallProfileReport = {
  ageMs?: number;
  baseUrl?: string;
  frameworks: string[];
  freshUntil?: string;
  generatedAt: string;
  maxAgeMs: number;
  ok: boolean;
  outputDir?: string;
  profileId: string;
  results: VoiceBrowserCallProfileFrameworkEvidence[];
  runId?: string;
  source: string;
  status: VoiceBrowserCallProfileStatus;
  summary: VoiceBrowserCallProfileSummary;
};

export type VoiceBrowserCallProfileAssertionInput = {
  maxAgeMs?: number;
  minMessageCountPerFramework?: number;
  minOpenSocketsPerFramework?: number;
  minSentBytesPerFramework?: number;
  requireAllFrameworksPass?: boolean;
  requiredFrameworks?: string[];
};

export type VoiceBrowserCallProfileAssertionReport = {
  failedFrameworks: string[];
  issues: string[];
  ok: boolean;
  passedFrameworks: string[];
  status: VoiceBrowserCallProfileStatus;
  summary: VoiceBrowserCallProfileSummary;
};

export type VoiceBrowserCallProfileRoutesOptions = {
  headers?: HeadersInit;
  htmlPath?: false | string;
  jsonPath?: string;
  markdownPath?: false | string;
  maxAgeMs?: number;
  name?: string;
  source?:
    | (() =>
        | Promise<
            VoiceBrowserCallProfileReport | VoiceBrowserCallProfileReportInput
          >
        | VoiceBrowserCallProfileReport
        | VoiceBrowserCallProfileReportInput)
    | VoiceBrowserCallProfileReport
    | VoiceBrowserCallProfileReportInput;
  title?: string;
};

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toTime = (
  value: Date | number | string | undefined,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
};

const uniqueStrings = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => !!value)));

const normalizeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const summarizeResults = (
  results: VoiceBrowserCallProfileFrameworkEvidence[],
  inputSummary: VoiceBrowserCallProfileReportInput["summary"],
): VoiceBrowserCallProfileSummary => {
  const passedFrameworks = uniqueStrings(
    results
      .filter((result) => result.ok === true)
      .map((result) => result.framework),
  );
  const failedFrameworks = uniqueStrings(
    results
      .filter((result) => result.ok === false)
      .map((result) => result.framework),
  );
  const totals = results.reduce(
    (summary, result) => ({
      messageCount:
        summary.messageCount + normalizeNumber(result.summary?.messageCount),
      openSockets:
        summary.openSockets + normalizeNumber(result.summary?.openSockets),
      receivedBytes:
        summary.receivedBytes + normalizeNumber(result.summary?.receivedBytes),
      sentBytes: summary.sentBytes + normalizeNumber(result.summary?.sentBytes),
    }),
    { messageCount: 0, openSockets: 0, receivedBytes: 0, sentBytes: 0 },
  );

  return {
    failedFrameworks:
      inputSummary?.failedFrameworks && inputSummary.failedFrameworks.length > 0
        ? inputSummary.failedFrameworks
        : failedFrameworks,
    openSockets:
      normalizeNumber(inputSummary?.openSockets) || totals.openSockets,
    passedFrameworks:
      inputSummary?.passedFrameworks && inputSummary.passedFrameworks.length > 0
        ? inputSummary.passedFrameworks
        : passedFrameworks,
    receivedBytes:
      normalizeNumber(inputSummary?.receivedBytes) || totals.receivedBytes,
    sentBytes: normalizeNumber(inputSummary?.sentBytes) || totals.sentBytes,
    totalFrameworks:
      normalizeNumber(inputSummary?.totalFrameworks) || results.length,
    totalMessages:
      normalizeNumber(inputSummary?.totalMessages) ||
      normalizeNumber(inputSummary?.messageCount) ||
      totals.messageCount,
  };
};

export const buildVoiceBrowserCallProfileReport = (
  input: VoiceBrowserCallProfileReportInput = {},
): VoiceBrowserCallProfileReport => {
  const generatedAtTime = toTime(input.generatedAt) ?? Date.now();
  const generatedAt = new Date(generatedAtTime).toISOString();
  const now = toTime(input.now) ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const ageMs = Math.max(0, input.ageMs ?? now - generatedAtTime);
  const stale = ageMs > maxAgeMs;
  const results = input.results ?? [];
  const frameworks = uniqueStrings([
    ...(input.frameworks ?? []),
    ...results.map((result) => result.framework),
  ]);
  const summary = summarizeResults(results, input.summary);
  const hasFailures =
    results.some((result) => result.ok === false) ||
    summary.failedFrameworks.length > 0;
  const allFrameworksPassed =
    frameworks.length > 0 &&
    frameworks.every((framework) =>
      summary.passedFrameworks.includes(framework),
    );
  const status: VoiceBrowserCallProfileStatus =
    input.status ??
    (results.length === 0
      ? "empty"
      : stale
        ? "stale"
        : hasFailures
          ? "fail"
          : allFrameworksPassed
            ? "pass"
            : "warn");

  return {
    ageMs,
    baseUrl: input.baseUrl,
    frameworks,
    freshUntil:
      input.freshUntil ?? new Date(generatedAtTime + maxAgeMs).toISOString(),
    generatedAt,
    maxAgeMs,
    ok: input.ok ?? status === "pass",
    outputDir: input.outputDir,
    profileId: input.profileId ?? "browser-call-framework-parity",
    results,
    runId: input.runId,
    source: input.source ?? "browser-call-profile",
    status,
    summary,
  };
};

export const evaluateVoiceBrowserCallProfileEvidence = (
  report: VoiceBrowserCallProfileReport | VoiceBrowserCallProfileReportInput,
  input: VoiceBrowserCallProfileAssertionInput = {},
): VoiceBrowserCallProfileAssertionReport => {
  const normalized = buildVoiceBrowserCallProfileReport(report);
  const issues: string[] = [];
  const requiredFrameworks =
    input.requiredFrameworks && input.requiredFrameworks.length > 0
      ? input.requiredFrameworks
      : normalized.frameworks;
  const minOpenSockets = input.minOpenSocketsPerFramework ?? 1;
  const minSentBytes = input.minSentBytesPerFramework ?? 1;
  const minMessages = input.minMessageCountPerFramework ?? 0;
  const maxAgeMs = input.maxAgeMs ?? normalized.maxAgeMs;

  if (normalized.ageMs !== undefined && normalized.ageMs > maxAgeMs) {
    issues.push(
      `Browser call profile is stale: ${normalized.ageMs}ms exceeds ${maxAgeMs}ms.`,
    );
  }

  for (const framework of requiredFrameworks) {
    const result = normalized.results.find(
      (candidate) => candidate.framework === framework,
    );

    if (!result) {
      issues.push(`Missing browser call evidence for ${framework}.`);
      continue;
    }

    if (result.ok !== true) {
      issues.push(
        `${framework} browser call did not pass${result.error ? `: ${result.error}` : "."}`,
      );
    }

    if (normalizeNumber(result.summary?.openSockets) < minOpenSockets) {
      issues.push(
        `${framework} opened ${normalizeNumber(result.summary?.openSockets)} WebSocket(s); expected at least ${minOpenSockets}.`,
      );
    }

    if (normalizeNumber(result.summary?.sentBytes) < minSentBytes) {
      issues.push(
        `${framework} sent ${normalizeNumber(result.summary?.sentBytes)} byte(s); expected at least ${minSentBytes}.`,
      );
    }

    if (normalizeNumber(result.summary?.messageCount) < minMessages) {
      issues.push(
        `${framework} observed ${normalizeNumber(result.summary?.messageCount)} WebSocket message(s); expected at least ${minMessages}.`,
      );
    }
  }

  if (input.requireAllFrameworksPass ?? true) {
    for (const framework of normalized.frameworks) {
      if (!normalized.summary.passedFrameworks.includes(framework)) {
        issues.push(`${framework} is listed but not passing.`);
      }
    }
  }

  return {
    failedFrameworks: normalized.summary.failedFrameworks,
    issues: Array.from(new Set(issues)),
    ok: issues.length === 0 && normalized.status === "pass",
    passedFrameworks: normalized.summary.passedFrameworks,
    status: normalized.status,
    summary: normalized.summary,
  };
};

export const assertVoiceBrowserCallProfileEvidence = (
  report: VoiceBrowserCallProfileReport | VoiceBrowserCallProfileReportInput,
  input: VoiceBrowserCallProfileAssertionInput = {},
) => {
  const assertion = evaluateVoiceBrowserCallProfileEvidence(report, input);

  if (!assertion.ok) {
    throw new Error(
      assertion.issues.join("\n") || "Browser call profile failed.",
    );
  }

  return assertion;
};

export const renderVoiceBrowserCallProfileMarkdown = (
  report: VoiceBrowserCallProfileReport | VoiceBrowserCallProfileReportInput,
  options: { title?: string } = {},
) => {
  const normalized = buildVoiceBrowserCallProfileReport(report);
  const title = options.title ?? "Voice Browser Call Profiles";
  const rows = normalized.results
    .map(
      (result) =>
        `| ${result.framework} | ${result.ok ? "pass" : "fail"} | ${result.summary?.openSockets ?? 0} | ${result.summary?.sentBytes ?? 0} | ${result.summary?.receivedBytes ?? 0} | ${result.summary?.messageCount ?? 0} | ${result.error ?? ""} |`,
    )
    .join("\n");

  return [
    `# ${title}`,
    "",
    `Status: ${normalized.status}`,
    `Generated: ${normalized.generatedAt}`,
    `Fresh until: ${normalized.freshUntil ?? "unknown"}`,
    "",
    `Passed frameworks: ${normalized.summary.passedFrameworks.join(", ") || "none"}`,
    `Failed frameworks: ${normalized.summary.failedFrameworks.join(", ") || "none"}`,
    "",
    "| Framework | Status | WebSockets | Sent bytes | Received bytes | Messages | Error |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    rows || "| none | empty | 0 | 0 | 0 | 0 |  |",
  ].join("\n");
};

export const renderVoiceBrowserCallProfileHTML = (
  report: VoiceBrowserCallProfileReport | VoiceBrowserCallProfileReportInput,
  options: { title?: string } = {},
) => {
  const normalized = buildVoiceBrowserCallProfileReport(report);
  const title = options.title ?? "Voice Browser Call Profiles";
  const rows = normalized.results
    .map(
      (result) =>
        `<tr><td>${escapeHtml(result.framework)}</td><td class="${result.ok ? "pass" : "fail"}">${result.ok ? "pass" : "fail"}</td><td>${String(result.summary?.openSockets ?? 0)}</td><td>${String(result.summary?.sentBytes ?? 0)}</td><td>${String(result.summary?.receivedBytes ?? 0)}</td><td>${String(result.summary?.messageCount ?? 0)}</td><td>${escapeHtml(result.error ?? "")}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#11140f;color:#f4f0df;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1120px;padding:32px}.hero,.primitive,table{background:#191d15;border:1px solid #323a27;border-radius:22px;margin-bottom:16px}.hero,.primitive{padding:22px}.eyebrow{color:#bef264;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.status{border:1px solid #64748b;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.pass{color:#bef264}.warn,.empty,.stale{color:#fde68a}.fail{color:#fecaca}.metrics{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-top:18px}.metric{background:#10130d;border:1px solid #303827;border-radius:16px;padding:14px}.metric span{color:#b8c3a3}.metric strong{display:block;font-size:1.7rem;margin-top:4px}.primitive code{color:#d9f99d}table{border-collapse:collapse;overflow:hidden;width:100%}td,th{border-bottom:1px solid #323a27;padding:10px;text-align:left}</style></head><body><main><section class="hero"><p class="eyebrow">Real browser microphone proof</p><h1>${escapeHtml(title)}</h1><p class="status ${escapeHtml(normalized.status)}">Status: ${escapeHtml(normalized.status)}</p><p>Framework parity proof from real browser pages opening the voice WebSocket and sending microphone audio bytes.</p><section class="metrics"><div class="metric"><span>Frameworks</span><strong>${String(normalized.summary.totalFrameworks)}</strong></div><div class="metric"><span>Passing</span><strong>${String(normalized.summary.passedFrameworks.length)}</strong></div><div class="metric"><span>Open sockets</span><strong>${String(normalized.summary.openSockets)}</strong></div><div class="metric"><span>Sent bytes</span><strong>${String(normalized.summary.sentBytes)}</strong></div><div class="metric"><span>Received bytes</span><strong>${String(normalized.summary.receivedBytes)}</strong></div><div class="metric"><span>Messages</span><strong>${String(normalized.summary.totalMessages)}</strong></div></section></section><section class="primitive"><p class="eyebrow">Copy into your app</p><p><code>buildVoiceBrowserCallProfileReport(...)</code> normalizes browser-call evidence. <code>evaluateVoiceBrowserCallProfileEvidence(...)</code> gates required frameworks, WebSocket opens, sent bytes, and freshness. <code>createVoiceBrowserCallProfileRoutes(...)</code> serves JSON, HTML, and Markdown.</p></section><table><thead><tr><th>Framework</th><th>Status</th><th>WebSockets</th><th>Sent bytes</th><th>Received bytes</th><th>Messages</th><th>Error</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No browser call profile evidence yet.</td></tr>'}</tbody></table></main></body></html>`;
};

const resolveSource = async (
  options: VoiceBrowserCallProfileRoutesOptions,
): Promise<VoiceBrowserCallProfileReport> => {
  const source =
    typeof options.source === "function"
      ? await options.source()
      : options.source;

  return buildVoiceBrowserCallProfileReport({
    maxAgeMs: options.maxAgeMs,
    ...(source ?? {}),
  });
};

export const createVoiceBrowserCallProfileRoutes = (
  options: VoiceBrowserCallProfileRoutesOptions = {},
) => {
  const jsonPath = options.jsonPath ?? "/api/voice/browser-call-profiles";
  const htmlPath =
    options.htmlPath === undefined
      ? "/voice/browser-call-profiles"
      : options.htmlPath;
  const markdownPath =
    options.markdownPath === undefined
      ? "/voice/browser-call-profiles.md"
      : options.markdownPath;
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-browser-call-profiles",
  });

  routes.get(jsonPath, () => resolveSource(options));

  if (htmlPath) {
    routes.get(htmlPath, async () => {
      const report = await resolveSource(options);

      return new Response(renderVoiceBrowserCallProfileHTML(report, options), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  if (markdownPath) {
    routes.get(markdownPath, async () => {
      const report = await resolveSource(options);

      return new Response(
        renderVoiceBrowserCallProfileMarkdown(report, options),
        {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            ...options.headers,
          },
        },
      );
    });
  }

  return routes;
};
