export type VoiceTelephonyProvider = "generic" | "plivo" | "telnyx" | "twilio";

export type VoiceTelephonySetupStatus<
  TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider,
> = {
  generatedAt: number;
  missing: string[];
  provider: TProvider;
  ready: boolean;
  signing: {
    configured: boolean;
    mode: "custom" | "none" | "provider-signature" | "twilio-signature";
    verificationUrl?: string;
  };
  urls: {
    stream: string;
    twiml?: string;
    webhook: string;
  };
  warnings: string[];
};

export type VoiceTelephonySmokeCheck = {
  details?: Record<string, unknown>;
  message?: string;
  name: string;
  status: "fail" | "pass" | "warn";
};

export type VoiceTelephonySmokeReport<
  TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider,
> = {
  checks: VoiceTelephonySmokeCheck[];
  generatedAt: number;
  pass: boolean;
  provider: TProvider;
  setup: VoiceTelephonySetupStatus<TProvider>;
  twiml?: {
    status: number;
    streamUrl?: string;
  };
  webhook?: {
    body?: unknown;
    status: number;
  };
};

export type VoiceTelephonyContractRequirement =
  | "signed-webhook"
  | "smoke-pass"
  | "stream-url"
  | "webhook-url"
  | "wss-stream";

export type VoiceTelephonyContractIssue = {
  requirement: VoiceTelephonyContractRequirement;
  severity: "error" | "warning";
  message: string;
};

export type VoiceTelephonyContractReport<
  TProvider extends VoiceTelephonyProvider = VoiceTelephonyProvider,
> = {
  issues: VoiceTelephonyContractIssue[];
  pass: boolean;
  provider: TProvider;
  requirements: VoiceTelephonyContractRequirement[];
  setup: VoiceTelephonySetupStatus<TProvider>;
  smoke?: VoiceTelephonySmokeReport<TProvider>;
};

export type VoiceTelephonyContractOptions = {
  requirements?: VoiceTelephonyContractRequirement[];
};

const DEFAULT_REQUIREMENTS: VoiceTelephonyContractRequirement[] = [
  "stream-url",
  "wss-stream",
  "webhook-url",
  "signed-webhook",
  "smoke-pass",
];

const hasFailingSmokeCheck = (smoke: VoiceTelephonySmokeReport | undefined) =>
  smoke?.checks.some((check) => check.status === "fail") ?? false;

export const evaluateVoiceTelephonyContract = <
  TProvider extends VoiceTelephonyProvider,
>(input: {
  options?: VoiceTelephonyContractOptions;
  setup: VoiceTelephonySetupStatus<TProvider>;
  smoke?: VoiceTelephonySmokeReport<TProvider>;
}): VoiceTelephonyContractReport<TProvider> => {
  const requirements = input.options?.requirements ?? DEFAULT_REQUIREMENTS;
  const issues: VoiceTelephonyContractIssue[] = [];
  const hasRequirement = (requirement: VoiceTelephonyContractRequirement) =>
    requirements.includes(requirement);

  if (hasRequirement("stream-url") && !input.setup.urls.stream) {
    issues.push({
      message: "Missing media stream URL.",
      requirement: "stream-url",
      severity: "error",
    });
  }

  if (
    hasRequirement("wss-stream") &&
    !input.setup.urls.stream.startsWith("wss://")
  ) {
    issues.push({
      message: "Media stream URL must use wss://.",
      requirement: "wss-stream",
      severity: "error",
    });
  }

  if (hasRequirement("webhook-url") && !input.setup.urls.webhook) {
    issues.push({
      message: "Missing carrier webhook URL.",
      requirement: "webhook-url",
      severity: "error",
    });
  }

  if (hasRequirement("signed-webhook") && !input.setup.signing.configured) {
    issues.push({
      message: "Carrier webhook signature verification is not configured.",
      requirement: "signed-webhook",
      severity: "error",
    });
  }

  if (hasRequirement("smoke-pass")) {
    if (!input.smoke) {
      issues.push({
        message: "Missing telephony smoke test report.",
        requirement: "smoke-pass",
        severity: "error",
      });
    } else if (!input.smoke.pass || hasFailingSmokeCheck(input.smoke)) {
      issues.push({
        message: "Telephony smoke test did not pass.",
        requirement: "smoke-pass",
        severity: "error",
      });
    }
  }

  for (const warning of input.setup.warnings) {
    issues.push({
      message: warning,
      requirement: "stream-url",
      severity: "warning",
    });
  }

  for (const name of input.setup.missing) {
    issues.push({
      message: `${name} is missing.`,
      requirement: "webhook-url",
      severity: "error",
    });
  }

  return {
    issues,
    pass: issues.every((issue) => issue.severity !== "error"),
    provider: input.setup.provider,
    requirements,
    setup: input.setup,
    smoke: input.smoke,
  };
};
