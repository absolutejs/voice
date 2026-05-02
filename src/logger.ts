import type { VoiceLogger } from "./types";

const noop = () => {};

export const createNoopLogger = (): Required<VoiceLogger> => ({
  debug: noop,
  error: noop,
  info: noop,
  warn: noop,
});

export const resolveLogger = (logger?: VoiceLogger) => ({
  ...createNoopLogger(),
  ...logger,
});
