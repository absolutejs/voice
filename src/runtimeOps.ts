import {
	applyVoiceOpsTaskAssignmentRule,
	applyVoiceOpsTaskPolicy,
	buildVoiceOpsTaskFromReview,
	createVoiceCallCompletedEvent,
	createVoiceReviewSavedEvent,
	deliverVoiceIntegrationEvent,
	resolveVoiceOpsTaskAssignment,
	resolveVoiceOpsTaskPolicy,
	createVoiceTaskCreatedEvent,
	withVoiceOpsTaskId
} from './ops';
import { deliverVoiceIntegrationEventToSinks } from './opsSinks';
import { withVoiceCallReviewId } from './testing/review';
import type {
	StoredVoiceCallReviewArtifact,
	VoiceCallReviewArtifact
} from './testing/review';
import type {
	StoredVoiceIntegrationEvent,
	StoredVoiceOpsTask,
	VoiceOpsTask
} from './ops';
import type {
	VoiceCallDisposition,
	VoiceRuntimeOpsConfig,
	VoiceSessionHandle,
	VoiceSessionRecord
} from './types';

const defaultReviewTitle = (session: VoiceSessionRecord) =>
	session.scenarioId
		? `Voice call review: ${session.scenarioId}`
		: `Voice call review: ${session.id}`;

const buildDefaultPostCallSummary = (input: {
	disposition: VoiceCallDisposition;
	reason?: string;
	target?: string;
}): VoiceCallReviewArtifact['postCall'] => {
	switch (input.disposition) {
		case 'transferred':
			return {
				label: 'Transferred',
				recommendedAction: input.target
					? `Confirm the handoff to ${input.target} completed successfully.`
					: 'Confirm the transfer completed successfully.',
				reason: input.reason,
				summary: input.target
					? `The call was transferred to ${input.target}.`
					: 'The call was transferred.',
				target: input.target
			};
		case 'escalated':
			return {
				label: 'Escalated',
				recommendedAction: 'Review the escalated call and route it to a human operator.',
				reason: input.reason,
				summary: input.reason
					? `The call escalated because ${input.reason}.`
					: 'The call escalated for operator review.'
			};
		case 'voicemail':
			return {
				label: 'Voicemail',
				recommendedAction: 'Queue a callback follow-up for this caller.',
				reason: input.reason,
				summary: 'The call reached voicemail and needs a callback.'
			};
		case 'no-answer':
			return {
				label: 'No Answer',
				recommendedAction: 'Retry the call or create a callback task.',
				reason: input.reason,
				summary: 'The call did not reach a live respondent.'
			};
		case 'failed':
			return {
				label: 'Failed',
				recommendedAction: 'Inspect the call review before retrying this flow.',
				reason: input.reason,
				summary: input.reason
					? `The call failed because ${input.reason}.`
					: 'The call failed before a successful completion.'
			};
		case 'closed':
			return {
				label: 'Closed',
				recommendedAction: 'Inspect the review if this early closure was unexpected.',
				reason: input.reason,
				summary: 'The call closed before an explicit completion.'
			};
		case 'completed':
		default:
			return {
				label: 'Completed',
				recommendedAction: 'No follow-up action is required.',
				reason: input.reason,
				summary: 'The call completed successfully.'
			};
	}
};

export const createVoiceCallReviewFromSession = <
	TSession extends VoiceSessionRecord = VoiceSessionRecord
>(input: {
	disposition: VoiceCallDisposition;
	generatedAt?: number;
	reason?: string;
	session: TSession;
	target?: string;
}): VoiceCallReviewArtifact => {
	const generatedAt = input.generatedAt ?? Date.now();
	const actual = input.session.turns.map((turn) => turn.text).join(' ').trim();
	const elapsedMs =
		(input.session.lastActivityAt ?? generatedAt) - input.session.createdAt;

	return {
		errors: input.disposition === 'failed' && input.reason ? [input.reason] : [],
		generatedAt,
		latencyBreakdown: typeof elapsedMs === 'number' && elapsedMs >= 0
			? [
					{
						label: 'Session elapsed',
						valueMs: elapsedMs
					}
				]
			: [],
		notes: [],
		postCall: buildDefaultPostCallSummary({
			disposition: input.disposition,
			reason: input.reason,
			target: input.target
		}),
		summary: {
			elapsedMs: elapsedMs >= 0 ? elapsedMs : undefined,
			outcome: input.disposition,
			pass: input.disposition !== 'failed',
			turnCount: input.session.turns.length
		},
		title: defaultReviewTitle(input.session),
		timeline: input.session.call?.events.map((event) => ({
			atMs: Math.max(0, event.at - input.session.createdAt),
			event: `call-${event.type}`,
			reason: event.reason,
			source: 'turn' as const,
			text: event.target ?? event.disposition,
			track: event.target
		})) ?? [],
		transcript: {
			actual
		}
	};
};

const asStoredReview = (
	sessionId: string,
	review: VoiceCallReviewArtifact | StoredVoiceCallReviewArtifact
): StoredVoiceCallReviewArtifact => {
	if (typeof review.id === 'string' && review.id.length > 0) {
		return review as StoredVoiceCallReviewArtifact;
	}

	return withVoiceCallReviewId(`${sessionId}:review`, review);
};

const asStoredTask = (
	review: StoredVoiceCallReviewArtifact,
	task: Omit<VoiceOpsTask, 'id'> | VoiceOpsTask | StoredVoiceOpsTask
): StoredVoiceOpsTask => {
	if ('id' in task && typeof task.id === 'string' && task.id.length > 0) {
		return task as StoredVoiceOpsTask;
	}

	return withVoiceOpsTaskId(`${review.id}:ops`, task);
};

const emitRuntimeEvent = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	api: VoiceSessionHandle<TContext, TSession, TResult>;
	config: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	context: TContext;
	event: StoredVoiceIntegrationEvent;
	session: TSession;
}) => {
	let storedEvent = input.event;
	if (input.config.webhook || (input.config.sinks?.length ?? 0) > 0) {
		storedEvent = {
			...storedEvent,
			deliveryStatus: 'pending'
		};
	}

	await input.config.events?.set(storedEvent.id, storedEvent);

	if (input.config.webhook) {
		storedEvent = await deliverVoiceIntegrationEvent({
			event: storedEvent,
			webhook: input.config.webhook
		});
		await input.config.events?.set(storedEvent.id, storedEvent);
	}

	if (input.config.sinks && input.config.sinks.length > 0) {
		storedEvent = await deliverVoiceIntegrationEventToSinks({
			event: storedEvent,
			sinks: input.config.sinks
		});
		await input.config.events?.set(storedEvent.id, storedEvent);
	}

	await input.config.onEvent?.({
		api: input.api,
		context: input.context,
		event: storedEvent,
		session: input.session
	});
};

export const recordVoiceRuntimeOps = async <
	TContext,
	TSession extends VoiceSessionRecord,
	TResult
>(input: {
	api: VoiceSessionHandle<TContext, TSession, TResult>;
	config?: VoiceRuntimeOpsConfig<TContext, TSession, TResult>;
	context: TContext;
	disposition: VoiceCallDisposition;
	metadata?: Record<string, unknown>;
	reason?: string;
	session: TSession;
	target?: string;
}) => {
	if (!input.config) {
		return;
	}

	const result = input.session.turns.at(-1)?.result as TResult | undefined;
	const reviewCandidate =
		(await input.config.buildReview?.({
			api: input.api,
			context: input.context,
			disposition: input.disposition,
			metadata: input.metadata,
			reason: input.reason,
			result,
			session: input.session,
			target: input.target
		})) ??
		createVoiceCallReviewFromSession({
			disposition: input.disposition,
			reason: input.reason,
			session: input.session,
			target: input.target
		});

	const review = reviewCandidate
		? asStoredReview(input.session.id, reviewCandidate)
		: undefined;

	if (review) {
		await input.config.reviews?.set(review.id, review);
		await emitRuntimeEvent({
			api: input.api,
			config: input.config,
			context: input.context,
			event: createVoiceReviewSavedEvent(review),
			session: input.session
		});
	}

	let task: StoredVoiceOpsTask | undefined;
	if (review) {
		const taskCandidate =
			(await input.config.createTaskFromReview?.({
				api: input.api,
				context: input.context,
				disposition: input.disposition,
				review,
				session: input.session
			})) ??
			buildVoiceOpsTaskFromReview(review) ??
			undefined;
		if (taskCandidate) {
			task = asStoredTask(review, taskCandidate);
			const configuredPolicy =
				(await input.config.resolveTaskPolicy?.({
					api: input.api,
					context: input.context,
					disposition: input.disposition,
					metadata: input.metadata,
					reason: input.reason,
					review,
					session: input.session,
					target: input.target,
					task
				})) ??
				resolveVoiceOpsTaskPolicy({
					disposition: input.disposition,
					policies: input.config.taskPolicies
				});
			if (configuredPolicy) {
				task = applyVoiceOpsTaskPolicy(task, configuredPolicy, {
					at: review.generatedAt,
					detail: review.postCall?.summary
				});
			}
			const configuredAssignment =
				(await input.config.resolveTaskAssignment?.({
					api: input.api,
					context: input.context,
					disposition: input.disposition,
					metadata: input.metadata,
					reason: input.reason,
					review,
					session: input.session,
					target: input.target,
					task
				})) ??
				resolveVoiceOpsTaskAssignment({
					rules: input.config.taskAssignmentRules,
					task
				});
			if (configuredAssignment) {
				task = applyVoiceOpsTaskAssignmentRule(task, configuredAssignment, {
					at: review.generatedAt
				});
			}
			await input.config.tasks?.set(task.id, task);
			await emitRuntimeEvent({
				api: input.api,
				config: input.config,
				context: input.context,
				event: createVoiceTaskCreatedEvent(task),
				session: input.session
			});
		}
	}

	await emitRuntimeEvent({
		api: input.api,
		config: input.config,
		context: input.context,
		event: createVoiceCallCompletedEvent({
			disposition: input.disposition,
			session: input.session
		}),
		session: input.session
	});

	return {
		review,
		task
	};
};
