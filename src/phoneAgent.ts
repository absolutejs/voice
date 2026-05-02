import { Elysia } from "elysia";
import {
  createPlivoVoiceRoutes,
  type PlivoVoiceRoutesOptions,
} from "./telephony/plivo";
import {
  createTelnyxVoiceRoutes,
  type TelnyxVoiceRoutesOptions,
} from "./telephony/telnyx";
import {
  createTwilioVoiceRoutes,
  type TwilioVoiceRoutesOptions,
} from "./telephony/twilio";
import {
  createVoiceTelephonyCarrierMatrix,
  createVoiceTelephonyCarrierMatrixRoutes,
  type VoiceTelephonyCarrierMatrix,
  type VoiceTelephonyCarrierMatrixInput,
  type VoiceTelephonyCarrierMatrixRoutesOptions,
} from "./telephony/matrix";
import {
  createVoicePhoneAgentProductionSmokeRoutes,
  type VoicePhoneAgentProductionSmokeRoutesOptions,
} from "./phoneAgentProductionSmoke";
import {
  evaluateVoiceCampaignDialerProofEvidence,
  type VoiceCampaignDialerProofAssertionReport,
  type VoiceCampaignDialerProofProvider,
  type VoiceCampaignDialerProofReport,
} from "./campaignDialers";
import type {
  VoiceTelephonyContractReport,
  VoiceTelephonyProvider,
} from "./telephony/contract";
import type { VoicePhoneAgentProductionSmokeReport } from "./phoneAgentProductionSmoke";
import type { VoiceSessionRecord } from "./types";

export type VoicePhoneAgentLifecycleStage =
  | "ringing"
  | "answered"
  | "media-started"
  | "transcript"
  | "assistant-response"
  | "transfer"
  | "voicemail"
  | "no-answer"
  | "completed"
  | "failed";

type VoicePhoneAgentCarrierBase = {
  name?: string;
  smokePath?: false | string;
  setupPath?: false | string;
};

export type VoicePhoneAgentTwilioCarrier<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = VoicePhoneAgentCarrierBase & {
  options: TwilioVoiceRoutesOptions<TContext, TSession, TResult>;
  provider: "twilio";
};

export type VoicePhoneAgentTelnyxCarrier<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = VoicePhoneAgentCarrierBase & {
  options?: TelnyxVoiceRoutesOptions<TContext, TSession, TResult>;
  provider: "telnyx";
};

export type VoicePhoneAgentPlivoCarrier<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = VoicePhoneAgentCarrierBase & {
  options?: PlivoVoiceRoutesOptions<TContext, TSession, TResult>;
  provider: "plivo";
};

export type VoicePhoneAgentCarrier<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> =
  | VoicePhoneAgentTwilioCarrier<TContext, TSession, TResult>
  | VoicePhoneAgentTelnyxCarrier<TContext, TSession, TResult>
  | VoicePhoneAgentPlivoCarrier<TContext, TSession, TResult>;

export type VoicePhoneAgentRoutesOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  carriers: readonly VoicePhoneAgentCarrier<TContext, TSession, TResult>[];
  matrix?: false | Omit<VoiceTelephonyCarrierMatrixRoutesOptions, "load">;
  name?: string;
  productionSmoke?: false | VoicePhoneAgentProductionSmokeRoutesOptions;
  setup?:
    | false
    | {
        path?: string;
        title?: string;
      };
};

export type VoicePhoneAgentCarrierSummary = {
  name?: string;
  provider: "plivo" | "telnyx" | "twilio";
  setupPath?: false | string;
  smokePath?: false | string;
};

export type VoicePhoneAgentSetupInstruction = {
  answerLabel: string;
  answerUrl?: string;
  carrierName: string;
  issues: string[];
  provider: "plivo" | "telnyx" | "twilio";
  setupPath?: false | string;
  smokePath?: false | string;
  status: "fail" | "pass" | "unknown" | "warn";
  steps: string[];
  streamUrl?: string;
  webhookUrl?: string;
};

export type VoicePhoneAgentRoutes = {
  carriers: VoicePhoneAgentCarrierSummary[];
  matrixPath?: string;
  productionSmokePath?: string;
  routes: Elysia;
  setupPath?: string;
};

export type VoicePhoneAgentSetupReport = {
  carriers: VoicePhoneAgentCarrierSummary[];
  generatedAt: number;
  lifecycleStages: VoicePhoneAgentLifecycleStage[];
  matrix?: VoiceTelephonyCarrierMatrix;
  matrixPath?: string;
  productionSmokePath?: string;
  ready: boolean;
  setupInstructions: VoicePhoneAgentSetupInstruction[];
  setupPath?: string;
  title: string;
};

export type VoicePhoneAssistantEvidenceInput = {
  dialerProof?: VoiceCampaignDialerProofReport;
  maxCarrierFailures?: number;
  maxCarrierWarnings?: number;
  maxFailedDialerProviders?: number;
  minCarriers?: number;
  minDialerCarrierRequests?: number;
  minReadyCarriers?: number;
  minSmokePassing?: number;
  minSuccessfulDialerOutcomes?: number;
  requiredDialerProviders?: VoiceCampaignDialerProofProvider[];
  requiredLifecycleStages?: VoicePhoneAgentLifecycleStage[];
  requiredProviders?: VoiceTelephonyProvider[];
  requireCarrierMatrix?: boolean;
  requireDialerProof?: boolean;
  requireMatrixPass?: boolean;
  requireProductionSmokePath?: boolean;
  requireReady?: boolean;
  requireSetupPath?: boolean;
};

export type VoicePhoneAssistantEvidenceReport = {
  carrierFailures: number;
  carrierWarnings: number;
  carriers: number;
  dialer?: VoiceCampaignDialerProofAssertionReport;
  issues: string[];
  lifecycleStages: VoicePhoneAgentLifecycleStage[];
  matrixPass?: boolean;
  ok: boolean;
  productionSmokePath?: string;
  providers: VoiceTelephonyProvider[];
  ready: boolean;
  readyCarriers: number;
  setupPath?: string;
  smokePassing: number;
};

export type VoicePhoneCallControlEvidenceInput = {
  maxFailedSmokeReports?: number;
  minPassingSmokeReports?: number;
  productionSmokes?: VoicePhoneAgentProductionSmokeReport[];
  requiredLifecycleStages?: VoicePhoneAgentLifecycleStage[];
  requiredOutcomes?: string[];
  requiredProviders?: VoiceTelephonyProvider[];
  requireSetupLifecycleStages?: boolean;
  setup?: VoicePhoneAgentSetupReport;
};

export type VoicePhoneCallControlEvidenceReport = {
  failedSmokeReports: number;
  issues: string[];
  lifecycleStages: VoicePhoneAgentLifecycleStage[];
  ok: boolean;
  outcomes: string[];
  passingSmokeReports: number;
  providers: VoiceTelephonyProvider[];
  smokeReports: number;
};

const defaultSetupPath = (provider: VoicePhoneAgentCarrier["provider"]) =>
  `/api/voice/${provider}/setup`;

const defaultSmokePath = (provider: VoicePhoneAgentCarrier["provider"]) =>
  `/api/voice/${provider}/smoke`;

const defaultProductionSmokePath = "/api/voice/phone/smoke-contract";

const resolveSetupPath = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  carrier: VoicePhoneAgentCarrier<TContext, TSession, TResult>,
) => {
  if (carrier.setupPath !== undefined) {
    return carrier.setupPath;
  }

  if (carrier.provider === "twilio") {
    return carrier.options.setup?.path === false
      ? false
      : (carrier.options.setup?.path ?? defaultSetupPath(carrier.provider));
  }

  return carrier.options?.setup?.path === false
    ? false
    : (carrier.options?.setup?.path ?? defaultSetupPath(carrier.provider));
};

const resolveSmokePath = <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(
  carrier: VoicePhoneAgentCarrier<TContext, TSession, TResult>,
) => {
  if (carrier.smokePath !== undefined) {
    return carrier.smokePath;
  }

  if (carrier.provider === "twilio") {
    return carrier.options.smoke?.path === false
      ? false
      : (carrier.options.smoke?.path ?? defaultSmokePath(carrier.provider));
  }

  return carrier.options?.smoke?.path === false
    ? false
    : (carrier.options?.smoke?.path ?? defaultSmokePath(carrier.provider));
};

const PHONE_AGENT_LIFECYCLE_STAGES: VoicePhoneAgentLifecycleStage[] = [
  "ringing",
  "answered",
  "media-started",
  "transcript",
  "assistant-response",
  "transfer",
  "voicemail",
  "no-answer",
  "completed",
  "failed",
];

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const loadRouteJson = async <TValue>(input: {
  app: Elysia;
  origin: string;
  path: string;
}) => {
  const response = await input.app.handle(
    new Request(new URL(input.path, input.origin).toString(), {
      headers: {
        accept: "application/json",
      },
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as TValue;
};

const loadCarrierMatrixInputs = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(input: {
  app: Elysia;
  carriers: readonly VoicePhoneAgentCarrier<TContext, TSession, TResult>[];
  request: Request;
}) => {
  const origin = new URL(input.request.url).origin;
  const entries: VoiceTelephonyCarrierMatrixInput[] = [];

  for (const carrier of input.carriers) {
    const setupPath = resolveSetupPath(carrier);

    if (!setupPath) {
      continue;
    }

    const setup = await loadRouteJson<
      VoiceTelephonyCarrierMatrixInput["setup"]
    >({
      app: input.app,
      origin,
      path: setupPath,
    });

    if (!setup) {
      continue;
    }

    const smokePath = resolveSmokePath(carrier);
    const smoke = smokePath
      ? await loadRouteJson<VoiceTelephonyCarrierMatrixInput["smoke"]>({
          app: input.app,
          origin,
          path: smokePath,
        })
      : undefined;

    entries.push({
      name: carrier.name,
      setup,
      smoke,
    });
  }

  return entries;
};

const carrierAnswerLabel = (
  provider: VoicePhoneAgentCarrierSummary["provider"],
) =>
  provider === "telnyx"
    ? "TeXML URL"
    : provider === "plivo"
      ? "Answer URL"
      : "TwiML URL";

const findCarrierMatrixEntry = (
  matrix: VoiceTelephonyCarrierMatrix | undefined,
  carrier: VoicePhoneAgentCarrierSummary,
) =>
  matrix?.entries.find(
    (candidate) =>
      candidate.provider === carrier.provider &&
      (candidate.name === carrier.name ||
        candidate.name === (carrier.name ?? carrier.provider)),
  );

const uniqueSorted = <Value extends string>(values: Value[]): Value[] =>
  Array.from(new Set(values)).sort();

const findMissing = <Value extends string>(
  values: Value[],
  required: Value[] | undefined,
): Value[] => {
  if (!required?.length) {
    return [];
  }
  const valueSet = new Set(values);
  return required.filter((value) => !valueSet.has(value));
};

export const evaluateVoicePhoneAssistantEvidence = (
  report: VoicePhoneAgentSetupReport,
  input: VoicePhoneAssistantEvidenceInput = {},
): VoicePhoneAssistantEvidenceReport => {
  const issues: string[] = [];
  const providers = uniqueSorted(
    report.carriers.map((carrier) => carrier.provider),
  );
  const lifecycleStages = uniqueSorted(report.lifecycleStages);
  const carrierSummary = report.matrix?.summary;
  const carrierFailures = carrierSummary?.failing ?? 0;
  const carrierWarnings = carrierSummary?.warnings ?? 0;
  const readyCarriers =
    carrierSummary?.ready ??
    report.carriers.filter(
      (carrier) => findCarrierMatrixEntry(report.matrix, carrier)?.ready,
    ).length;
  const smokePassing = carrierSummary?.smokePassing ?? 0;
  const requireCarrierMatrix = input.requireCarrierMatrix ?? true;
  const requireMatrixPass = input.requireMatrixPass ?? true;
  const requireReady = input.requireReady ?? true;
  const requireSetupPath = input.requireSetupPath ?? true;

  if (requireSetupPath && !report.setupPath) {
    issues.push("Expected phone assistant setup path to be configured.");
  }
  if (input.requireProductionSmokePath && !report.productionSmokePath) {
    issues.push(
      "Expected phone assistant production smoke path to be configured.",
    );
  }
  if (requireReady && !report.ready) {
    issues.push("Expected phone assistant setup report to be ready.");
  }
  if (requireCarrierMatrix && !report.matrix) {
    issues.push("Expected phone assistant carrier matrix to be present.");
  }
  if (report.matrix && requireMatrixPass && !report.matrix.pass) {
    issues.push("Expected phone assistant carrier matrix to pass.");
  }
  if (
    input.minCarriers !== undefined &&
    report.carriers.length < input.minCarriers
  ) {
    issues.push(
      `Expected at least ${String(input.minCarriers)} phone carrier(s), found ${String(report.carriers.length)}.`,
    );
  }
  if (
    input.minReadyCarriers !== undefined &&
    readyCarriers < input.minReadyCarriers
  ) {
    issues.push(
      `Expected at least ${String(input.minReadyCarriers)} ready phone carrier(s), found ${String(readyCarriers)}.`,
    );
  }
  if (
    input.minSmokePassing !== undefined &&
    smokePassing < input.minSmokePassing
  ) {
    issues.push(
      `Expected at least ${String(input.minSmokePassing)} passing phone carrier smoke report(s), found ${String(smokePassing)}.`,
    );
  }
  if (
    input.maxCarrierFailures !== undefined &&
    carrierFailures > input.maxCarrierFailures
  ) {
    issues.push(
      `Expected at most ${String(input.maxCarrierFailures)} failing phone carrier(s), found ${String(carrierFailures)}.`,
    );
  }
  if (
    input.maxCarrierWarnings !== undefined &&
    carrierWarnings > input.maxCarrierWarnings
  ) {
    issues.push(
      `Expected at most ${String(input.maxCarrierWarnings)} phone carrier warning(s), found ${String(carrierWarnings)}.`,
    );
  }
  for (const provider of findMissing(providers, input.requiredProviders)) {
    issues.push(`Missing phone carrier provider: ${provider}.`);
  }
  for (const stage of findMissing(
    lifecycleStages,
    input.requiredLifecycleStages,
  )) {
    issues.push(`Missing phone lifecycle stage: ${stage}.`);
  }

  const dialer = input.dialerProof
    ? evaluateVoiceCampaignDialerProofEvidence(input.dialerProof, {
        maxFailedProviders: input.maxFailedDialerProviders,
        minCarrierRequests: input.minDialerCarrierRequests,
        minSuccessfulOutcomes: input.minSuccessfulDialerOutcomes,
        requiredProviders: input.requiredDialerProviders,
      })
    : undefined;
  if (input.requireDialerProof && !input.dialerProof) {
    issues.push("Expected campaign dialer proof to be present.");
  }
  if (dialer && !dialer.ok) {
    issues.push(...dialer.issues);
  }

  return {
    carrierFailures,
    carrierWarnings,
    carriers: report.carriers.length,
    dialer,
    issues,
    lifecycleStages,
    matrixPass: report.matrix?.pass,
    ok: issues.length === 0,
    productionSmokePath: report.productionSmokePath,
    providers,
    ready: report.ready,
    readyCarriers,
    setupPath: report.setupPath,
    smokePassing,
  };
};

export const assertVoicePhoneAssistantEvidence = (
  report: VoicePhoneAgentSetupReport,
  input: VoicePhoneAssistantEvidenceInput = {},
): VoicePhoneAssistantEvidenceReport => {
  const assertion = evaluateVoicePhoneAssistantEvidence(report, input);
  if (!assertion.ok) {
    throw new Error(
      `Voice phone assistant evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

export const evaluateVoicePhoneCallControlEvidence = (
  input: VoicePhoneCallControlEvidenceInput = {},
): VoicePhoneCallControlEvidenceReport => {
  const issues: string[] = [];
  const setup = input.setup;
  const productionSmokes = input.productionSmokes ?? [];
  const lifecycleStages = uniqueSorted(setup?.lifecycleStages ?? []);
  const providers = uniqueSorted(
    productionSmokes
      .map((report) => report.provider)
      .filter((provider): provider is VoiceTelephonyProvider =>
        Boolean(provider),
      ),
  );
  const outcomes = uniqueSorted(
    productionSmokes.flatMap((report) => report.observed.lifecycleOutcomes),
  );
  const failedSmokeReports = productionSmokes.filter(
    (report) => !report.pass,
  ).length;
  const passingSmokeReports = productionSmokes.length - failedSmokeReports;

  if (productionSmokes.length === 0) {
    issues.push("Expected phone call-control smoke report(s) to be present.");
  }
  if (input.requireSetupLifecycleStages ?? true) {
    if (!setup) {
      issues.push("Expected phone setup report to be present.");
    }
    for (const stage of findMissing(
      lifecycleStages,
      input.requiredLifecycleStages,
    )) {
      issues.push(`Missing phone call-control lifecycle stage: ${stage}.`);
    }
  }
  if (
    input.minPassingSmokeReports !== undefined &&
    passingSmokeReports < input.minPassingSmokeReports
  ) {
    issues.push(
      `Expected at least ${String(input.minPassingSmokeReports)} passing phone call-control smoke report(s), found ${String(passingSmokeReports)}.`,
    );
  }
  if (
    input.maxFailedSmokeReports !== undefined &&
    failedSmokeReports > input.maxFailedSmokeReports
  ) {
    issues.push(
      `Expected at most ${String(input.maxFailedSmokeReports)} failing phone call-control smoke report(s), found ${String(failedSmokeReports)}.`,
    );
  }
  for (const provider of findMissing(providers, input.requiredProviders)) {
    issues.push(`Missing phone call-control provider: ${provider}.`);
  }
  for (const outcome of findMissing(outcomes, input.requiredOutcomes)) {
    issues.push(`Missing phone call-control outcome: ${outcome}.`);
  }

  return {
    failedSmokeReports,
    issues,
    lifecycleStages,
    ok: issues.length === 0,
    outcomes,
    passingSmokeReports,
    providers,
    smokeReports: productionSmokes.length,
  };
};

export const assertVoicePhoneCallControlEvidence = (
  input: VoicePhoneCallControlEvidenceInput = {},
): VoicePhoneCallControlEvidenceReport => {
  const assertion = evaluateVoicePhoneCallControlEvidence(input);
  if (!assertion.ok) {
    throw new Error(
      `Voice phone call-control evidence assertion failed: ${assertion.issues.join(" ")}`,
    );
  }
  return assertion;
};

const buildVoicePhoneAgentSetupInstructions = (input: {
  carriers: VoicePhoneAgentCarrierSummary[];
  matrix?: VoiceTelephonyCarrierMatrix;
  productionSmokePath?: string;
}): VoicePhoneAgentSetupInstruction[] =>
  input.carriers.map((carrier) => {
    const entry = findCarrierMatrixEntry(input.matrix, carrier);
    const urls = entry?.setup.urls;
    const answerLabel = carrierAnswerLabel(carrier.provider);
    const urlRecord = (urls ?? {}) as Record<string, string | undefined>;
    const answerUrl = urlRecord.twiml ?? urlRecord.texml ?? urlRecord.answer;
    const webhookUrl = urls?.webhook;
    const streamUrl = urls?.stream;
    const setupPath =
      typeof carrier.setupPath === "string"
        ? `${carrier.setupPath}?format=html`
        : undefined;
    const smokePath =
      typeof carrier.smokePath === "string"
        ? `${carrier.smokePath}?format=html`
        : undefined;
    const productionSmokePath = input.productionSmokePath
      ? `${input.productionSmokePath.replace("/api/", "/")}?sessionId=`
      : undefined;
    const steps = [
      `Set ${answerLabel} to ${answerUrl ?? "missing"}.`,
      `Set status webhook to ${webhookUrl ?? "missing"}.`,
      `Allow media stream URL ${streamUrl ?? "missing"}.`,
      ...(setupPath ? [`Open setup report ${setupPath}.`] : []),
      ...(smokePath ? [`Run carrier smoke ${smokePath}.`] : []),
      ...(productionSmokePath
        ? [`Certify production smoke traces at ${productionSmokePath}.`]
        : []),
    ];

    return {
      answerLabel,
      answerUrl,
      carrierName: carrier.name ?? carrier.provider,
      issues:
        entry?.issues.map((issue) => `${issue.severity}: ${issue.message}`) ??
        [],
      provider: carrier.provider,
      setupPath: carrier.setupPath,
      smokePath: carrier.smokePath,
      status: entry?.status ?? "unknown",
      steps,
      streamUrl,
      webhookUrl,
    };
  });

const resolveCarrierContract = async <
  TContext,
  TSession extends VoiceSessionRecord,
  TResult,
>(input: {
  app: Elysia;
  carriers: readonly VoicePhoneAgentCarrier<TContext, TSession, TResult>[];
  matrix?: false | Omit<VoiceTelephonyCarrierMatrixRoutesOptions, "load">;
  provider?: string;
  request: Request;
}): Promise<
  VoiceTelephonyContractReport<VoiceTelephonyProvider> | undefined
> => {
  const matrixInputs = await loadCarrierMatrixInputs({
    app: input.app,
    carriers: input.carriers,
    request: input.request,
  });
  const matrix = createVoiceTelephonyCarrierMatrix({
    contract: input.matrix === false ? undefined : input.matrix?.contract,
    providers: matrixInputs,
  });
  const entry =
    matrix.entries.find((candidate) => candidate.provider === input.provider) ??
    matrix.entries[0];

  return entry?.contract;
};

const renderVoicePhoneAgentSetupHTML = (report: VoicePhoneAgentSetupReport) => {
  const carrierRows = report.carriers
    .map((carrier) => {
      const entry = findCarrierMatrixEntry(report.matrix, carrier);
      const urls = entry?.setup.urls;
      const primaryUrl =
        carrier.provider === "plivo" ? urls?.twiml : urls?.twiml;

      return `<tr><td>${escapeHtml(carrier.name ?? carrier.provider)}</td><td>${escapeHtml(carrier.provider)}</td><td><code>${escapeHtml(carrier.setupPath || "disabled")}</code></td><td><code>${escapeHtml(carrier.smokePath || "disabled")}</code></td><td>${entry ? `<span class="${escapeHtml(entry.status)}">${escapeHtml(entry.status.toUpperCase())}</span>` : "unknown"}</td><td>${primaryUrl ? `<code>${escapeHtml(primaryUrl)}</code>` : '<span class="muted">missing</span>'}</td><td>${urls?.webhook ? `<code>${escapeHtml(urls.webhook)}</code>` : '<span class="muted">missing</span>'}</td><td>${urls?.stream ? `<code>${escapeHtml(urls.stream)}</code>` : '<span class="muted">missing</span>'}</td></tr>`;
    })
    .join("");
  const stageList = report.lifecycleStages
    .map((stage) => `<li><code>${escapeHtml(stage)}</code></li>`)
    .join("");
  const snippet = escapeHtml(`const phoneAgent = createVoicePhoneAgent({
	carriers: [
		{
			provider: 'twilio',
			options: {
				twiml: { streamUrl: 'wss://your-app.example/api/voice/twilio/stream' },
				webhook: { validateSignature: true }
			}
		}
	],
	productionSmoke: {
		store: traceStore,
		required: [
			'carrier-contract',
			'media-started',
			'transcript',
			'assistant-response',
			'lifecycle-outcome',
			'no-session-error'
		]
	}
});

app.use(phoneAgent.routes);

app.use(
	createVoiceProductionReadinessRoutes({
		carriers: loadCarrierMatrixInputs,
		phoneAgentSmokes: loadPhoneAgentSmokeReports,
		store: traceStore
	})
);`);
  const checklist = report.carriers
    .map((carrier) => {
      const instruction = report.setupInstructions.find(
        (candidate) =>
          candidate.provider === carrier.provider &&
          candidate.carrierName === (carrier.name ?? carrier.provider),
      );
      const issueList =
        instruction?.issues
          .map((issue) => `<li>${escapeHtml(issue)}</li>`)
          .join("") ?? "";
      const steps =
        instruction?.steps
          .map((step) => `<li>${escapeHtml(step)}</li>`)
          .join("") ?? "";

      return `<article><h3>${escapeHtml(carrier.name ?? carrier.provider)}</h3><ol>${steps}</ol>${issueList ? `<ul class="issues">${issueList}</ul>` : '<p class="pass">No carrier contract issues.</p>'}</article>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(report.title)}</title><style>body{background:#10151c;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1180px;padding:32px}.hero,.primitive{background:linear-gradient(135deg,rgba(20,184,166,.2),rgba(245,158,11,.12));border:1px solid #283544;border-radius:28px;margin-bottom:18px;padding:28px}.primitive{background:#151d27;border-color:#365a60}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.3rem,6vw,4.8rem);line-height:.92;margin:.2rem 0 1rem}.badge{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;padding:8px 12px}.pass{color:#86efac}.fail{color:#fca5a5}.warn{color:#fde68a}.muted{color:#aab5c0}table{background:#151d27;border:1px solid #283544;border-collapse:collapse;border-radius:18px;display:block;overflow:auto;width:100%}td,th{border-bottom:1px solid #283544;padding:12px;text-align:left;vertical-align:top}code{color:#fde68a;overflow-wrap:anywhere}.primitive p{color:#cbd5de;line-height:1.55}.primitive pre{background:#0b1118;border:1px solid #283544;border-radius:18px;color:#fef3c7;overflow:auto;padding:16px}.checklist{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin:18px 0}.checklist article{background:#151d27;border:1px solid #283544;border-radius:18px;padding:18px}.checklist ol{padding-left:20px}.issues{color:#fca5a5}.stages{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));padding-left:18px}a{color:#5eead4}</style></head><body><main><section class="hero"><p class="eyebrow">Phone agent setup</p><h1>${escapeHtml(report.title)}</h1><p>One self-hosted entrypoint for carrier routes, setup reports, smoke checks, and normalized call lifecycle stages.</p><p class="badge ${report.ready ? "pass" : "fail"}">Ready: ${String(report.ready)}</p>${report.matrixPath ? `<p><a href="${escapeHtml(report.matrixPath)}?format=html">Open carrier matrix</a></p>` : ""}</section><section class="primitive"><p class="eyebrow">Copy into your app</p><h2><code>createVoicePhoneAgent(...)</code> builds this carrier control plane</h2><p>Mount carrier routes once, expose setup and smoke proof, then feed the same carrier matrix and phone-agent smoke reports into production readiness so carrier regressions block deploys.</p><pre><code>${snippet}</code></pre></section><h2>Carrier Setup Checklist</h2><section class="checklist">${checklist}</section><h2>Carrier URLs</h2><table><thead><tr><th>Name</th><th>Provider</th><th>Setup</th><th>Smoke</th><th>Status</th><th>Answer/TwiML/TeXML</th><th>Webhook</th><th>Stream</th></tr></thead><tbody>${carrierRows}</tbody></table><h2>Lifecycle Schema</h2><ul class="stages">${stageList}</ul></main></body></html>`;
};

export const createVoicePhoneAgent = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoicePhoneAgentRoutesOptions<TContext, TSession, TResult>,
): VoicePhoneAgentRoutes => {
  const carrierSummaries = options.carriers.map((carrier) => ({
    name: carrier.name,
    provider: carrier.provider,
    setupPath: resolveSetupPath(carrier),
    smokePath: resolveSmokePath(carrier),
  }));
  const app = new Elysia({
    name: options.name ?? "absolutejs-voice-phone-agent",
  });

  for (const carrier of options.carriers) {
    switch (carrier.provider) {
      case "twilio":
        app.use(createTwilioVoiceRoutes(carrier.options));
        break;
      case "telnyx":
        app.use(createTelnyxVoiceRoutes(carrier.options));
        break;
      case "plivo":
        app.use(createPlivoVoiceRoutes(carrier.options));
        break;
    }
  }

  const matrixPath =
    options.matrix === false
      ? undefined
      : (options.matrix?.path ?? "/api/voice/phone/carriers");
  const setupPath =
    options.setup === false
      ? undefined
      : (options.setup?.path ?? "/api/voice/phone/setup");
  const setupTitle =
    options.setup === false
      ? "AbsoluteJS Voice Phone Agent"
      : (options.setup?.title ?? "AbsoluteJS Voice Phone Agent");
  const productionSmokePath =
    options.productionSmoke === false || options.productionSmoke === undefined
      ? undefined
      : (options.productionSmoke.path ?? defaultProductionSmokePath);

  if (options.matrix !== false) {
    app.use(
      createVoiceTelephonyCarrierMatrixRoutes({
        ...(options.matrix ?? {}),
        path: matrixPath,
        load: ({ request }) =>
          loadCarrierMatrixInputs({
            app,
            carriers: options.carriers,
            request,
          }),
      }),
    );
  }

  if (
    options.productionSmoke !== false &&
    options.productionSmoke !== undefined
  ) {
    const productionSmoke = options.productionSmoke;
    app.use(
      createVoicePhoneAgentProductionSmokeRoutes({
        ...productionSmoke,
        getContract:
          productionSmoke.getContract ??
          (({ query, request }) =>
            resolveCarrierContract({
              app,
              carriers: options.carriers,
              matrix: options.matrix,
              provider:
                typeof query.provider === "string" ? query.provider : undefined,
              request,
            })),
        path: productionSmokePath,
      }),
    );
  }

  if (setupPath) {
    app.get(setupPath, async ({ query, request }) => {
      const matrixInputs =
        options.matrix === false
          ? []
          : await loadCarrierMatrixInputs({
              app,
              carriers: options.carriers,
              request,
            });
      const matrix =
        options.matrix === false
          ? undefined
          : createVoiceTelephonyCarrierMatrix({
              contract: options.matrix?.contract,
              providers: matrixInputs,
            });
      const report: VoicePhoneAgentSetupReport = {
        carriers: carrierSummaries,
        generatedAt: Date.now(),
        lifecycleStages: PHONE_AGENT_LIFECYCLE_STAGES,
        matrix,
        matrixPath,
        productionSmokePath,
        ready: matrix ? matrix.pass : carrierSummaries.length > 0,
        setupInstructions: buildVoicePhoneAgentSetupInstructions({
          carriers: carrierSummaries,
          matrix,
          productionSmokePath,
        }),
        setupPath,
        title: setupTitle,
      };

      if (query.format === "html") {
        return new Response(renderVoicePhoneAgentSetupHTML(report), {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }

      return report;
    });
  }

  return {
    carriers: carrierSummaries,
    matrixPath,
    productionSmokePath,
    routes: app,
    setupPath,
  };
};
