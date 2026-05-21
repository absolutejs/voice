import type { VoiceLogger } from "./types";

const noop = () => {};

const createNoopLogger = (): Required<VoiceLogger> => ({
  debug: noop,
  error: noop,
  info: noop,
  warn: noop,
});

export const resolveLogger = (logger?: VoiceLogger) => ({
  ...createNoopLogger(),
  ...logger,
});
