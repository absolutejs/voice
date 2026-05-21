export type VoicePhoneNumber = {
  phoneNumber: string;
  provider: "telnyx" | "twilio" | (string & {});
  providerNumberId: string;
  raw: unknown;
};

export type TwilioProvisionInput = {
  accountSid: string;
  areaCode?: string;
  authToken: string;
  contains?: string;
  countryCode?: string;
  fetch?: typeof fetch;
  friendlyName?: string;
  smsUrl?: string;
  statusCallbackUrl?: string;
  voiceUrl: string;
};

const requireAuth = (input: { accountSid?: string; authToken?: string }) => {
  if (!input.accountSid || !input.authToken) {
    throw new Error("Twilio provisioning requires accountSid + authToken");
  }
};

const toBasicAuth = (sid: string, token: string) =>
  `Basic ${btoa(`${sid}:${token}`)}`;

const searchTwilioCandidate = async (input: TwilioProvisionInput) => {
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const country = input.countryCode ?? "US";
  const url = new URL(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      input.accountSid,
    )}/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json`,
  );
  if (input.areaCode) url.searchParams.set("AreaCode", input.areaCode);
  if (input.contains) url.searchParams.set("Contains", input.contains);
  url.searchParams.set("PageSize", "5");
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      authorization: toBasicAuth(input.accountSid, input.authToken),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Twilio AvailablePhoneNumbers failed: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
  }
  const payload = (await response.json()) as {
    available_phone_numbers?: Array<{ phone_number?: string }>;
  };
  const candidate = payload.available_phone_numbers?.[0]?.phone_number;
  if (!candidate) {
    throw new Error("Twilio returned no available phone numbers for the query");
  }

  return candidate;
};

export const provisionTwilioPhoneNumber = async (
  input: TwilioProvisionInput,
): Promise<VoicePhoneNumber> => {
  requireAuth(input);
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const phoneNumber = await searchTwilioCandidate(input);
  const body = new URLSearchParams();
  body.set("PhoneNumber", phoneNumber);
  body.set("VoiceUrl", input.voiceUrl);
  if (input.friendlyName) body.set("FriendlyName", input.friendlyName);
  if (input.statusCallbackUrl)
    body.set("StatusCallback", input.statusCallbackUrl);
  if (input.smsUrl) body.set("SmsUrl", input.smsUrl);
  const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    input.accountSid,
  )}/IncomingPhoneNumbers.json`;
  const response = await fetchImpl(purchaseUrl, {
    body: body.toString(),
    headers: {
      accept: "application/json",
      authorization: toBasicAuth(input.accountSid, input.authToken),
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Twilio IncomingPhoneNumbers POST failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
    );
  }
  const result = (await response.json()) as {
    phone_number: string;
    sid: string;
  };

  return {
    phoneNumber: result.phone_number,
    provider: "twilio",
    providerNumberId: result.sid,
    raw: result,
  };
};

export type TelnyxProvisionInput = {
  apiKey: string;
  areaCode?: string;
  connectionId?: string;
  countryCode?: string;
  fetch?: typeof fetch;
  messagingProfileId?: string;
  voiceWebhookUrl: string;
};

export const provisionTelnyxPhoneNumber = async (
  input: TelnyxProvisionInput,
): Promise<VoicePhoneNumber> => {
  if (!input.apiKey) {
    throw new Error("Telnyx provisioning requires apiKey");
  }
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const searchUrl = new URL(
    "https://api.telnyx.com/v2/available_phone_numbers",
  );
  searchUrl.searchParams.set("filter[country_code]", input.countryCode ?? "US");
  searchUrl.searchParams.set("filter[features]", "voice");
  if (input.areaCode) {
    searchUrl.searchParams.set(
      "filter[national_destination_code]",
      input.areaCode,
    );
  }
  searchUrl.searchParams.set("filter[limit]", "5");
  const searchResponse = await fetchImpl(searchUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
  });
  if (!searchResponse.ok) {
    const text = await searchResponse.text().catch(() => "");
    throw new Error(
      `Telnyx available_phone_numbers failed: ${searchResponse.status} ${text.slice(0, 200)}`,
    );
  }
  const searchPayload = (await searchResponse.json()) as {
    data?: Array<{ phone_number: string }>;
  };
  const candidate = searchPayload.data?.[0]?.phone_number;
  if (!candidate) {
    throw new Error("Telnyx returned no available phone numbers for the query");
  }
  const orderBody: Record<string, unknown> = {
    phone_numbers: [{ phone_number: candidate }],
  };
  if (input.connectionId) orderBody.connection_id = input.connectionId;
  if (input.messagingProfileId)
    orderBody.messaging_profile_id = input.messagingProfileId;
  const orderResponse = await fetchImpl(
    "https://api.telnyx.com/v2/number_orders",
    {
      body: JSON.stringify(orderBody),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  if (!orderResponse.ok) {
    const text = await orderResponse.text().catch(() => "");
    throw new Error(
      `Telnyx number_orders POST failed: ${orderResponse.status} ${text.slice(0, 200)}`,
    );
  }
  const orderResult = (await orderResponse.json()) as {
    data?: {
      id?: string;
      phone_numbers?: Array<{ id?: string; phone_number?: string }>;
    };
  };
  const orderedNumber =
    orderResult.data?.phone_numbers?.[0]?.phone_number ?? candidate;
  const phoneNumberId =
    orderResult.data?.phone_numbers?.[0]?.id ?? orderResult.data?.id ?? "";
  // Configure the voice webhook URL on the phone-number resource if id known.
  if (phoneNumberId) {
    const updateResponse = await fetchImpl(
      `https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(
        phoneNumberId,
      )}`,
      {
        body: JSON.stringify({
          voice: { webhook_url: input.voiceWebhookUrl },
        }),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
    if (!updateResponse.ok) {
      const text = await updateResponse.text().catch(() => "");
      throw new Error(
        `Telnyx phone_numbers PATCH failed: ${updateResponse.status} ${text.slice(0, 200)}`,
      );
    }
  }

  return {
    phoneNumber: orderedNumber,
    provider: "telnyx",
    providerNumberId: phoneNumberId,
    raw: orderResult,
  };
};
