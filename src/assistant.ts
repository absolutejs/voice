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
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from './trace';

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

export type VoiceAssistantRunSummary = {
	assistantId: string;
	artifactPlans: Record<string, number>;
	averageElapsedMs?: number;
	blockedGuardrailCount: number;
	escalationCount: number;
	experiments: Record<string, number>;
	guardrailCount: number;
	outcomes: Record<string, number>;
	runCount: number;
	sessions: number;
	toolCalls: Record<string, number>;
	transferCount: number;
	variants: Record<string, number>;
};

export type VoiceAssistantRunsSummary = {
	assistants: VoiceAssistantRunSummary[];
	totalRuns: number;
};

const hashString = (value: string) => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

const increment = (record: Record<string, number>, key: string) => {
	record[key] = (record[key] ?? 0) + 1;
};

const resolveOutcome = <TResult>(result: VoiceRouteResult<TResult>) => {
	if (result.transfer) {
		return 'transferred';
	}
	if (result.escalate) {
		return 'escalated';
	}
	if (result.voicemail) {
		return 'voicemail';
	}
	if (result.noAnswer) {
		return 'no-answer';
	}
	if (result.complete) {
		return 'completed';
	}
	return 'continued';
};

const resolveArtifactPlanName = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	artifactPlan?: VoiceAssistantArtifactPlan<TContext, TSession, TResult>
) => {
	const preset = artifactPlan?.preset;
	if (!preset) {
		return artifactPlan?.ops ? 'custom' : undefined;
	}

	return typeof preset === 'string' ? preset : preset.name;
};

const appendAssistantTrace = async (input: {
	assistantId: string;
	event: Record<string, unknown>;
	session: VoiceSessionRecord;
	trace?: VoiceTraceEventStore;
	turnId?: string;
	type: 'assistant.guardrail' | 'assistant.run';
}) => {
	await input.trace?.append({
		at: Date.now(),
		payload: {
			assistantId: input.assistantId,
			...input.event
		},
		scenarioId: input.session.scenarioId,
		sessionId: input.session.id,
		turnId: input.turnId,
		type: input.type
	});
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
	const artifactPlanName = resolveArtifactPlanName(options.artifactPlan);
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
			await appendAssistantTrace({
				assistantId: options.id,
				event: {
					action: 'blocked',
					artifactPlan: artifactPlanName,
					outcome: resolveOutcome(blocked)
				},
				session: input.session,
				trace: options.trace,
				turnId: input.turn.id,
				type: 'assistant.guardrail'
			});
			await appendAssistantTrace({
				assistantId: options.id,
				event: {
					artifactPlan: artifactPlanName,
					blocked: true,
					experimentId: options.experiment?.id,
					outcome: resolveOutcome(blocked)
				},
				session: input.session,
				trace: options.trace,
				turnId: input.turn.id,
				type: 'assistant.run'
			});
			return blocked;
		}

		const startedAt = Date.now();
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
		const runResult = (await runner.run(input)) ?? {};
		const result = runResult as VoiceRouteResult<TResult> & {
			toolResults?: Array<{ toolName: string }>;
		};
		const guarded = await options.guardrails?.afterTurn?.({
			...guardrailInput,
			result
		});
		const finalResult = guarded ?? result;
		if (guarded) {
			await appendAssistantTrace({
				assistantId: options.id,
				event: {
					action: 'rewritten',
					artifactPlan: artifactPlanName,
					experimentId: options.experiment?.id,
					outcome: resolveOutcome(finalResult),
					variantId: variant?.id
				},
				session: input.session,
				trace: options.trace,
				turnId: input.turn.id,
				type: 'assistant.guardrail'
			});
		}
		await appendAssistantTrace({
			assistantId: options.id,
			event: {
				artifactPlan: artifactPlanName,
				blocked: false,
				elapsedMs: Date.now() - startedAt,
				escalated: Boolean(finalResult.escalate),
				experimentId: options.experiment?.id,
				outcome: resolveOutcome(finalResult),
				toolNames: result.toolResults?.map((tool) => tool.toolName) ?? [],
				transferred: Boolean(finalResult.transfer),
				variantId: variant?.id
			},
			session: input.session,
			trace: options.trace,
			turnId: input.turn.id,
			type: 'assistant.run'
		});
		return finalResult;
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

export const summarizeVoiceAssistantRuns = async (input:
	| StoredVoiceTraceEvent[]
	| {
			events?: StoredVoiceTraceEvent[];
			store?: VoiceTraceEventStore;
	  }): Promise<VoiceAssistantRunsSummary> => {
	const events = Array.isArray(input)
		? input
		: (input.events ?? (await input.store?.list()) ?? []);
	const assistantRuns = events.filter((event) => event.type === 'assistant.run');
	const guardrails = events.filter(
		(event) => event.type === 'assistant.guardrail'
	);
	const byAssistant = new Map<
		string,
		VoiceAssistantRunSummary & {
			elapsedCount: number;
			elapsedTotal: number;
			sessionIds: Set<string>;
		}
	>();
	const getSummary = (assistantId: string) => {
		let summary = byAssistant.get(assistantId);
		if (!summary) {
			summary = {
				assistantId,
				artifactPlans: {},
				blockedGuardrailCount: 0,
				elapsedCount: 0,
				elapsedTotal: 0,
				escalationCount: 0,
				experiments: {},
				guardrailCount: 0,
				outcomes: {},
				runCount: 0,
				sessionIds: new Set<string>(),
				sessions: 0,
				toolCalls: {},
				transferCount: 0,
				variants: {}
			};
			byAssistant.set(assistantId, summary);
		}
		return summary;
	};

	for (const event of assistantRuns) {
		const assistantId =
			typeof event.payload.assistantId === 'string'
				? event.payload.assistantId
				: 'unknown';
		const summary = getSummary(assistantId);
		summary.runCount += 1;
		summary.sessionIds.add(event.sessionId);

		if (typeof event.payload.artifactPlan === 'string') {
			increment(summary.artifactPlans, event.payload.artifactPlan);
		}
		if (typeof event.payload.experimentId === 'string') {
			increment(summary.experiments, event.payload.experimentId);
		}
		if (typeof event.payload.variantId === 'string') {
			increment(summary.variants, event.payload.variantId);
		}
		if (typeof event.payload.outcome === 'string') {
			increment(summary.outcomes, event.payload.outcome);
		}
		if (event.payload.escalated === true) {
			summary.escalationCount += 1;
		}
		if (event.payload.transferred === true) {
			summary.transferCount += 1;
		}
		if (event.payload.blocked === true) {
			summary.blockedGuardrailCount += 1;
		}
		if (typeof event.payload.elapsedMs === 'number') {
			summary.elapsedCount += 1;
			summary.elapsedTotal += event.payload.elapsedMs;
		}
		if (Array.isArray(event.payload.toolNames)) {
			for (const toolName of event.payload.toolNames) {
				if (typeof toolName === 'string') {
					increment(summary.toolCalls, toolName);
				}
			}
		}
	}

	for (const event of guardrails) {
		const assistantId =
			typeof event.payload.assistantId === 'string'
				? event.payload.assistantId
				: 'unknown';
		const summary = getSummary(assistantId);
		summary.guardrailCount += 1;
	}

	const assistants = [...byAssistant.values()].map(
		({ elapsedCount, elapsedTotal, sessionIds, ...summary }) => ({
			...summary,
			averageElapsedMs:
				elapsedCount > 0 ? Math.round(elapsedTotal / elapsedCount) : undefined,
			sessions: sessionIds.size
		})
	);

	return {
		assistants: assistants.sort((left, right) =>
			left.assistantId.localeCompare(right.assistantId)
		),
		totalRuns: assistantRuns.length
	};
};
