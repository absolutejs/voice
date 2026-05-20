import type { VoicePluginConfig, VoiceSessionRecord } from "./types";

/**
 * Type-safe identity helper for authoring a `voice()` plugin config as a
 * standalone value. Lets you extract a large configuration object out of the
 * server file with full type-checking and autocomplete, then pass it straight
 * to `voice(config)`.
 */
export const createVoiceConfiguration = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  configuration: VoicePluginConfig<TContext, TSession, TResult>,
): VoicePluginConfig<TContext, TSession, TResult> => configuration;
