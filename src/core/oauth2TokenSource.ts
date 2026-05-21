export type VoiceOAuth2TokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

export type VoiceOAuth2TokenSource = {
  invalidate: () => void;
  token: () => Promise<string>;
};

export type CreateVoiceOAuth2TokenSourceOptions = {
  audience?: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  grantType?: "client_credentials";
  /** seconds remaining before expiry to refresh proactively, default 60 */
  refreshSkewSeconds?: number;
  scope?: string;
  tokenUrl: string;
};

type CachedToken = {
  expiresAt: number;
  value: string;
};

export const createVoiceOAuth2TokenSource = (
  options: CreateVoiceOAuth2TokenSourceOptions,
): VoiceOAuth2TokenSource => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const refreshSkewMs = (options.refreshSkewSeconds ?? 60) * 1_000;
  let cached: CachedToken | undefined;
  let pending: Promise<string> | undefined;

  const fetchToken = async (): Promise<string> => {
    const body = new URLSearchParams();
    body.set("grant_type", options.grantType ?? "client_credentials");
    body.set("client_id", options.clientId);
    body.set("client_secret", options.clientSecret);
    if (options.scope) {
      body.set("scope", options.scope);
    }
    if (options.audience) {
      body.set("audience", options.audience);
    }
    const response = await fetchImpl(options.tokenUrl, {
      body: body.toString(),
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OAuth2 token request failed: ${response.status} ${response.statusText}${
          text ? ` — ${text.slice(0, 200)}` : ""
        }`,
      );
    }
    const json = (await response.json()) as VoiceOAuth2TokenResponse;
    if (!json.access_token) {
      throw new Error("OAuth2 token response missing access_token");
    }
    const ttlMs =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in * 1_000
        : 5 * 60 * 1_000;
    cached = {
      expiresAt: Date.now() + ttlMs,
      value: json.access_token,
    };

    return json.access_token;
  };

  return {
    invalidate: () => {
      cached = undefined;
      pending = undefined;
    },
    token: async () => {
      const now = Date.now();
      if (cached && cached.expiresAt - refreshSkewMs > now) {
        return cached.value;
      }
      if (pending) {
        return pending;
      }
      pending = fetchToken().finally(() => {
        pending = undefined;
      });

      return pending;
    },
  };
};
