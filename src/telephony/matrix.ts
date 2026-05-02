import { Elysia } from "elysia";
import {
  evaluateVoiceTelephonyContract,
  type VoiceTelephonyContractOptions,
  type VoiceTelephonyContractReport,
  type VoiceTelephonyProvider,
  type VoiceTelephonySetupStatus,
  type VoiceTelephonySmokeReport,
} from "./contract";

export type VoiceTelephonyCarrierMatrixStatus = "fail" | "pass" | "warn";

export type VoiceTelephonyCarrierMatrixInput<
  TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider,
> = {
  contract?: VoiceTelephonyContractReport<TProvider>;
  name?: string;
  setup: VoiceTelephonySetupStatus<TProvider>;
  smoke?: VoiceTelephonySmokeReport<TProvider>;
};

export type VoiceTelephonyCarrierMatrixEntry<
  TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider,
> = {
  contract: VoiceTelephonyContractReport<TProvider>;
  issues: VoiceTelephonyContractReport<TProvider>["issues"];
  name: string;
  provider: TProvider;
  ready: boolean;
  setup: VoiceTelephonySetupStatus<TProvider>;
  smoke?: VoiceTelephonySmokeReport<TProvider>;
  status: VoiceTelephonyCarrierMatrixStatus;
  summary: {
    errors: number;
    failures: number;
    missing: number;
    warnings: number;
  };
};

export type VoiceTelephonyCarrierMatrix = {
  entries: VoiceTelephonyCarrierMatrixEntry[];
  generatedAt: number;
  pass: boolean;
  summary: {
    contractsPassing: number;
    failing: number;
    providers: number;
    ready: number;
    smokePassing: number;
    warnings: number;
  };
};

export type VoiceTelephonyCarrierMatrixOptions = {
  contract?: VoiceTelephonyContractOptions;
  generatedAt?: number;
  providers: VoiceTelephonyCarrierMatrixInput[];
};

export type VoiceTelephonyCarrierMatrixRoutesOptions = {
  load: (input: {
    query: Record<string, unknown>;
    request: Request;
  }) =>
    | Promise<VoiceTelephonyCarrierMatrixInput[]>
    | VoiceTelephonyCarrierMatrixInput[];
  name?: string;
  path?: string;
  title?: string;
  contract?: VoiceTelephonyContractOptions;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const labelForProvider = (provider: VoiceTelephonyProvider) =>
  provider
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const resolveEntryStatus = (
  contract: VoiceTelephonyContractReport,
  setup: VoiceTelephonySetupStatus,
  smoke: VoiceTelephonySmokeReport | undefined,
): VoiceTelephonyCarrierMatrixStatus => {
  if (!contract.pass || !setup.ready || smoke?.pass === false) {
    return "fail";
  }

  if (
    contract.issues.some((issue) => issue.severity === "warning") ||
    setup.warnings.length > 0 ||
    smoke?.checks.some((check) => check.status === "warn")
  ) {
    return "warn";
  }

  return "pass";
};

export const createVoiceTelephonyCarrierMatrix = (
  options: VoiceTelephonyCarrierMatrixOptions,
): VoiceTelephonyCarrierMatrix => {
  const entries = options.providers.map((provider) => {
    const contract =
      provider.contract ??
      evaluateVoiceTelephonyContract({
        options: options.contract,
        setup: provider.setup,
        smoke: provider.smoke,
      });
    const failures =
      provider.smoke?.checks.filter((check) => check.status === "fail")
        .length ?? 0;
    const warnings =
      contract.issues.filter((issue) => issue.severity === "warning").length +
      (provider.smoke?.checks.filter((check) => check.status === "warn")
        .length ?? 0);
    const errors = contract.issues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const status = resolveEntryStatus(contract, provider.setup, provider.smoke);

    return {
      contract,
      issues: contract.issues,
      name: provider.name ?? labelForProvider(provider.setup.provider),
      provider: provider.setup.provider,
      ready: provider.setup.ready,
      setup: provider.setup,
      smoke: provider.smoke,
      status,
      summary: {
        errors,
        failures,
        missing: provider.setup.missing.length,
        warnings,
      },
    };
  });
  const summary = {
    contractsPassing: entries.filter((entry) => entry.contract.pass).length,
    failing: entries.filter((entry) => entry.status === "fail").length,
    providers: entries.length,
    ready: entries.filter((entry) => entry.ready).length,
    smokePassing: entries.filter((entry) => entry.smoke?.pass).length,
    warnings: entries.reduce(
      (total, entry) => total + entry.summary.warnings,
      0,
    ),
  };

  return {
    entries,
    generatedAt: options.generatedAt ?? Date.now(),
    pass:
      entries.length > 0 && entries.every((entry) => entry.status !== "fail"),
    summary,
  };
};

const badgeStyles: Record<VoiceTelephonyCarrierMatrixStatus, string> = {
  fail: "background:#fee2e2;color:#991b1b;border-color:#fecaca;",
  pass: "background:#dcfce7;color:#166534;border-color:#bbf7d0;",
  warn: "background:#fef3c7;color:#92400e;border-color:#fde68a;",
};

export const renderVoiceTelephonyCarrierMatrixHTML = (
  matrix: VoiceTelephonyCarrierMatrix,
  options: {
    title?: string;
  } = {},
) => `<main style="font-family: ui-sans-serif, system-ui; max-width: 1040px; margin: 40px auto; padding: 0 20px; color: #172033;">
<p style="letter-spacing: .12em; text-transform: uppercase; color: #52606d;">Carrier matrix</p>
<h1 style="font-size: 34px; margin: 0 0 8px;">${escapeHtml(options.title ?? "AbsoluteJS Voice Carrier Matrix")}</h1>
<p style="color:#52606d; margin: 0 0 24px;">${matrix.summary.ready}/${matrix.summary.providers} ready, ${matrix.summary.contractsPassing}/${matrix.summary.providers} contract passing, ${matrix.summary.smokePassing}/${matrix.summary.providers} smoke passing.</p>
<section style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
${matrix.entries
  .map(
    (
      entry,
    ) => `<article style="border:1px solid #d9e2ec; border-radius:18px; padding:18px; background:#fff; box-shadow:0 18px 48px rgba(15,23,42,.08);">
<div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
<h2 style="margin:0; font-size:20px;">${escapeHtml(entry.name)}</h2>
<span style="border:1px solid; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; ${badgeStyles[entry.status]}">${escapeHtml(entry.status.toUpperCase())}</span>
</div>
<dl style="display:grid; grid-template-columns: 1fr 1fr; gap:8px 12px; margin:16px 0;">
<dt style="color:#64748b;">Setup</dt><dd style="margin:0; font-weight:700;">${entry.ready ? "Ready" : "Needs attention"}</dd>
<dt style="color:#64748b;">Signing</dt><dd style="margin:0; font-weight:700;">${entry.setup.signing.configured ? entry.setup.signing.mode : "missing"}</dd>
<dt style="color:#64748b;">Smoke</dt><dd style="margin:0; font-weight:700;">${entry.smoke ? (entry.smoke.pass ? "Pass" : "Fail") : "Missing"}</dd>
<dt style="color:#64748b;">Contract</dt><dd style="margin:0; font-weight:700;">${entry.contract.pass ? "Pass" : "Fail"}</dd>
</dl>
<p style="margin:0 0 8px; color:#475569;"><strong>Stream:</strong> <code>${escapeHtml(entry.setup.urls.stream || "missing")}</code></p>
<p style="margin:0 0 12px; color:#475569;"><strong>Webhook:</strong> <code>${escapeHtml(entry.setup.urls.webhook || "missing")}</code></p>
${
  entry.issues.length
    ? `<ul style="margin:12px 0 0; padding-left:18px;">${entry.issues
        .map(
          (issue) =>
            `<li>${escapeHtml(issue.severity)}: ${escapeHtml(issue.message)}</li>`,
        )
        .join("")}</ul>`
    : '<p style="margin:12px 0 0; color:#166534;">No contract issues.</p>'
}
</article>`,
  )
  .join("")}
</section>
</main>`;

export const createVoiceTelephonyCarrierMatrixRoutes = (
  options: VoiceTelephonyCarrierMatrixRoutesOptions,
) => {
  const path = options.path ?? "/api/voice/telephony/carriers";
  return new Elysia({
    name: options.name ?? "absolutejs-voice-telephony-carrier-matrix",
  }).get(path, async ({ query, request }) => {
    const providers = await options.load({ query, request });
    const matrix = createVoiceTelephonyCarrierMatrix({
      contract: options.contract,
      providers,
    });
    if (query.format === "html") {
      return new Response(
        renderVoiceTelephonyCarrierMatrixHTML(matrix, {
          title: options.title,
        }),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        },
      );
    }

    return matrix;
  });
};
