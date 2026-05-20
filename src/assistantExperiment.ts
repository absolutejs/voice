import type { DefinedVoiceAssistant } from "./defineVoiceAssistant";
import type { VoiceSessionRecord } from "./types";

export type VoiceAssistantVariant<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  /** Stable variant id used for trace tagging + rollups. */
  id: string;
  /** Relative weight when allocator is 'random' or 'sticky' bucketing. Default 1. */
  weight?: number;
  /** The assistant definition produced by defineVoiceAssistant. */
  assistant: DefinedVoiceAssistant<TContext, TSession, TResult>;
};

export type VoiceAssistantAllocatorInput<TContext = unknown> = {
  context: TContext;
  sessionId: string;
  stickyKey?: string;
};

export type VoiceAssistantAllocator<TContext = unknown> = (
  input: VoiceAssistantAllocatorInput<TContext>,
) => string;

export type VoiceAssistantExperimentOptions<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  /** Variant chooser. Default 'sticky' (hash of stickyKey → variant) when stickyKey is present, otherwise 'random'. */
  allocator?: "random" | "sticky" | VoiceAssistantAllocator<TContext>;
  /** Stable id for this experiment. Used in trace tagging. */
  experimentId: string;
  /** Callback for every allocation decision. Wire to trace.append({ type: 'assistant.experiment' }) for rollups. */
  onAllocation?: (input: {
    context: TContext;
    experimentId: string;
    sessionId: string;
    stickyKey?: string;
    variant: VoiceAssistantVariant<TContext, TSession, TResult>;
  }) => void;
  variants: ReadonlyArray<VoiceAssistantVariant<TContext, TSession, TResult>>;
};

export type VoiceAssistantExperimentDecision<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  experimentId: string;
  variant: VoiceAssistantVariant<TContext, TSession, TResult>;
};

export type VoiceAssistantExperiment<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = {
  allocate: (
    input: VoiceAssistantAllocatorInput<TContext>,
  ) => VoiceAssistantExperimentDecision<TContext, TSession, TResult>;
  experimentId: string;
  variants: ReadonlyArray<VoiceAssistantVariant<TContext, TSession, TResult>>;
};

const hashStickyKey = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const pickByWeight = <T extends { weight?: number }>(
  items: ReadonlyArray<T>,
  ratio: number,
): T => {
  if (items.length === 0) {
    throw new Error("Experiment has no variants");
  }
  const totalWeight = items.reduce(
    (sum, item) => sum + Math.max(0, item.weight ?? 1),
    0,
  );
  if (totalWeight <= 0) {
    return items[0]!;
  }
  const target = ratio * totalWeight;
  let cumulative = 0;
  for (const item of items) {
    cumulative += Math.max(0, item.weight ?? 1);
    if (target < cumulative) return item;
  }
  return items[items.length - 1]!;
};

export const createVoiceAssistantExperiment = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  options: VoiceAssistantExperimentOptions<TContext, TSession, TResult>,
): VoiceAssistantExperiment<TContext, TSession, TResult> => {
  if (options.variants.length === 0) {
    throw new Error(
      "createVoiceAssistantExperiment requires at least one variant",
    );
  }
  const allocator = options.allocator;
  const findById = (id: string) => {
    const found = options.variants.find((v) => v.id === id);
    return found ?? options.variants[0]!;
  };
  return {
    allocate: (input) => {
      let variantId: string;
      if (typeof allocator === "function") {
        variantId = allocator(input);
      } else if (allocator === "random") {
        const ratio = Math.random();
        variantId = pickByWeight(options.variants, ratio).id;
      } else {
        // sticky default
        const key = input.stickyKey ?? input.sessionId;
        const ratio = (hashStickyKey(key) % 10_000) / 10_000;
        variantId = pickByWeight(options.variants, ratio).id;
      }
      const variant = findById(variantId);
      options.onAllocation?.({
        context: input.context,
        experimentId: options.experimentId,
        sessionId: input.sessionId,
        stickyKey: input.stickyKey,
        variant,
      });
      return { experimentId: options.experimentId, variant };
    },
    experimentId: options.experimentId,
    variants: options.variants,
  };
};
