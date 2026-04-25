import {
	createVoiceAgent,
	createVoiceAgentSquad,
	type VoiceAgent,
	type VoiceAgentModel,
	type VoiceAgentOptions,
	type VoiceAgentSquadOptions,
	type VoiceAgentTool
} from './agent';
import {
	resolveVoiceOutcomeRecipe,
	type VoiceOutcomeRecipeName,
	type VoiceOutcomeRecipeOptions
} from './outcomeRecipes';
import type {
	VoiceNormalizedRouteConfig,
	VoiceOnTurnObjectHandler,
	VoiceRouteConfig,
	VoiceRouteResult,
	VoiceRuntimeOpsConfig,
	VoiceSessionRecord
} from './types';

export type VoiceAssistantPreset = VoiceOutcomeRecipeName;

export type VoiceAssistantArtifactPlan<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	preset?:
		| VoiceAssistantPreset
		| {
				name: VoiceAssistantPreset;
				options?: VoiceOutcomeRecipeOptions;
		  };
};

export type VoiceAssistantGuardrailInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = Parameters<VoiceOnTurnObjectHandler<TContext, TSession, TResult>>[0] & {
	assistantId: string;
};

export type VoiceAssistantOutputGuardrailInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoiceAssistantGuardrailInput<TContext, TSession, TResult> & {
	result: VoiceRouteResult<TResult>;
};

export type VoiceAssistantGuardrails<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	beforeTurn?: (
		input: VoiceAssistantGuardrailInput<TContext, TSession, TResult>
	) =>
		| Promise<VoiceRouteResult<TResult> | void>
		| VoiceRouteResult<TResult>
		| void;
	afterTurn?: (
		input: VoiceAssistantOutputGuardrailInput<TContext, TSession, TResult>
	) =>
		| Promise<VoiceRouteResult<TResult> | void>
		| VoiceRouteResult<TResult>
		| void;
};

export type VoiceAssistantVariant<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	id: string;
	maxToolRounds?: number;
	metadata?: Record<string, unknown>;
	model?: VoiceAgentModel<TContext, TSession, TResult>;
	system?: VoiceAgentOptions<TContext, TSession, TResult>['system'];
	tools?: Array<
		VoiceAgentTool<TContext, TSession, Record<string, unknown>, unknown, TResult>
	>;
	weight?: number;
};

export type VoiceAssistantExperimentResolverInput<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord
> = {
	assistantId: string;
	context: TContext;
	session: TSession;
	turnId?: string;
};

export type VoiceAssistantExperiment<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	id: string;
	resolve: (
		input: VoiceAssistantExperimentResolverInput<TContext, TSession>
	) => VoiceAssistantVariant<TContext, TSession, TResult>;
	variants: Array<VoiceAssistantVariant<TContext, TSession, TResult>>;
};

export type VoiceAssistantExperimentOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	id: string;
	selectVariant?: (
		input: VoiceAssistantExperimentResolverInput<TContext, TSession> & {
			variants: Array<VoiceAssistantVariant<TContext, TSession, TResult>>;
		}
	) => VoiceAssistantVariant<TContext, TSession, TResult> | string | void;
	variants: Array<VoiceAssistantVariant<TContext, TSession, TResult>>;
};

type VoiceAssistantAgentSource<
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
> =
	| {
			agent: VoiceAgent<TContext, TSession, TResult>;
			agents?: never;
			defaultAgentId?: never;
			maxHandoffsPerTurn?: never;
			maxToolRounds?: never;
			model?: never;
			selectAgent?: never;
			system?: never;
			tools?: never;
	  }
	| {
			agent?: never;
			agents: Array<VoiceAgent<TContext, TSession, TResult>>;
			defaultAgentId: string;
			maxHandoffsPerTurn?: number;
			maxToolRounds?: never;
			model?: never;
			selectAgent?: VoiceAgentSquadOptions<TContext, TSession, TResult>['selectAgent'];
			system?: never;
			tools?: never;
	  }
	| {
			agent?: never;
			agents?: never;
			defaultAgentId?: never;
			maxHandoffsPerTurn?: never;
			maxToolRounds?: number;
			model: VoiceAgentModel<TContext, TSession, TResult>;
			selectAgent?: never;
			system?: VoiceAgentOptions<TContext, TSession, TResult>['system'];
			tools?: Array<
				VoiceAgentTool<
					TContext,
					TSession,
					Record<string, unknown>,
					unknown,
					TResult
				>
			>;
	  };

export type VoiceAssistantOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = VoiceAssistantAgentSource<TContext, TSession, TResult> & {
	artifactPlan?: VoiceAssistantArtifactPlan<TContext, TSession, TResult>;
	experiment?: VoiceAssistantExperiment<TContext, TSession, TResult>;
	guardrails?: VoiceAssistantGuardrails<TContext, TSession, TResult>;
	id: string;
	ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	trace?: VoiceAgentOptions<TContext, TSession, TResult>['trace'];
};

export type VoiceAssistant<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	agent: VoiceAgent<TContext, TSession, TResult>;
	id: string;
	onTurn: VoiceOnTurnObjectHandler<TContext, TSession, TResult>;
	ops?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	route: (
		overrides: Omit<
			VoiceRouteConfig<TContext, TSession, TResult>,
			'onComplete' | 'onTurn'
		> & {
			onComplete?: VoiceRouteConfig<TContext, TSession, TResult>['onComplete'];
		}
	) => VoiceNormalizedRouteConfig<TContext, TSession, TResult>;
};

const hashString = (value: string) => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

const resolvePresetOps = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	artifactPlan?: VoiceAssistantArtifactPlan<TContext, TSession, TResult>
) => {
	const preset = artifactPlan?.preset;
	if (!preset) {
		return artifactPlan?.ops;
	}

	const recipe =
		typeof preset === 'string'
			? resolveVoiceOutcomeRecipe<TContext, TSession, TResult>(preset)
			: resolveVoiceOutcomeRecipe<TContext, TSession, TResult>(
					preset.name,
					preset.options
				);

	return {
		...recipe,
		...artifactPlan?.ops
	};
};

const mergeOps = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	base?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>,
	override?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>
) => {
	if (!base && !override) {
		return undefined;
	}

	return {
		...base,
		...override,
		taskAssignmentRules:
			base?.taskAssignmentRules || override?.taskAssignmentRules
				? [
						...(base?.taskAssignmentRules ?? []),
						...(override?.taskAssignmentRules ?? [])
					]
				: undefined,
		taskPolicies:
			base?.taskPolicies || override?.taskPolicies
				? {
						...(base?.taskPolicies ?? {}),
						...(override?.taskPolicies ?? {})
					}
				: undefined
	};
};

export const createVoiceExperiment = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAssistantExperimentOptions<TContext, TSession, TResult>
): VoiceAssistantExperiment<TContext, TSession, TResult> => {
	if (!options.variants.length) {
		throw new Error('createVoiceExperiment requires at least one variant.');
	}
	const firstVariant = options.variants[0] as VoiceAssistantVariant<
		TContext,
		TSession,
		TResult
	>;

	return {
		id: options.id,
		resolve: (input) => {
			const selected = options.selectVariant?.({
				...input,
				variants: options.variants
			});
			if (selected && typeof selected !== 'object') {
				const variant = options.variants.find((item) => item.id === selected);
				if (variant) {
					return variant;
				}
			}
			if (selected && typeof selected === 'object' && 'id' in selected) {
				return selected;
			}

			const totalWeight = options.variants.reduce(
				(total, variant) => total + Math.max(0, variant.weight ?? 1),
				0
			);
			if (totalWeight <= 0) {
				return firstVariant;
			}

			const bucket =
				hashString(`${options.id}:${input.assistantId}:${input.session.id}`) %
				totalWeight;
			let cursor = 0;
			for (const variant of options.variants) {
				cursor += Math.max(0, variant.weight ?? 1);
				if (bucket < cursor) {
					return variant;
				}
			}
			return firstVariant;
		},
		variants: options.variants
	};
};

export const createVoiceAssistant = <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAssistantOptions<TContext, TSession, TResult>
): VoiceAssistant<TContext, TSession, TResult> => {
	const ops = mergeOps(
		resolvePresetOps(options.artifactPlan),
		options.ops
	) as VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	let agent: VoiceAgent<TContext, TSession, TResult>;
	const baseModelOptions =
		'model' in options && options.model
			? {
					maxToolRounds: options.maxToolRounds,
					model: options.model,
					system: options.system,
					tools: options.tools
				}
			: undefined;

	if ('agent' in options && options.agent) {
		agent = options.agent;
	} else if ('agents' in options && options.agents) {
		agent = createVoiceAgentSquad({
			agents: options.agents,
			defaultAgentId: options.defaultAgentId,
			id: options.id,
			maxHandoffsPerTurn: options.maxHandoffsPerTurn,
			selectAgent: options.selectAgent,
			trace: options.trace
		});
	} else {
		agent = createVoiceAgent({
			id: options.id,
			maxToolRounds: options.maxToolRounds,
			model: options.model,
			system: options.system,
			trace: options.trace,
			tools: options.tools
		});
	}

	const onTurn: VoiceOnTurnObjectHandler<TContext, TSession, TResult> = async (
		input
	) => {
		const guardrailInput = {
			...input,
			assistantId: options.id
		};
		const blocked = await options.guardrails?.beforeTurn?.(guardrailInput);
		if (blocked) {
			return blocked;
		}

		const variant = options.experiment?.resolve({
			assistantId: options.id,
			context: input.context,
			session: input.session,
			turnId: input.turn.id
		});
		const runner =
			variant && baseModelOptions
				? createVoiceAgent({
						id: `${options.id}:${variant.id}`,
						maxToolRounds:
							variant.maxToolRounds ?? baseModelOptions.maxToolRounds,
						model: variant.model ?? baseModelOptions.model,
						system: variant.system ?? baseModelOptions.system,
						trace: options.trace,
						tools: variant.tools ?? baseModelOptions.tools
					})
				: agent;
		const result = (await runner.run(input)) ?? {};
		const guarded = await options.guardrails?.afterTurn?.({
			...guardrailInput,
			result
		});
		return guarded ?? result;
	};

	return {
		agent,
		id: options.id,
		onTurn,
		ops,
		route: (overrides) => ({
			...overrides,
			onComplete: overrides.onComplete ?? (() => undefined),
			onTurn
		})
	};
};
