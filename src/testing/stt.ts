import {
  mergeFinalTranscriptText,
  scoreTranscriptAccuracy,
  type VoiceTranscriptAccuracy,
} from "./accuracy";
import { buildTurnText } from "../turnDetection";
import type {
  STTAdapter,
  STTAdapterOpenOptions,
  Transcript,
  VoiceCloseEvent,
  VoiceEndOfTurnEvent,
  VoiceErrorEvent,
  VoiceFinalEvent,
  VoicePartialEvent,
} from "../types";
import type { VoiceTestFixture } from "./fixtures";

export type VoiceSTTAdapterHarnessOptions = {
  chunkDurationMs?: number;
  idleTimeoutMs?: number;
  openOptions?:
    | Partial<STTAdapterOpenOptions>
    | ((
        fixture: VoiceTestFixture,
      ) => Partial<STTAdapterOpenOptions> | undefined);
  settleMs?: number;
  tailPaddingMs?: number;
  transcriptThreshold?: number;
  waitForRealtimeMs?: number;
};

export type VoiceSTTAdapterHarnessResult = {
  accuracy: VoiceTranscriptAccuracy;
  closeEvents: VoiceCloseEvent[];
  endOfTurnEvents: VoiceEndOfTurnEvent[];
  errorEvents: VoiceErrorEvent[];
  finalEvents: VoiceFinalEvent[];
  finalText: string;
  partialEvents: VoicePartialEvent[];
  speechEndedAt: number;
  startedAt: number;
};

const chunkAudio = (audio: Uint8Array, bytesPerChunk: number) => {
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < audio.byteLength; offset += bytesPerChunk) {
    chunks.push(audio.slice(offset, offset + bytesPerChunk));
  }

  return chunks;
};

const createSilence = (byteLength: number) => new Uint8Array(byteLength);

const waitForIdle = async (
  readLastActivityAt: () => number,
  idleTimeoutMs: number,
  settleMs: number,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < idleTimeoutMs) {
    if (Date.now() - readLastActivityAt() >= settleMs) {
      return;
    }

    await Bun.sleep(Math.min(50, settleMs));
  }
};

export const runSTTAdapterFixture = async (
  adapter: STTAdapter,
  fixture: VoiceTestFixture,
  options: VoiceSTTAdapterHarnessOptions = {},
): Promise<VoiceSTTAdapterHarnessResult> => {
  const startedAt = Date.now();
  const partialEvents: VoicePartialEvent[] = [];
  const finalEvents: VoiceFinalEvent[] = [];
  const endOfTurnEvents: VoiceEndOfTurnEvent[] = [];
  const errorEvents: VoiceErrorEvent[] = [];
  const closeEvents: VoiceCloseEvent[] = [];
  const chunkDurationMs =
    options.chunkDurationMs ?? fixture.chunkDurationMs ?? 100;
  const tailPaddingMs = options.tailPaddingMs ?? fixture.tailPaddingMs ?? 1_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 8_000;
  const settleMs = options.settleMs ?? 500;
  const waitForRealtimeMs = options.waitForRealtimeMs ?? 0;
  let lastActivityAt = Date.now();
  let speechEndedAt = startedAt;

  const markActive = () => {
    lastActivityAt = Date.now();
  };

  const resolvedOpenOptions =
    typeof options.openOptions === "function"
      ? options.openOptions(fixture)
      : options.openOptions;
  const session = await adapter.open({
    format: fixture.format,
    sessionId: `fixture-${fixture.id}`,
    ...(resolvedOpenOptions ?? {}),
  });

  const unsubscribers = [
    session.on("partial", (event) => {
      partialEvents.push(event);
      markActive();
    }),
    session.on("final", (event) => {
      finalEvents.push(event);
      markActive();
    }),
    session.on("endOfTurn", (event) => {
      endOfTurnEvents.push(event);
      markActive();
    }),
    session.on("error", (event) => {
      errorEvents.push(event);
      markActive();
    }),
    session.on("close", (event) => {
      closeEvents.push(event);
      markActive();
    }),
  ];

  try {
    const bytesPerMillisecond =
      (fixture.format.sampleRateHz * fixture.format.channels * 2) / 1_000;
    const bytesPerChunk = Math.max(
      2,
      Math.floor(bytesPerMillisecond * chunkDurationMs),
    );
    const chunks = chunkAudio(fixture.audio, bytesPerChunk);
    const realtimeDelayMs =
      waitForRealtimeMs > 0 ? waitForRealtimeMs : chunkDurationMs;

    for (const chunk of chunks) {
      await session.send(chunk);
      markActive();
      await Bun.sleep(realtimeDelayMs);
    }

    // The end of the real fixture audio is the user-perceived speech boundary.
    // Tail padding is synthetic silence used only to let providers finalize.
    speechEndedAt = Date.now();

    if (tailPaddingMs > 0) {
      const tailBytes = Math.max(
        2,
        Math.floor(bytesPerMillisecond * tailPaddingMs),
      );
      for (const chunk of chunkAudio(createSilence(tailBytes), bytesPerChunk)) {
        await session.send(chunk);
        markActive();
        await Bun.sleep(realtimeDelayMs);
      }
    }

    await waitForIdle(() => lastActivityAt, idleTimeoutMs, settleMs);
  } finally {
    await session.close("fixture-complete");
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }

  const finalTranscripts = finalEvents.map((event) => ({
    ...(event.transcript as Transcript),
    // For benchmark transcript assembly, receive order is more reliable than
    // provider timing metadata on late mixed-language continuations.
    endedAtMs: event.receivedAt - startedAt,
    startedAtMs: event.receivedAt - startedAt,
  }));
  const trailingPartial = [...partialEvents].reverse().find((event) => {
    const text = event.transcript.text.trim();
    if (!text) {
      return false;
    }

    const lastFinalReceivedAt = finalEvents.at(-1)?.receivedAt ?? 0;
    return event.receivedAt >= lastFinalReceivedAt;
  });
  const finalText =
    trailingPartial && finalTranscripts.length > 0
      ? buildTurnText(finalTranscripts, trailingPartial.transcript.text, {
          partialEndedAtMs: trailingPartial.receivedAt - startedAt,
          partialStartedAtMs: trailingPartial.receivedAt - startedAt,
        })
      : mergeFinalTranscriptText(finalTranscripts);

  return {
    accuracy: scoreTranscriptAccuracy(
      finalText,
      fixture.expectedText,
      options.transcriptThreshold,
    ),
    closeEvents,
    endOfTurnEvents,
    errorEvents,
    finalEvents,
    finalText,
    partialEvents,
    speechEndedAt,
    startedAt,
  };
};
