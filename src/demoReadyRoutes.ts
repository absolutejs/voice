import { Elysia } from "elysia";
import type { VoiceOpsStatusReport } from "./opsStatus";
import type { VoicePhoneAgentProductionSmokeReport } from "./phoneAgentProductionSmoke";
import type { VoicePhoneAgentSetupReport } from "./phoneAgent";
import type { VoiceProductionReadinessReport } from "./productionReadiness";

export type VoiceDemoReadyStatus = "fail" | "pass" | "warn";

export type VoiceDemoReadySection = {
  description?: string;
  href?: string;
  label: string;
  status: VoiceDemoReadyStatus;
  value?: number | string;
};

export type VoiceDemoReadyReport = {
  checkedAt: number;
  sections: VoiceDemoReadySection[];
  status: VoiceDemoReadyStatus;
  summary: {
    opsStatus?: Pick<
      VoiceOpsStatusReport,
      "failed" | "passed" | "status" | "total"
    >;
    phoneSetup?: {
      carriers: number;
      ready: boolean;
    };
    phoneSmoke?: {
      issues: number;
      pass: boolean;
      provider?: string;
      sessionId?: string;
    };
    productionReadiness?: {
      checks: number;
      status: VoiceProductionReadinessReport["status"];
    };
  };
  title: string;
};

type VoiceDemoReadyLoader<TValue> =
  | TValue
  | ((input: {
      query: Record<string, unknown>;
      request: Request;
    }) => Promise<TValue | undefined> | TValue | undefined);

export type VoiceDemoReadyRoutesOptions = {
  opsStatus?:
    | false
    | {
        href?: string;
        load: VoiceDemoReadyLoader<VoiceOpsStatusReport>;
      };
  headers?: HeadersInit;
  htmlPath?: false | string;
  name?: string;
  path?: string;
  phoneSetup?:
    | false
    | {
        href?: string;
        load: VoiceDemoReadyLoader<VoicePhoneAgentSetupReport>;
      };
  phoneSmoke?:
    | false
    | {
        href?: string;
        load: VoiceDemoReadyLoader<VoicePhoneAgentProductionSmokeReport>;
      };
  productionReadiness?:
    | false
    | {
        href?: string;
        load: VoiceDemoReadyLoader<VoiceProductionReadinessReport>;
      };
  render?: (report: VoiceDemoReadyReport) => Promise<string> | string;
  title?: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const rollupStatus = (
  sections: VoiceDemoReadySection[],
): VoiceDemoReadyStatus =>
  sections.some((section) => section.status === "fail")
    ? "fail"
    : sections.some((section) => section.status === "warn")
      ? "warn"
      : "pass";

const resolveLoader = async <TValue>(
  loader: VoiceDemoReadyLoader<TValue>,
  input: {
    query: Record<string, unknown>;
    request: Request;
  },
) =>
  typeof loader === "function"
    ? await (
        loader as (input: {
          query: Record<string, unknown>;
          request: Request;
        }) => Promise<TValue | undefined> | TValue | undefined
      )(input)
    : loader;

export const buildVoiceDemoReadyReport = async (
  options: VoiceDemoReadyRoutesOptions,
  input: {
    query?: Record<string, unknown>;
    request?: Request;
  } = {},
): Promise<VoiceDemoReadyReport> => {
  const query = input.query ?? {};
  const request = input.request ?? new Request("http://localhost/");
  const opsStatusOption =
    options.opsStatus === false ? undefined : options.opsStatus;
  const productionReadinessOption =
    options.productionReadiness === false
      ? undefined
      : options.productionReadiness;
  const phoneSetupOption =
    options.phoneSetup === false ? undefined : options.phoneSetup;
  const phoneSmokeOption =
    options.phoneSmoke === false ? undefined : options.phoneSmoke;
  const [opsStatus, productionReadiness, phoneSetup, phoneSmoke] =
    await Promise.all([
      opsStatusOption
        ? resolveLoader(opsStatusOption.load, { query, request })
        : undefined,
      productionReadinessOption
        ? resolveLoader(productionReadinessOption.load, { query, request })
        : undefined,
      phoneSetupOption
        ? resolveLoader(phoneSetupOption.load, { query, request })
        : undefined,
      phoneSmokeOption
        ? resolveLoader(phoneSmokeOption.load, { query, request })
        : undefined,
    ]);
  const sections: VoiceDemoReadySection[] = [];

  if (opsStatus) {
    sections.push({
      description: `${opsStatus.passed}/${opsStatus.total} ops status checks are passing.`,
      href: opsStatusOption?.href,
      label: "Ops status",
      status: opsStatus.status,
      value: `${opsStatus.passed}/${opsStatus.total}`,
    });
  }
  if (productionReadiness) {
    const passing = productionReadiness.checks.filter(
      (check) => check.status === "pass",
    ).length;
    sections.push({
      description: `${passing}/${productionReadiness.checks.length} production readiness checks are passing.`,
      href: productionReadinessOption?.href,
      label: "Production readiness",
      status: productionReadiness.status,
      value: `${passing}/${productionReadiness.checks.length}`,
    });
  }
  if (phoneSetup) {
    sections.push({
      description: `${phoneSetup.carriers.length} carrier setup record(s) are configured.`,
      href: phoneSetupOption?.href,
      label: "Phone setup",
      status: phoneSetup.ready ? "pass" : "fail",
      value: phoneSetup.ready ? "ready" : "not ready",
    });
  }
  if (phoneSmoke) {
    sections.push({
      description: phoneSmoke.pass
        ? "Phone-agent smoke trace proof is passing."
        : phoneSmoke.issues.map((issue) => issue.message).join(" "),
      href: phoneSmokeOption?.href,
      label: "Phone smoke proof",
      status: phoneSmoke.pass ? "pass" : "fail",
      value: phoneSmoke.pass ? "pass" : `${phoneSmoke.issues.length} issue(s)`,
    });
  }

  return {
    checkedAt: Date.now(),
    sections,
    status: sections.length === 0 ? "warn" : rollupStatus(sections),
    summary: {
      opsStatus: opsStatus
        ? {
            failed: opsStatus.failed,
            passed: opsStatus.passed,
            status: opsStatus.status,
            total: opsStatus.total,
          }
        : undefined,
      phoneSetup: phoneSetup
        ? {
            carriers: phoneSetup.carriers.length,
            ready: phoneSetup.ready,
          }
        : undefined,
      phoneSmoke: phoneSmoke
        ? {
            issues: phoneSmoke.issues.length,
            pass: phoneSmoke.pass,
            provider: phoneSmoke.provider,
            sessionId: phoneSmoke.sessionId,
          }
        : undefined,
      productionReadiness: productionReadiness
        ? {
            checks: productionReadiness.checks.length,
            status: productionReadiness.status,
          }
        : undefined,
    },
    title: options.title ?? "AbsoluteJS Voice Demo Ready",
  };
};

export const renderVoiceDemoReadyHTML = (report: VoiceDemoReadyReport) => {
  const sections = report.sections
    .map(
      (section) => `<article class="section ${escapeHtml(section.status)}">
<div><span>${escapeHtml(section.status.toUpperCase())}</span><h2>${escapeHtml(section.label)}</h2>${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}</div>
<strong>${escapeHtml(String(section.value ?? section.status))}</strong>
${section.href ? `<a href="${escapeHtml(section.href)}">Open</a>` : ""}
</article>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(report.title)}</title><style>body{background:#0d141b;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.2),rgba(245,158,11,.12));border:1px solid #283544;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.sections{display:grid;gap:14px}.section{align-items:center;background:#151d26;border:1px solid #283544;border-radius:22px;display:grid;gap:16px;grid-template-columns:1fr auto auto;padding:18px}.section span{color:#aab5c0;font-size:.78rem;font-weight:900;letter-spacing:.08em}.section h2{margin:.2rem 0}.section p{color:#b9c0c8;margin:.2rem 0 0}.section strong{font-size:1.4rem}.pass{border-color:rgba(34,197,94,.55)}.warn{border-color:rgba(245,158,11,.65)}.fail{border-color:rgba(239,68,68,.75)}a{color:#5eead4}@media(max-width:760px){main{padding:20px}.section{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Demo readiness</p><h1>${escapeHtml(report.title)}</h1><p>One customer-facing checklist for the self-hosted voice proof surfaces: ops status, production readiness, phone setup, and phone smoke traces.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>Checked ${escapeHtml(new Date(report.checkedAt).toLocaleString())}</p></section><section class="sections">${sections || '<article class="section warn"><div><span>WARN</span><h2>No checks configured</h2><p>Add ops status, production readiness, phone setup, or phone smoke loaders.</p></div><strong>warn</strong></article>'}</section></main></body></html>`;
};

export const createVoiceDemoReadyRoutes = (
  options: VoiceDemoReadyRoutesOptions,
) => {
  const path = options.path ?? "/api/demo-ready";
  const htmlPath = options.htmlPath ?? "/demo-ready";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-demo-ready",
  });

  routes.get(path, async ({ query, request }) =>
    buildVoiceDemoReadyReport(options, { query, request }),
  );
  if (htmlPath !== false) {
    routes.get(htmlPath, async ({ query, request }) => {
      const report = await buildVoiceDemoReadyReport(options, {
        query,
        request,
      });
      const body = await (options.render ?? renderVoiceDemoReadyHTML)(report);

      return new Response(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...options.headers,
        },
      });
    });
  }

  return routes;
};
