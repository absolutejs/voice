import { expect, test } from "bun:test";
import { createVoiceScribe } from "../src/core/scribe";
import type { STTAdapter, STTSessionEventMap } from "../src/core/types";

// A fake STT vendor the test drives by hand.
const fakeStt = () => {
  const handlers: {
    [K in keyof STTSessionEventMap]?: ((e: STTSessionEventMap[K]) => void)[];
  } = {};
  const adapter = {
    kind: "stt",
    open: async () => ({
      on: <K extends keyof STTSessionEventMap>(
        event: K,
        handler: (e: STTSessionEventMap[K]) => void,
      ) => {
        (handlers[event] ??= [] as never[]).push(handler as never);
        return () => {};
      },
      send: async () => {},
      close: async () => {},
    }),
  } as unknown as STTAdapter;
  const fire = <K extends keyof STTSessionEventMap>(
    event: K,
    payload: STTSessionEventMap[K],
  ) => handlers[event]?.forEach((h) => h(payload as never));
  return { adapter, fire };
};
const final = (text: string) => ({
  type: "final" as const,
  receivedAt: 0,
  transcript: { id: text, isFinal: true, text, speaker: 1 },
});

test("end of turn carries the pieces of one utterance finalized mid-speech", async () => {
  const { adapter, fire } = fakeStt();
  const scribe = await createVoiceScribe({
    stt: adapter,
    sessionId: "s",
    format: {
      channels: 1,
      container: "raw",
      encoding: "pcm_s16le",
      sampleRateHz: 16000,
    },
  });
  const turns: string[] = [];
  const utterances: string[][] = [];
  scribe.on("turn", ({ turn }) => void turns.push(turn.text));
  scribe.on(
    "endOfTurn",
    ({ turns }) => void utterances.push(turns.map((t) => t.text)),
  );

  fire("final", final("Juniper, create a task."));
  fire("final", final("For AbsoluteJS to try the voice tester."));
  fire("final", final("Due Friday."));
  fire("endOfTurn", { type: "endOfTurn", reason: "vendor", receivedAt: 0 });
  // An end of turn with nothing new said is not an utterance.
  fire("endOfTurn", { type: "endOfTurn", reason: "vendor", receivedAt: 0 });
  fire("final", final("Thanks."));
  fire("endOfTurn", { type: "endOfTurn", reason: "vendor", receivedAt: 0 });

  expect(turns).toHaveLength(4);
  expect(utterances).toEqual([
    [
      "Juniper, create a task.",
      "For AbsoluteJS to try the voice tester.",
      "Due Friday.",
    ],
    ["Thanks."],
  ]);
});
