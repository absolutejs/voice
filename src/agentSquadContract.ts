import type {
	VoiceAgent,
	VoiceAgentRunResult
} from './agent';
import { createVoiceSessionRecord } from './store';
import type { StoredVoiceTraceEvent, VoiceTraceEventStore } from './trace';
import type {
	VoiceRouteResult,
	VoiceSessionHandle,
	VoiceSessionRecord,
	VoiceTurnRecord
} from './types';

export type VoiceAgentSquadContractOutcome =
	| 'assistant'
	| 'complete'
	| 'escalate'
	| 'no-answer'
	| 'transfer'
	| 'voicemail';

export type VoiceAgentSquadHandoffExpectation = {
	fromAgentId?: string;
	status?: 'allowed' | 'blocked' | 'max-exceeded' | 'unknown-target';
	targetAgentId?: string;
};

export type VoiceAgentSquadTurnExpectation<TResult = unknown> = {
	assistantIncludes?: string[];
	finalAgentId?: string;
	handoffs?: VoiceAgentSquadHandoffExpectation[];
	outcome?: VoiceAgentSquadContractOutcome;
	result?: (input: {
		result: TResult | undefined;
		routeResult: VoiceRouteResult<TResult>;
	}) => VoiceAgentSquadContractIssue[];
	transferTarget?: string;
};

export type VoiceAgentSquadContractTurn<TResult = unknown> = {
	expect?: VoiceAgentSquadTurnExpectation<TResult>;
	id?: string;
	text: string;
};

export type VoiceAgentSquadContractDefinition<TResult = unknown> = {
	description?: string;
	id: string;
	label?: string;
	scenarioId?: string;
	turns: Array<VoiceAgentSquadContractTurn<TResult>>;
};

export type VoiceAgentSquadContractIssue = {
	code: string;
	message: string;
	turnId?: string;
};

export type VoiceAgentSquadContractTurnReport<TResult = unknown> = {
	agentId: string;
	handoffs: VoiceAgentSquadHandoffExpectation[];
	issues: VoiceAgentSquadContractIssue[];
	outcome?: VoiceAgentSquadContractOutcome;
	pass: boolean;
	result: VoiceAgentRunResult<TResult>;
	turnId: string;
};

export type VoiceAgentSquadContractReport<TResult = unknown> = {
	contractId: string;
	issues: VoiceAgentSquadContractIssue[];
	pass: boolean;
	scenarioId?: string;
	sessionId: string;
	turns: Array<VoiceAgentSquadContractTurnReport<TResult>>;
};

export type VoiceAgentSquadContractRunOptions<
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
> = {
	api?: VoiceSessionHandle<TContext, TSession, TResult>;
	context: TContext;
	contract: VoiceAgentSquadContractDefinition<TResult>;
	session?: TSession;
	squad: VoiceAgent<TContext, TSession, TResult>;
	trace?: VoiceTraceEventStore;
};

const normalizeIncludes = (value: string) => value.trim().toLowerCase();

const resolveOutcome = <TResult>(
	result: VoiceRouteResult<TResult>
): VoiceAgentSquadContractOutcome | undefined => {
	if (result.complete) return 'complete';
	if (result.transfer) return 'transfer';
	if (result.escalate) return 'escalate';
	if (result.voicemail) return 'voicemail';
	if (result.noAnswer) return 'no-answer';
	if (result.assistantText?.trim()) return 'assistant';
	return undefined;
};

const getPayloadString = (
	event: StoredVoiceTraceEvent,
	key: string
): string | undefined => {
	const value = event.payload[key];
	return typeof value === 'string' ? value : undefined;
};

const toHandoffExpectation = (
	event: StoredVoiceTraceEvent
): VoiceAgentSquadHandoffExpectation => ({
	fromAgentId: getPayloadString(event, 'fromAgentId'),
	status: getPayloadString(event, 'status') as
		| VoiceAgentSquadHandoffExpectation['status']
		| undefined,
	targetAgentId: getPayloadString(event, 'targetAgentId')
});

const createContractApi = <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(
	session: TSession
): VoiceSessionHandle<TContext, TSession, TResult> =>
	({
		close: async () => {},
		commitTurn: async () => {},
		complete: async () => {},
		connect: async () => {},
		disconnect: async () => {},
		escalate: async () => {},
		fail: async () => {},
		id: session.id,
		markNoAnswer: async () => {},
		markVoicemail: async () => {},
		receiveAudio: async () => {},
		snapshot: async () => session,
		transfer: async () => {}
	}) as VoiceSessionHandle<TContext, TSession, TResult>;

const createContractTurn = <TResult>(
	turn: VoiceAgentSquadContractTurn<TResult>,
	index: number
): VoiceTurnRecord<TResult> => ({
	committedAt: Date.now(),
	id: turn.id ?? `turn-${index + 1}`,
	text: turn.text,
	transcripts: []
});

const appendIssue = (
	issues: VoiceAgentSquadContractIssue[],
	issue: VoiceAgentSquadContractIssue,
	turnId: string
) => {
	issues.push({
		...issue,
		turnId: issue.turnId ?? turnId
	});
};

export const runVoiceAgentSquadContract = async <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAgentSquadContractRunOptions<TContext, TSession, TResult>
): Promise<VoiceAgentSquadContractReport<TResult>> => {
	const session =
		options.session ??
		createVoiceSessionRecord<TSession>(
			`agent-squad-contract-${options.contract.id}`,
			options.contract.scenarioId ?? options.contract.id
		);
	const api = options.api ?? createContractApi<TContext, TSession, TResult>(session);
	const turnReports: Array<VoiceAgentSquadContractTurnReport<TResult>> = [];
	const issues: VoiceAgentSquadContractIssue[] = [];

	for (const [index, contractTurn] of options.contract.turns.entries()) {
		const turn = createContractTurn(contractTurn, index);
		const result = await options.squad.run({
			api,
			context: options.context,
			session,
			turn
		});
		const handoffEvents =
			(await options.trace?.list({
				sessionId: session.id,
				turnId: turn.id,
				type: 'agent.handoff'
			})) ?? [];
		const handoffs = handoffEvents.map(toHandoffExpectation);
		const turnIssues: VoiceAgentSquadContractIssue[] = [];
		const expected = contractTurn.expect;
		const outcome = resolveOutcome(result);

		if (expected?.finalAgentId && result.agentId !== expected.finalAgentId) {
			appendIssue(
				turnIssues,
				{
					code: 'agent_squad.final_agent_mismatch',
					message: `Expected final agent ${expected.finalAgentId}, saw ${result.agentId}.`
				},
				turn.id
			);
		}

		if (expected?.outcome && outcome !== expected.outcome) {
			appendIssue(
				turnIssues,
				{
					code: 'agent_squad.outcome_mismatch',
					message: `Expected outcome ${expected.outcome}, saw ${outcome ?? 'none'}.`
				},
				turn.id
			);
		}

		if (
			expected?.transferTarget &&
			result.transfer?.target !== expected.transferTarget
		) {
			appendIssue(
				turnIssues,
				{
					code: 'agent_squad.transfer_target_mismatch',
					message: `Expected transfer target ${expected.transferTarget}, saw ${result.transfer?.target ?? 'none'}.`
				},
				turn.id
			);
		}

		const assistantText = normalizeIncludes(result.assistantText ?? '');
		for (const expectedText of expected?.assistantIncludes ?? []) {
			if (!assistantText.includes(normalizeIncludes(expectedText))) {
				appendIssue(
					turnIssues,
					{
						code: 'agent_squad.assistant_text_missing',
						message: `Expected assistant text to include: ${expectedText}`
					},
					turn.id
				);
			}
		}

		for (const [handoffIndex, expectedHandoff] of (
			expected?.handoffs ?? []
		).entries()) {
			const actual = handoffs[handoffIndex];
			if (!actual) {
				appendIssue(
					turnIssues,
					{
						code: 'agent_squad.handoff_missing',
						message: `Expected handoff ${handoffIndex + 1}, but no trace event was recorded.`
					},
					turn.id
				);
				continue;
			}

			for (const key of ['fromAgentId', 'status', 'targetAgentId'] as const) {
				if (expectedHandoff[key] && actual[key] !== expectedHandoff[key]) {
					appendIssue(
						turnIssues,
						{
							code: 'agent_squad.handoff_mismatch',
							message: `Expected handoff ${handoffIndex + 1} ${key} ${expectedHandoff[key]}, saw ${actual[key] ?? 'none'}.`
						},
						turn.id
					);
				}
			}
		}

		for (const issue of
			expected?.result?.({
				result: result.result,
				routeResult: result
			}) ?? []) {
			appendIssue(turnIssues, issue, turn.id);
		}

		issues.push(...turnIssues);
		turnReports.push({
			agentId: result.agentId,
			handoffs,
			issues: turnIssues,
			outcome,
			pass: turnIssues.length === 0,
			result,
			turnId: turn.id
		});
		session.turns.push({
			...turn,
			assistantText: result.assistantText,
			result: result.result
		});
	}

	return {
		contractId: options.contract.id,
		issues,
		pass: issues.length === 0,
		scenarioId: options.contract.scenarioId,
		sessionId: session.id,
		turns: turnReports
	};
};

export const assertVoiceAgentSquadContract = async <
	TContext = unknown,
	TSession extends VoiceSessionRecord = VoiceSessionRecord,
	TResult = unknown
>(
	options: VoiceAgentSquadContractRunOptions<TContext, TSession, TResult>
): Promise<VoiceAgentSquadContractReport<TResult>> => {
	const report = await runVoiceAgentSquadContract(options);
	if (!report.pass) {
		throw new Error(
			`Voice agent squad contract ${report.contractId} failed: ${report.issues
				.map((issue) => issue.message)
				.join(' ')}`
		);
	}
	return report;
};
