import { Elysia } from "elysia";
import type { VoiceReadinessProfileName } from "./readinessProfiles";

export type VoiceProviderStackKind = "llm" | "stt" | "tts";

export type VoiceProviderStackInput<TProvider extends string = string> = {
  profile: VoiceReadinessProfileName;
  providers: Partial<Record<VoiceProviderStackKind, readonly TProvider[]>>;
};

export type VoiceProviderStackChoice<TProvider extends string = string> = {
  alternatives: TProvider[];
  provider?: TProvider;
  reasons: string[];
};

export type VoiceProviderStackRecommendation<
  TProvider extends string = string,
> = {
  profile: VoiceReadinessProfileName;
  reasons: string[];
  recommended: Partial<Record<VoiceProviderStackKind, TProvider>>;
  stacks: Partial<
    Record<VoiceProviderStackKind, VoiceProviderStackChoice<TProvider>>
  >;
};

export type VoiceProviderStackCapabilities<TProvider extends string = string> =
  Partial<
    Record<
      VoiceProviderStackKind,
      Partial<Record<TProvider, readonly string[]>>
    >
  >;

export type VoiceProviderStackCapabilityGap<TProvider extends string = string> =
  {
    kind: VoiceProviderStackKind;
    missing: string[];
    present: string[];
    provider?: TProvider;
    required: string[];
    status: "fail" | "pass" | "warn";
  };

export type VoiceProviderStackCapabilityGapReport<
  TProvider extends string = string,
> = {
  gaps: VoiceProviderStackCapabilityGap<TProvider>[];
  missing: number;
  profile: VoiceReadinessProfileName;
  status: "fail" | "pass" | "warn";
};

export type VoiceProviderStackAssertionInput<
  TProvider extends string = string,
> = {
  maxMissing?: number;
  maxStatus?: VoiceProviderContractCheckStatus;
  requireProviders?: boolean;
  requiredKinds?: VoiceProviderStackKind[];
  requiredProviders?: TProvider[];
  requiredCapabilities?: Partial<
    Record<VoiceProviderStackKind, readonly string[]>
  >;
};

export type VoiceProviderStackAssertionReport<
  TProvider extends string = string,
> = {
  issues: string[];
  kinds: VoiceProviderStackKind[];
  missing: number;
  ok: boolean;
  providers: TProvider[];
  status: VoiceProviderContractCheckStatus;
};

export type VoiceProviderStackCapabilityGapInput<
  TProvider extends string = string,
> = VoiceProviderStackInput<TProvider> & {
  capabilities?: VoiceProviderStackCapabilities<TProvider>;
  recommendation?: VoiceProviderStackRecommendation<TProvider>;
  required?: Partial<Record<VoiceProviderStackKind, readonly string[]>>;
};

export type VoiceProviderContractCheckStatus = "fail" | "pass" | "warn";

export type VoiceProviderContractRemediation = {
  code: string;
  detail: string;
  href?: string;
  label: string;
};

export type VoiceProviderContractCheck = {
  detail?: string;
  key: string;
  label: string;
  remediation?: VoiceProviderContractRemediation;
  status: VoiceProviderContractCheckStatus;
};

export type VoiceProviderContractDefinition<TProvider extends string = string> =
  {
    capabilities?: readonly string[];
    configured?: boolean;
    env?: Record<string, string | undefined>;
    fallbackProviders?: readonly TProvider[];
    kind: VoiceProviderStackKind;
    latencyBudgetMs?: number;
    provider: TProvider;
    requiredCapabilities?: readonly string[];
    requiredEnv?: readonly string[];
    remediationHref?: string;
    selected?: boolean;
    streaming?: boolean;
  };

export type VoiceProviderContractMatrixInput<
  TProvider extends string = string,
> = {
  contracts: readonly VoiceProviderContractDefinition<TProvider>[];
};

export type VoiceProviderContractMatrixPresetOptions<
  TProvider extends string = string,
> = {
  capabilities?: VoiceProviderStackCapabilities<TProvider>;
  configured?: Partial<Record<TProvider, boolean>>;
  env?: Record<string, string | undefined>;
  fallbackProviders?: Partial<
    Record<VoiceProviderStackKind, readonly TProvider[]>
  >;
  latencyBudgets?: Partial<Record<TProvider, number>>;
  providers: Partial<Record<VoiceProviderStackKind, readonly TProvider[]>>;
  remediationHref?: string;
  selected?: Partial<Record<VoiceProviderStackKind, TProvider>>;
  streaming?: Partial<Record<TProvider, boolean>>;
};

export type VoiceProviderContractMatrixHandlerOptions<
  TProvider extends string = string,
> =
  | VoiceProviderContractMatrixInput<TProvider>
  | (() =>
      | Promise<VoiceProviderContractMatrixInput<TProvider>>
      | VoiceProviderContractMatrixInput<TProvider>);

export type VoiceProviderContractMatrixHTMLHandlerOptions<
  TProvider extends string = string,
> = {
  matrix: VoiceProviderContractMatrixHandlerOptions<TProvider>;
  render?: (
    report: VoiceProviderContractMatrixReport<TProvider>,
  ) => string | Promise<string>;
  title?: string;
};

export type VoiceProviderContractMatrixRoutesOptions<
  TProvider extends string = string,
> = VoiceProviderContractMatrixHTMLHandlerOptions<TProvider> & {
  headers?: HeadersInit;
  htmlPath?: false | string;
  name?: string;
  path?: string;
};

export type VoiceProviderContractMatrixRow<TProvider extends string = string> =
  {
    checks: VoiceProviderContractCheck[];
    configured: boolean;
    kind: VoiceProviderStackKind;
    provider: TProvider;
    selected: boolean;
    status: VoiceProviderContractCheckStatus;
  };

export type VoiceProviderContractMatrixReport<
  TProvider extends string = string,
> = {
  failed: number;
  passed: number;
  rows: VoiceProviderContractMatrixRow<TProvider>[];
  status: VoiceProviderContractCheckStatus;
  total: number;
  warned: number;
};

export type VoiceProviderContractMatrixAssertionInput<
  TProvider extends string = string,
> = {
  maxFailed?: number;
  maxStatus?: VoiceProviderContractCheckStatus;
  maxWarned?: number;
  minRows?: number;
  requireAllSelected?: boolean;
  requiredCheckKeys?: string[];
  requiredKinds?: VoiceProviderStackKind[];
  requiredProviders?: TProvider[];
  selectedKinds?: VoiceProviderStackKind[];
};

export type VoiceProviderContractMatrixAssertionReport<
  TProvider extends string = string,
> = {
  failed: number;
  issues: string[];
  kinds: VoiceProviderStackKind[];
  ok: boolean;
  providers: TProvider[];
  selectedKinds: VoiceProviderStackKind[];
  status: VoiceProviderContractCheckStatus;
  total: number;
  warned: number;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const profileProviderPriorities: Record<
  VoiceReadinessProfileName,
  Record<VoiceProviderStackKind, string[]>
> = {
  "meeting-recorder": {
    llm: ["openai", "anthropic", "gemini"],
    stt: ["deepgram", "assemblyai", "openai"],
    tts: ["openai", "elevenlabs"],
  },
  "ops-heavy": {
    llm: ["anthropic", "openai", "gemini"],
    stt: ["deepgram", "assemblyai", "openai"],
    tts: ["openai", "elevenlabs"],
  },
  "phone-agent": {
    llm: ["openai", "anthropic", "gemini"],
    stt: ["deepgram", "assemblyai", "openai"],
    tts: ["openai", "elevenlabs"],
  },
};

const profileProviderReasons: Record<
  VoiceReadinessProfileName,
  Record<VoiceProviderStackKind, string>
> = {
  "meeting-recorder": {
    llm: "meeting-recorder favors strong summarization and extraction quality",
    stt: "meeting-recorder favors accurate long-form transcription",
    tts: "meeting-recorder usually needs optional, low-friction spoken playback",
  },
  "ops-heavy": {
    llm: "ops-heavy deployments favor dependable reasoning for review and escalation flows",
    stt: "ops-heavy deployments keep STT recommendation available for live proof surfaces",
    tts: "ops-heavy deployments keep TTS recommendation available for operator demos",
  },
  "phone-agent": {
    llm: "phone-agent favors low-latency turn handling and tool orchestration",
    stt: "phone-agent favors low-latency realtime transcription",
    tts: "phone-agent favors low-latency spoken response",
  },
};

const profileRequiredCapabilities: Record<
  VoiceReadinessProfileName,
  Record<VoiceProviderStackKind, string[]>
> = {
  "meeting-recorder": {
    llm: ["JSON result shaping", "summarization"],
    stt: ["realtime STT", "smart formatting"],
    tts: ["spoken playback"],
  },
  "ops-heavy": {
    llm: ["tool calling", "JSON result shaping", "fallback routing"],
    stt: ["realtime STT"],
    tts: ["spoken playback"],
  },
  "phone-agent": {
    llm: ["tool calling", "JSON result shaping", "fallback routing"],
    stt: ["realtime STT", "VAD events"],
    tts: ["streaming speech", "barge-in friendly"],
  },
};

const defaultProviderEnv: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  assemblyai: ["ASSEMBLYAI_API_KEY"],
  deepgram: ["DEEPGRAM_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  openai: ["OPENAI_API_KEY"],
};

const defaultStreamingProviders = new Set(["assemblyai", "deepgram", "openai"]);

const defaultProviderCapabilities: Record<string, string[]> = {
  anthropic: ["tool calling", "JSON result shaping", "fallback routing"],
  assemblyai: ["realtime STT", "turn formatting", "fallback STT"],
  deepgram: ["realtime STT", "VAD events", "smart formatting"],
  deterministic: ["offline demo mode", "zero external dependency"],
  emergency: ["spoken playback", "offline fallback"],
  gemini: ["tool calling", "JSON result shaping", "fallback routing"],
  openai: [
    "tool calling",
    "JSON result shaping",
    "fallback routing",
    "streaming speech",
    "barge-in friendly",
    "spoken playback",
  ],
};

const chooseProvider = <TProvider extends string>(
  available: readonly TProvider[],
  priorities: readonly string[],
) =>
  (priorities.find((provider) => available.includes(provider as TProvider)) as
    | TProvider
    | undefined) ?? available[0];

export const recommendVoiceProviderStack = <TProvider extends string = string>(
  input: VoiceProviderStackInput<TProvider>,
): VoiceProviderStackRecommendation<TProvider> => {
  const priorities = profileProviderPriorities[input.profile];
  const stacks: Partial<
    Record<VoiceProviderStackKind, VoiceProviderStackChoice<TProvider>>
  > = {};
  const recommended: Partial<Record<VoiceProviderStackKind, TProvider>> = {};
  const reasons: string[] = [];

  for (const kind of ["llm", "stt", "tts"] as const) {
    const available = input.providers[kind] ?? [];
    const provider = chooseProvider(available, priorities[kind]);
    const alternatives = provider
      ? available.filter((candidate) => candidate !== provider)
      : [...available];
    const kindReasons = [
      profileProviderReasons[input.profile][kind],
      provider
        ? `${provider} is the recommended ${kind.toUpperCase()} provider from the configured set`
        : `no ${kind.toUpperCase()} providers are configured`,
    ];

    if (provider) {
      recommended[kind] = provider;
    }
    stacks[kind] = {
      alternatives,
      provider,
      reasons: kindReasons,
    };
    reasons.push(...kindReasons);
  }

  return {
    profile: input.profile,
    reasons,
    recommended,
    stacks,
  };
};

const rollupContractStatus = (
  checks: readonly VoiceProviderContractCheck[],
): VoiceProviderContractCheckStatus =>
  checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

const statusRank: Record<VoiceProviderContractCheckStatus, number> = {
  pass: 0,
  warn: 1,
  fail: 2,
};

const statusExceeds = (
  actual: VoiceProviderContractCheckStatus,
  max: VoiceProviderContractCheckStatus,
) => statusRank[actual] > statusRank[max];

export const buildVoiceProviderContractMatrix = <
  TProvider extends string = string,
>(
  input: VoiceProviderContractMatrixInput<TProvider>,
): VoiceProviderContractMatrixReport<TProvider> => {
  const rows = input.contracts.map((contract) => {
    const configured = contract.configured !== false;
    const missingEnv = (contract.requiredEnv ?? []).filter(
      (name) => !contract.env?.[name],
    );
    const missingCapabilities = (contract.requiredCapabilities ?? []).filter(
      (capability) =>
        !includesCapability(contract.capabilities ?? [], capability),
    );
    const checks: VoiceProviderContractCheck[] = [
      {
        detail: configured
          ? "Provider is configured for this deployment."
          : "Provider is declared but not configured.",
        key: "configured",
        label: "Configured",
        remediation: configured
          ? undefined
          : {
              code: "provider.configure",
              detail:
                "Enable this provider or remove it from the contract matrix for this deployment.",
              href: contract.remediationHref,
              label: "Configure provider",
            },
        status: configured ? "pass" : "fail",
      },
      {
        detail:
          missingEnv.length === 0
            ? "Required environment is present."
            : `Missing env: ${missingEnv.join(", ")}.`,
        key: "env",
        label: "Required env",
        remediation:
          missingEnv.length === 0
            ? undefined
            : {
                code: "provider.env",
                detail: `Set ${missingEnv.join(", ")} before deploying this provider.`,
                href: contract.remediationHref,
                label: "Add missing env",
              },
        status: missingEnv.length === 0 ? "pass" : "fail",
      },
      {
        detail:
          contract.latencyBudgetMs !== undefined
            ? `Latency budget is ${contract.latencyBudgetMs}ms.`
            : "No latency budget declared.",
        key: "latencyBudget",
        label: "Latency budget",
        remediation:
          contract.latencyBudgetMs !== undefined
            ? undefined
            : {
                code: "provider.latency_budget",
                detail:
                  "Declare latencyBudgetMs so readiness can distinguish expected latency from regressions.",
                href: contract.remediationHref,
                label: "Declare latency budget",
              },
        status: contract.latencyBudgetMs !== undefined ? "pass" : "warn",
      },
      {
        detail:
          (contract.fallbackProviders ?? []).length > 0
            ? `Fallback providers: ${contract.fallbackProviders?.join(", ")}.`
            : "No fallback provider declared.",
        key: "fallback",
        label: "Fallback",
        remediation:
          (contract.fallbackProviders ?? []).length > 0
            ? undefined
            : {
                code: "provider.fallback",
                detail:
                  "Declare at least one fallback provider for this lane or mark this provider as intentionally single-provider.",
                href: contract.remediationHref,
                label: "Add fallback provider",
              },
        status: (contract.fallbackProviders ?? []).length > 0 ? "pass" : "warn",
      },
      {
        detail: contract.streaming
          ? "Streaming is supported."
          : "Streaming support is not declared.",
        key: "streaming",
        label: "Streaming",
        remediation: contract.streaming
          ? undefined
          : {
              code: "provider.streaming",
              detail:
                "Use a streaming-capable adapter for realtime voice, or route this provider only to non-realtime workflows.",
              href: contract.remediationHref,
              label: "Add streaming support",
            },
        status: contract.streaming ? "pass" : "warn",
      },
      {
        detail:
          missingCapabilities.length === 0
            ? "Required capabilities are declared."
            : `Missing capabilities: ${missingCapabilities.join(", ")}.`,
        key: "capabilities",
        label: "Capabilities",
        remediation:
          missingCapabilities.length === 0
            ? undefined
            : {
                code: "provider.capabilities",
                detail: `Declare or implement capabilities: ${missingCapabilities.join(", ")}.`,
                href: contract.remediationHref,
                label: "Add capability coverage",
              },
        status: missingCapabilities.length === 0 ? "pass" : "warn",
      },
    ];
    const status = rollupContractStatus(checks);

    return {
      checks,
      configured,
      kind: contract.kind,
      provider: contract.provider,
      selected: contract.selected === true,
      status,
    } satisfies VoiceProviderContractMatrixRow<TProvider>;
  });
  const failed = rows.filter((row) => row.status === "fail").length;
  const warned = rows.filter((row) => row.status === "warn").length;

  return {
    failed,
    passed: rows.filter((row) => row.status === "pass").length,
    rows,
    status: failed > 0 ? "fail" : warned > 0 ? "warn" : "pass",
    total: rows.length,
    warned,
  };
};

export const evaluateVoiceProviderContractMatrixEvidence = <
  TProvider extends string = string,
>(
  report: VoiceProviderContractMatrixReport<TProvider>,
  input: VoiceProviderContractMatrixAssertionInput<TProvider> = {},
): VoiceProviderContractMatrixAssertionReport<TProvider> => {
  const issues: string[] = [];
  const maxStatus = input.maxStatus ?? "pass";
  const maxFailed = input.maxFailed ?? 0;
  const maxWarned = input.maxWarned ?? 0;
  const minRows = input.minRows ?? 1;
  const requireAllSelected = input.requireAllSelected ?? false;
  const kinds = [...new Set(report.rows.map((row) => row.kind))].sort();
  const providers = [...new Set(report.rows.map((row) => row.provider))].sort();
  const selectedKinds = [
    ...new Set(
      report.rows.filter((row) => row.selected).map((row) => row.kind),
    ),
  ].sort();

  if (statusExceeds(report.status, maxStatus)) {
    issues.push(
      `Expected provider contract matrix status at most ${maxStatus}, found ${report.status}.`,
    );
  }
  if (report.failed > maxFailed) {
    issues.push(
      `Expected at most ${String(maxFailed)} failing provider contract row(s), found ${String(report.failed)}.`,
    );
  }
  if (report.warned > maxWarned) {
    issues.push(
      `Expected at most ${String(maxWarned)} warning provider contract row(s), found ${String(report.warned)}.`,
    );
  }
  if (report.total < minRows) {
    issues.push(
      `Expected at least ${String(minRows)} provider contract row(s), found ${String(report.total)}.`,
    );
  }
  for (const kind of input.requiredKinds ?? []) {
    if (!kinds.includes(kind)) {
      issues.push(`Missing provider contract kind: ${kind}.`);
    }
  }
  for (const provider of input.requiredProviders ?? []) {
    if (!providers.includes(provider)) {
      issues.push(`Missing provider contract provider: ${provider}.`);
    }
  }
  for (const kind of input.selectedKinds ?? []) {
    if (!selectedKinds.includes(kind)) {
      issues.push(`Missing selected provider contract kind: ${kind}.`);
    }
  }
  for (const key of input.requiredCheckKeys ?? []) {
    const missingRows = report.rows.filter(
      (row) => !row.checks.some((check) => check.key === key),
    ).length;
    if (missingRows > 0) {
      issues.push(
        `Provider contract check ${key} is missing from ${String(missingRows)} row(s).`,
      );
    }
  }
  if (requireAllSelected) {
    const unselected = report.rows.filter((row) => !row.selected).length;
    if (unselected > 0) {
      issues.push(
        `Expected every provider contract row to be selected, found ${String(unselected)} unselected row(s).`,
      );
    }
  }

  return {
    failed: report.failed,
    issues,
    kinds,
    ok: issues.length === 0,
    providers,
    selectedKinds,
    status: report.status,
    total: report.total,
    warned: report.warned,
  };
};

export const assertVoiceProviderContractMatrixEvidence = <
  TProvider extends string = string,
>(
  report: VoiceProviderContractMatrixReport<TProvider>,
  input: VoiceProviderContractMatrixAssertionInput<TProvider> = {},
): VoiceProviderContractMatrixAssertionReport<TProvider> => {
  const assertion = evaluateVoiceProviderContractMatrixEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice provider contract matrix assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const createVoiceProviderContractMatrixPreset = <
  TProvider extends string = string,
>(
  profile: VoiceReadinessProfileName,
  options: VoiceProviderContractMatrixPresetOptions<TProvider>,
): VoiceProviderContractMatrixInput<TProvider> => {
  const contracts = (["llm", "stt", "tts"] as const).flatMap((kind) => {
    const providers = options.providers[kind] ?? [];

    return providers.map((provider) => {
      const configured =
        options.configured?.[provider] ??
        (defaultProviderEnv[provider]?.length
          ? defaultProviderEnv[provider].every((name) => options.env?.[name])
          : true);
      const fallbackProviders =
        options.fallbackProviders?.[kind] ??
        providers.filter((candidate) => candidate !== provider);
      const requiredCapabilities = profileRequiredCapabilities[profile][kind];
      const capabilities =
        options.capabilities?.[kind]?.[provider] ??
        defaultProviderCapabilities[provider] ??
        [];
      const requiredEnv = defaultProviderEnv[provider] ?? [];

      return {
        capabilities,
        configured,
        env: options.env,
        fallbackProviders,
        kind,
        latencyBudgetMs: options.latencyBudgets?.[provider],
        provider,
        requiredCapabilities,
        requiredEnv,
        remediationHref: options.remediationHref,
        selected: options.selected?.[kind] === provider,
        streaming:
          options.streaming?.[provider] ??
          defaultStreamingProviders.has(provider),
      } satisfies VoiceProviderContractDefinition<TProvider>;
    });
  });

  return { contracts };
};

const resolveProviderContractMatrixInput = async <
  TProvider extends string = string,
>(
  matrix: VoiceProviderContractMatrixHandlerOptions<TProvider>,
) => (typeof matrix === "function" ? await matrix() : matrix);

export const renderVoiceProviderContractMatrixHTML = <
  TProvider extends string = string,
>(
  report: VoiceProviderContractMatrixReport<TProvider>,
  options: { title?: string } = {},
) => {
  const title = options.title ?? "Voice Provider Contract Matrix";
  const rows = report.rows
    .map((row) => {
      const checks = row.checks
        .map(
          (check) =>
            `<li class="${escapeHtml(check.status)}"><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.detail ?? check.status)}</span>${
              check.remediation
                ? `<em>${check.remediation.href ? `<a href="${escapeHtml(check.remediation.href)}">${escapeHtml(check.remediation.label)}</a>` : escapeHtml(check.remediation.label)}: ${escapeHtml(check.remediation.detail)}</em>`
                : ""
            }</li>`,
        )
        .join("");

      return `<article class="row ${escapeHtml(row.status)}">
  <div>
    <p class="eyebrow">${escapeHtml(row.kind)}${row.selected ? " · selected" : ""}</p>
    <h2>${escapeHtml(row.provider)}</h2>
    <p class="status ${escapeHtml(row.status)}">${escapeHtml(row.status.toUpperCase())}</p>
  </div>
  <ul>${checks}</ul>
</article>`;
    })
    .join("");
  const snippet = escapeHtml(`const providerContracts = () =>
	createVoiceProviderContractMatrixPreset('phone-agent', {
		env: process.env,
		providers: {
			llm: ['openai', 'anthropic', 'gemini'],
			stt: ['deepgram', 'assemblyai'],
			tts: ['openai', 'emergency']
		},
		selected: {
			llm: 'openai',
			stt: 'deepgram',
			tts: 'openai'
		},
		remediationHref: '/provider-contracts'
	});

createVoiceProductionReadinessRoutes({
	links: { providerContracts: '/provider-contracts' },
	providerContractMatrix: () =>
		buildVoiceProviderContractMatrix(providerContracts())
});`);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0f1412;color:#f7f3e8;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.primitive,.row{background:#17201b;border:1px solid #2d3b32;border-radius:24px;margin-bottom:16px;padding:22px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.16),rgba(125,211,252,.12))}.primitive{background:#111814;border-color:#41604a}.eyebrow{color:#86efac;font-size:.78rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);letter-spacing:-.06em;line-height:.9;margin:.2rem 0 1rem}h2{margin:.2rem 0}.summary{display:flex;flex-wrap:wrap;gap:10px}.pill,.status{border:1px solid #3f4f45;border-radius:999px;display:inline-flex;padding:8px 12px}.primitive code{color:#bbf7d0}.primitive p{color:#c8d8ca;line-height:1.55;margin:.45rem 0 0}.primitive pre{background:#08110d;border:1px solid #294132;border-radius:18px;color:#d9f99d;margin:16px 0 0;overflow:auto;padding:16px}.status.pass,.row.pass,.pass{border-color:rgba(34,197,94,.65)}.status.warn,.row.warn,.warn{border-color:rgba(245,158,11,.7)}.status.fail,.row.fail,.fail{border-color:rgba(239,68,68,.75)}.row{display:grid;gap:20px;grid-template-columns:minmax(180px,.45fr) 1fr}.row ul{display:grid;gap:10px;list-style:none;margin:0;padding:0}.row li{background:#111814;border:1px solid #2d3b32;border-radius:16px;display:grid;gap:4px;padding:12px}.row li span{color:#b8c2ba}.row li em{color:#f9d77e;font-style:normal}.row li a{color:#86efac}@media(max-width:760px){main{padding:18px}.row{grid-template-columns:1fr}}</style></head><body><main><section class="hero"><p class="eyebrow">Provider contracts</p><h1>${escapeHtml(title)}</h1><p>Self-hosted provider proof for configured state, required env, latency budgets, fallback, streaming, and declared capabilities.</p><div class="summary"><span class="pill">${String(report.passed)} passing</span><span class="pill">${String(report.warned)} warning</span><span class="pill">${String(report.failed)} failing</span><span class="pill">${String(report.total)} total</span></div></section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoiceProviderContractMatrixPreset(...)</code> builds this matrix</h2><p>Give AbsoluteJS your configured LLM, STT, and TTS providers once. It turns them into deploy-checkable proof for env, fallback, streaming, latency budgets, selected providers, and profile-required capabilities without a hosted dashboard.</p><pre><code>${snippet}</code></pre></section>${rows || '<article class="row"><p>No provider contracts configured.</p></article>'}</main></body></html>`;
};

export const createVoiceProviderContractMatrixJSONHandler =
  <TProvider extends string = string>(
    matrix: VoiceProviderContractMatrixHandlerOptions<TProvider>,
  ) =>
  async () =>
    buildVoiceProviderContractMatrix(
      await resolveProviderContractMatrixInput(matrix),
    );

export const createVoiceProviderContractMatrixHTMLHandler =
  <TProvider extends string = string>(
    options: VoiceProviderContractMatrixHTMLHandlerOptions<TProvider>,
  ) =>
  async () => {
    const report = buildVoiceProviderContractMatrix(
      await resolveProviderContractMatrixInput(options.matrix),
    );
    const body = await (
      options.render ?? renderVoiceProviderContractMatrixHTML
    )(report, { title: options.title });

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  };

export const createVoiceProviderContractMatrixRoutes = <
  TProvider extends string = string,
>(
  options: VoiceProviderContractMatrixRoutesOptions<TProvider>,
) => {
  const path = options.path ?? "/api/provider-contracts";
  const htmlPath = options.htmlPath ?? "/provider-contracts";
  const routes = new Elysia({
    name: options.name ?? "absolutejs-voice-provider-contract-matrix",
  });
  const jsonHandler = createVoiceProviderContractMatrixJSONHandler(
    options.matrix,
  );

  routes.get(path, async () => {
    const report = await jsonHandler();
    return new Response(JSON.stringify(report), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...options.headers,
      },
    });
  });
  if (htmlPath !== false) {
    routes.get(htmlPath, async () => {
      const response =
        await createVoiceProviderContractMatrixHTMLHandler(options)();
      return new Response(response.body, {
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...options.headers,
        },
      });
    });
  }

  return routes;
};

const normalizeCapability = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const includesCapability = (
  capabilities: readonly string[],
  required: string,
) => {
  const normalizedRequired = normalizeCapability(required);

  return capabilities.some((capability) => {
    const normalizedCapability = normalizeCapability(capability);
    return (
      normalizedCapability === normalizedRequired ||
      normalizedCapability.includes(normalizedRequired) ||
      normalizedRequired.includes(normalizedCapability)
    );
  });
};

export const evaluateVoiceProviderStackGaps = <
  TProvider extends string = string,
>(
  input: VoiceProviderStackCapabilityGapInput<TProvider>,
): VoiceProviderStackCapabilityGapReport<TProvider> => {
  const recommendation =
    input.recommendation ?? recommendVoiceProviderStack(input);
  const gaps = (["llm", "stt", "tts"] as const).map((kind) => {
    const required =
      input.required?.[kind] ??
      profileRequiredCapabilities[input.profile][kind];
    const provider = recommendation.recommended[kind];
    const present = provider
      ? [...(input.capabilities?.[kind]?.[provider] ?? [])]
      : [];
    const missing = provider
      ? required.filter(
          (capability) => !includesCapability(present, capability),
        )
      : [...required];

    return {
      kind,
      missing,
      present,
      provider,
      required: [...required],
      status: !provider ? "fail" : missing.length > 0 ? "warn" : "pass",
    } satisfies VoiceProviderStackCapabilityGap<TProvider>;
  });
  const missing = gaps.reduce((total, gap) => total + gap.missing.length, 0);

  return {
    gaps,
    missing,
    profile: input.profile,
    status: gaps.some((gap) => gap.status === "fail")
      ? "fail"
      : gaps.some((gap) => gap.status === "warn")
        ? "warn"
        : "pass",
  };
};

export const evaluateVoiceProviderStackEvidence = <
  TProvider extends string = string,
>(
  report: VoiceProviderStackCapabilityGapReport<TProvider>,
  input: VoiceProviderStackAssertionInput<TProvider> = {},
): VoiceProviderStackAssertionReport<TProvider> => {
  const issues: string[] = [];
  const maxStatus = input.maxStatus ?? "pass";
  const maxMissing = input.maxMissing ?? 0;
  const requireProviders = input.requireProviders ?? true;
  const kinds = [...new Set(report.gaps.map((gap) => gap.kind))].sort();
  const providers = [
    ...new Set(
      report.gaps
        .map((gap) => gap.provider)
        .filter((provider): provider is TProvider => provider !== undefined),
    ),
  ].sort();

  if (statusExceeds(report.status, maxStatus)) {
    issues.push(
      `Expected provider stack status at most ${maxStatus}, found ${report.status}.`,
    );
  }
  if (report.missing > maxMissing) {
    issues.push(
      `Expected at most ${String(maxMissing)} missing provider stack capability/capabilities, found ${String(report.missing)}.`,
    );
  }
  for (const kind of input.requiredKinds ?? []) {
    if (!kinds.includes(kind)) {
      issues.push(`Missing provider stack kind: ${kind}.`);
    }
  }
  for (const provider of input.requiredProviders ?? []) {
    if (!providers.includes(provider)) {
      issues.push(`Missing provider stack provider: ${provider}.`);
    }
  }
  for (const [kind, capabilities] of Object.entries(
    input.requiredCapabilities ?? {},
  ) as Array<[VoiceProviderStackKind, readonly string[]]>) {
    const gap = report.gaps.find((entry) => entry.kind === kind);
    if (!gap) {
      issues.push(`Missing provider stack kind: ${kind}.`);
      continue;
    }
    for (const capability of capabilities) {
      if (!includesCapability(gap.present, capability)) {
        issues.push(
          `Missing provider stack capability for ${kind}: ${capability}.`,
        );
      }
    }
  }
  if (requireProviders) {
    const missingProviders = report.gaps
      .filter((gap) => !gap.provider)
      .map((gap) => gap.kind);
    if (missingProviders.length > 0) {
      issues.push(
        `Missing provider stack provider for kind(s): ${missingProviders.join(", ")}.`,
      );
    }
  }

  return {
    issues,
    kinds,
    missing: report.missing,
    ok: issues.length === 0,
    providers,
    status: report.status,
  };
};

export const assertVoiceProviderStackEvidence = <
  TProvider extends string = string,
>(
  report: VoiceProviderStackCapabilityGapReport<TProvider>,
  input: VoiceProviderStackAssertionInput<TProvider> = {},
): VoiceProviderStackAssertionReport<TProvider> => {
  const assertion = evaluateVoiceProviderStackEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice provider stack assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};
