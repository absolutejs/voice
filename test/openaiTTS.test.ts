import { expect, test } from "bun:test";
import { createOpenAIVoiceTTS } from "../src/openaiTTS";

test("createOpenAIVoiceTTS streams OpenAI PCM speech chunks as TTS audio events", async () => {
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  const adapter = createOpenAIVoiceTTS({
    apiKey: "test-key",
    fetch: (async (url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(url),
      });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0, 0, 32, 0]));
            controller.enqueue(new Uint8Array([224, 255, 0, 0]));
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "audio/pcm",
          },
          status: 200,
        },
      );
    }) as typeof fetch,
    instructions: ({ lexicon }) =>
      lexicon?.length ? `Say ${lexicon[0]!.text} clearly.` : undefined,
    model: "gpt-4o-mini-tts",
    voice: "marin",
  });
  const session = await adapter.open({
    lexicon: [{ text: "AbsoluteJS" }],
    sessionId: "tts-session",
  });
  const chunks: Uint8Array[] = [];
  session.on("audio", (event) => {
    expect(event.format).toEqual({
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 24_000,
    });
    chunks.push(event.chunk as Uint8Array);
  });

  await session.send("Hello from the phone.");

  expect(requests).toHaveLength(1);
  expect(requests[0]!.url).toBe("https://api.openai.com/v1/audio/speech");
  expect(requests[0]!.body).toMatchObject({
    input: "Hello from the phone.",
    instructions: "Say AbsoluteJS clearly.",
    model: "gpt-4o-mini-tts",
    response_format: "pcm",
    voice: "marin",
  });
  expect(chunks.map((chunk) => Array.from(chunk))).toEqual([
    [0, 0, 32, 0],
    [224, 255, 0, 0],
  ]);
});

test("createOpenAIVoiceTTS reports recoverable errors for failed speech requests", async () => {
  const adapter = createOpenAIVoiceTTS({
    apiKey: "test-key",
    fetch: (async () =>
      new Response(JSON.stringify({ error: "rate limit" }), {
        status: 429,
      })) as typeof fetch,
  });
  const session = await adapter.open({
    sessionId: "tts-session-error",
  });
  const errors: Error[] = [];
  session.on("error", (event) => {
    expect(event.recoverable).toBe(true);
    errors.push(event.error);
  });

  await expect(session.send("Hello.")).rejects.toThrow(
    "OpenAI voice TTS failed: HTTP 429",
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]!.message).toBe("OpenAI voice TTS failed: HTTP 429");
});
