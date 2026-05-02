import { expect, test } from "bun:test";
import { evaluateVoiceTelephonyContract } from "../src/telephony/contract";
import type {
  VoiceTelephonySetupStatus,
  VoiceTelephonySmokeReport,
} from "../src/telephony/contract";

const createSetup = (
  overrides: Partial<VoiceTelephonySetupStatus<"twilio">> = {},
): VoiceTelephonySetupStatus<"twilio"> => ({
  generatedAt: 100,
  missing: [],
  provider: "twilio",
  ready: true,
  signing: {
    configured: true,
    mode: "twilio-signature",
    verificationUrl: "https://voice.example.test/voice/twilio/webhook",
  },
  urls: {
    stream: "wss://voice.example.test/voice/twilio/stream",
    twiml: "https://voice.example.test/voice/twilio",
    webhook: "https://voice.example.test/voice/twilio/webhook",
  },
  warnings: [],
  ...overrides,
});

const createSmoke = (
  setup = createSetup(),
): VoiceTelephonySmokeReport<"twilio"> => ({
  checks: [
    {
      name: "twiml",
      status: "pass",
    },
    {
      name: "webhook",
      status: "pass",
    },
  ],
  generatedAt: 100,
  pass: true,
  provider: "twilio",
  setup,
  twiml: {
    status: 200,
    streamUrl: setup.urls.stream,
  },
  webhook: {
    status: 200,
  },
});

test("evaluateVoiceTelephonyContract passes a signed wss telephony smoke report", () => {
  const setup = createSetup();
  const report = evaluateVoiceTelephonyContract({
    setup,
    smoke: createSmoke(setup),
  });

  expect(report).toMatchObject({
    pass: true,
    provider: "twilio",
  });
  expect(report.issues).toEqual([]);
});

test("evaluateVoiceTelephonyContract catches provider-agnostic production gaps", () => {
  const setup = createSetup({
    missing: ["TWILIO_AUTH_TOKEN"],
    ready: false,
    signing: {
      configured: false,
      mode: "none",
    },
    urls: {
      stream: "ws://voice.example.test/voice/twilio/stream",
      twiml: "https://voice.example.test/voice/twilio",
      webhook: "https://voice.example.test/voice/twilio/webhook",
    },
  });
  const report = evaluateVoiceTelephonyContract({
    setup,
    smoke: {
      ...createSmoke(setup),
      checks: [
        {
          name: "webhook",
          status: "fail",
        },
      ],
      pass: false,
    },
  });

  expect(report.pass).toBe(false);
  expect(report.issues.map((issue) => issue.requirement)).toEqual(
    expect.arrayContaining([
      "wss-stream",
      "signed-webhook",
      "smoke-pass",
      "webhook-url",
    ]),
  );
});

test("evaluateVoiceTelephonyContract can certify another provider with the same contract shape", () => {
  const setup: VoiceTelephonySetupStatus<"telnyx"> = {
    generatedAt: 100,
    missing: [],
    provider: "telnyx",
    ready: true,
    signing: {
      configured: true,
      mode: "provider-signature",
      verificationUrl: "https://voice.example.test/telnyx/webhook",
    },
    urls: {
      stream: "wss://voice.example.test/telnyx/stream",
      webhook: "https://voice.example.test/telnyx/webhook",
    },
    warnings: [],
  };

  const report = evaluateVoiceTelephonyContract({
    setup,
    smoke: {
      checks: [
        {
          name: "webhook",
          status: "pass",
        },
      ],
      generatedAt: 100,
      pass: true,
      provider: "telnyx",
      setup,
      webhook: {
        status: 200,
      },
    },
  });

  expect(report.pass).toBe(true);
  expect(report.provider).toBe("telnyx");
});
