import { describe, expect, test } from "bun:test";
import {
  provisionTelnyxPhoneNumber,
  provisionTwilioPhoneNumber,
} from "../src/core/phoneProvisioning";

const makeFetch = (
  responses: Array<{ body: unknown; ok?: boolean; status?: number }>,
) => {
  let index = 0;
  const requests: Array<{ body?: unknown; init?: RequestInit; url: string }> =
    [];
  const fetchMock = (async (url: string | URL, init?: RequestInit) => {
    requests.push({
      body: init?.body,
      init,
      url: typeof url === "string" ? url : url.toString(),
    });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body),
      {
        headers: { "content-type": "application/json" },
        status: response.status ?? (response.ok === false ? 500 : 200),
      },
    );
  }) as typeof fetch;
  return { fetch: fetchMock, requests };
};

describe("provisionTwilioPhoneNumber", () => {
  test("searches then purchases a number with the configured voice webhook", async () => {
    const { fetch, requests } = makeFetch([
      {
        body: {
          available_phone_numbers: [{ phone_number: "+14155551212" }],
        },
      },
      {
        body: {
          phone_number: "+14155551212",
          sid: "PN-abc123",
        },
      },
    ]);
    const number = await provisionTwilioPhoneNumber({
      accountSid: "AC-xxx",
      areaCode: "415",
      authToken: "token-yyy",
      fetch,
      friendlyName: "Voice agent",
      voiceUrl: "https://example.com/voice",
    });
    expect(number).toEqual({
      phoneNumber: "+14155551212",
      provider: "twilio",
      providerNumberId: "PN-abc123",
      raw: { phone_number: "+14155551212", sid: "PN-abc123" },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toContain("AvailablePhoneNumbers");
    expect(requests[0]!.url).toContain("AreaCode=415");
    expect(requests[1]!.url).toContain("IncomingPhoneNumbers.json");
    expect(String(requests[1]!.body)).toContain("PhoneNumber=%2B14155551212");
    expect(String(requests[1]!.body)).toContain(
      "VoiceUrl=https%3A%2F%2Fexample.com%2Fvoice",
    );
  });

  test("throws when no numbers are available", async () => {
    const { fetch } = makeFetch([{ body: { available_phone_numbers: [] } }]);
    await expect(
      provisionTwilioPhoneNumber({
        accountSid: "AC-xxx",
        authToken: "t",
        fetch,
        voiceUrl: "https://example.com/voice",
      }),
    ).rejects.toThrow(/no available phone numbers/);
  });

  test("throws with HTTP context on purchase failure", async () => {
    const { fetch } = makeFetch([
      {
        body: {
          available_phone_numbers: [{ phone_number: "+1" }],
        },
      },
      { body: "limit reached", status: 429 },
    ]);
    await expect(
      provisionTwilioPhoneNumber({
        accountSid: "AC",
        authToken: "t",
        fetch,
        voiceUrl: "https://x",
      }),
    ).rejects.toThrow(/429/);
  });

  test("requires accountSid + authToken", async () => {
    await expect(
      provisionTwilioPhoneNumber({
        accountSid: "",
        authToken: "",
        voiceUrl: "https://x",
      }),
    ).rejects.toThrow(/accountSid/);
  });
});

describe("provisionTelnyxPhoneNumber", () => {
  test("orders a number, then PATCHes the voice webhook URL", async () => {
    const { fetch, requests } = makeFetch([
      { body: { data: [{ phone_number: "+18005551212" }] } },
      {
        body: {
          data: {
            id: "ord-1",
            phone_numbers: [{ id: "ph-1", phone_number: "+18005551212" }],
          },
        },
      },
      { body: { data: {} } },
    ]);
    const result = await provisionTelnyxPhoneNumber({
      apiKey: "tn-key",
      areaCode: "800",
      fetch,
      voiceWebhookUrl: "https://example.com/voice",
    });
    expect(result.phoneNumber).toBe("+18005551212");
    expect(result.providerNumberId).toBe("ph-1");
    expect(requests[0]!.url).toContain("available_phone_numbers");
    expect(requests[0]!.url).toContain("national_destination_code%5D=800");
    expect(requests[1]!.url).toContain("number_orders");
    expect(requests[2]!.url).toContain("phone_numbers/ph-1");
    expect(String(requests[2]!.body)).toContain("https://example.com/voice");
  });

  test("requires an apiKey", async () => {
    await expect(
      provisionTelnyxPhoneNumber({
        apiKey: "",
        voiceWebhookUrl: "https://x",
      }),
    ).rejects.toThrow(/apiKey/);
  });
});
