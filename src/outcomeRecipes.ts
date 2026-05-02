import type {
  StoredVoiceOpsTask,
  VoiceOpsDispositionTaskPolicies,
  VoiceOpsTaskAssignmentRules,
  VoiceOpsTaskKind,
  VoiceOpsTaskPriority,
} from "./ops";
import type { StoredVoiceCallReviewArtifact } from "./testing/review";
import type {
  VoiceCallDisposition,
  VoiceRuntimeOpsConfig,
  VoiceSessionRecord,
} from "./types";

export type VoiceOutcomeRecipeName =
  | "appointment-booking"
  | "lead-qualification"
  | "support-triage"
  | "voicemail-callback"
  | "warm-transfer";

export type VoiceOutcomeRecipeOptions = {
  assignee?: string;
  completedCreatesTask?: boolean;
  dueInMs?: number;
  escalationAssignee?: string;
  escalationQueue?: string;
  priority?: VoiceOpsTaskPriority;
  queue?: string;
  target?: string;
};

export type VoiceOutcomeRecipe<
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
> = Pick<
  VoiceRuntimeOpsConfig<TContext, TSession, TResult>,
  | "createTaskFromReview"
  | "resolveTaskPolicy"
  | "taskAssignmentRules"
  | "taskPolicies"
> & {
  description: string;
  name: VoiceOutcomeRecipeName;
};

type RecipeDefaults = {
  completedAction: string;
  completedDescription: string;
  completedKind: VoiceOpsTaskKind;
  completedTitle: string;
  defaultCompletedCreatesTask: boolean;
  defaultDueInMs: number;
  defaultPriority: VoiceOpsTaskPriority;
  defaultQueue: string;
  description: string;
  escalationQueue: string;
};

const RECIPE_DEFAULTS: Record<VoiceOutcomeRecipeName, RecipeDefaults> = {
  "appointment-booking": {
    completedAction:
      "Verify appointment details, confirm calendar state, and send any required confirmation.",
    completedDescription:
      "The call completed an appointment-booking flow and should be checked against the scheduling system.",
    completedKind: "appointment-booking",
    completedTitle: "Confirm booked appointment",
    defaultCompletedCreatesTask: true,
    defaultDueInMs: 30 * 60_000,
    defaultPriority: "normal",
    defaultQueue: "appointments",
    description:
      "Creates appointment confirmation work for completed calls and callback/retry work for missed booking attempts.",
    escalationQueue: "appointments-escalations",
  },
  "lead-qualification": {
    completedAction:
      "Review qualification signals, update CRM fields, and route the lead to the right owner.",
    completedDescription:
      "The call completed a lead-qualification flow and should be reviewed for sales follow-up.",
    completedKind: "lead-qualification",
    completedTitle: "Review qualified lead",
    defaultCompletedCreatesTask: true,
    defaultDueInMs: 15 * 60_000,
    defaultPriority: "high",
    defaultQueue: "sales-leads",
    description:
      "Creates sales follow-up work for completed qualification calls and fast callbacks for missed leads.",
    escalationQueue: "sales-escalations",
  },
  "support-triage": {
    completedAction:
      "Review the triage result, confirm the support category, and route any unresolved issue.",
    completedDescription:
      "The call completed support triage and may need queue routing or human follow-up.",
    completedKind: "support-triage",
    completedTitle: "Review support triage",
    defaultCompletedCreatesTask: true,
    defaultDueInMs: 20 * 60_000,
    defaultPriority: "normal",
    defaultQueue: "support-triage",
    description:
      "Creates support triage work for completed calls and urgent escalation/callback work for unresolved callers.",
    escalationQueue: "support-escalations",
  },
  "voicemail-callback": {
    completedAction: "No callback is required for completed calls.",
    completedDescription:
      "The call completed without requiring voicemail follow-up.",
    completedKind: "callback",
    completedTitle: "Completed call",
    defaultCompletedCreatesTask: false,
    defaultDueInMs: 15 * 60_000,
    defaultPriority: "high",
    defaultQueue: "callbacks",
    description:
      "Creates callback work for voicemail, no-answer, failed, or escalated calls while ignoring completed calls.",
    escalationQueue: "callback-escalations",
  },
  "warm-transfer": {
    completedAction:
      "Confirm the handoff target received the caller context and close the transfer loop.",
    completedDescription:
      "The call is part of a warm-transfer flow and should be verified downstream.",
    completedKind: "transfer-check",
    completedTitle: "Verify warm transfer",
    defaultCompletedCreatesTask: false,
    defaultDueInMs: 10 * 60_000,
    defaultPriority: "normal",
    defaultQueue: "transfer-verification",
    description:
      "Creates transfer verification work for transferred calls and escalation work when the handoff fails.",
    escalationQueue: "transfer-escalations",
  },
};

const buildRecipeTask = (input: {
  defaults: RecipeDefaults;
  disposition: VoiceCallDisposition;
  options: VoiceOutcomeRecipeOptions;
  review: StoredVoiceCallReviewArtifact;
}): StoredVoiceOpsTask | null => {
  const createdAt = input.review.generatedAt ?? Date.now();
  const queue = input.options.queue ?? input.defaults.defaultQueue;
  const target = input.options.target ?? input.review.postCall?.target;
  const common = {
    assignee: input.options.assignee,
    createdAt,
    history: [
      {
        actor: "system",
        at: createdAt,
        detail: input.review.postCall?.summary,
        type: "created" as const,
      },
    ],
    id: `${input.review.id}:${input.defaults.completedKind}`,
    intakeId: input.review.id,
    outcome: input.review.summary.outcome,
    priority: input.options.priority ?? input.defaults.defaultPriority,
    queue,
    reviewId: input.review.id,
    status: "open" as const,
    target,
    updatedAt: createdAt,
  };

  switch (input.disposition) {
    case "completed":
      if (
        !(
          input.options.completedCreatesTask ??
          input.defaults.defaultCompletedCreatesTask
        )
      ) {
        return null;
      }

      return {
        ...common,
        description: input.defaults.completedDescription,
        kind: input.defaults.completedKind,
        recommendedAction: input.defaults.completedAction,
        title: target
          ? `${input.defaults.completedTitle}: ${target}`
          : input.defaults.completedTitle,
      };
    case "voicemail":
      return {
        ...common,
        description:
          input.review.postCall?.summary ??
          "The caller reached voicemail and needs a callback.",
        id: `${input.review.id}:callback`,
        kind: "callback",
        recommendedAction:
          input.review.postCall?.recommendedAction ??
          "Call the customer back and continue the original flow.",
        title: target ? `Call back ${target}` : "Call back voicemail lead",
      };
    case "no-answer":
      return {
        ...common,
        description:
          input.review.postCall?.summary ??
          "The call did not reach a live respondent and should be retried.",
        id: `${input.review.id}:retry`,
        kind: "callback",
        recommendedAction:
          input.review.postCall?.recommendedAction ??
          "Retry the call or schedule a callback.",
        title: "Retry no-answer call",
      };
    case "transferred":
      return {
        ...common,
        description:
          input.review.postCall?.summary ??
          "The call was transferred and should be verified downstream.",
        id: `${input.review.id}:transfer-check`,
        kind: "transfer-check",
        recommendedAction:
          input.review.postCall?.recommendedAction ??
          "Confirm the receiving team got the caller context.",
        title: target ? `Verify transfer to ${target}` : "Verify call transfer",
      };
    case "escalated":
      return {
        ...common,
        description:
          input.review.postCall?.summary ??
          "The call escalated and needs human review.",
        id: `${input.review.id}:escalation`,
        kind: "escalation",
        priority: "urgent",
        queue: input.options.escalationQueue ?? input.defaults.escalationQueue,
        assignee: input.options.escalationAssignee ?? input.options.assignee,
        recommendedAction:
          input.review.postCall?.recommendedAction ??
          "Review the escalated call and respond immediately.",
        title: "Review escalated call",
      };
    case "failed":
    case "closed":
      return {
        ...common,
        description:
          input.review.postCall?.summary ??
          "The call ended before successful completion and needs review.",
        id: `${input.review.id}:retry-review`,
        kind: "retry-review",
        priority: "high",
        recommendedAction:
          input.review.postCall?.recommendedAction ??
          "Inspect the call and decide whether to retry, escalate, or close.",
        title: "Inspect incomplete call",
      };
    default:
      return null;
  }
};

export const resolveVoiceOutcomeRecipe = <
  TContext = unknown,
  TSession extends VoiceSessionRecord = VoiceSessionRecord,
  TResult = unknown,
>(
  name: VoiceOutcomeRecipeName,
  options: VoiceOutcomeRecipeOptions = {},
): VoiceOutcomeRecipe<TContext, TSession, TResult> => {
  const defaults = RECIPE_DEFAULTS[name];
  const taskPolicies: VoiceOpsDispositionTaskPolicies = {
    completed: {
      assignee: options.assignee,
      dueInMs: options.dueInMs ?? defaults.defaultDueInMs,
      name: `${name}-completed`,
      priority: options.priority ?? defaults.defaultPriority,
      queue: options.queue ?? defaults.defaultQueue,
    },
    escalated: {
      assignee: options.escalationAssignee ?? options.assignee,
      dueInMs: Math.min(
        options.dueInMs ?? defaults.defaultDueInMs,
        10 * 60_000,
      ),
      name: `${name}-escalation`,
      priority: "urgent",
      queue: options.escalationQueue ?? defaults.escalationQueue,
    },
    failed: {
      assignee: options.assignee,
      dueInMs: options.dueInMs ?? defaults.defaultDueInMs,
      name: `${name}-failed-review`,
      priority: "high",
      queue: options.queue ?? defaults.defaultQueue,
    },
    "no-answer": {
      assignee: options.assignee,
      dueInMs: options.dueInMs ?? defaults.defaultDueInMs,
      name: `${name}-no-answer`,
      priority: options.priority ?? defaults.defaultPriority,
      queue: options.queue ?? defaults.defaultQueue,
    },
    transferred: {
      assignee: options.assignee,
      dueInMs: Math.min(
        options.dueInMs ?? defaults.defaultDueInMs,
        20 * 60_000,
      ),
      name: `${name}-transfer-check`,
      priority: options.priority ?? defaults.defaultPriority,
      queue:
        name === "warm-transfer"
          ? (options.queue ?? defaults.defaultQueue)
          : "transfer-verification",
    },
    voicemail: {
      assignee: options.assignee,
      dueInMs: options.dueInMs ?? defaults.defaultDueInMs,
      name: `${name}-voicemail`,
      priority: options.priority ?? defaults.defaultPriority,
      queue: options.queue ?? defaults.defaultQueue,
    },
  };
  const taskAssignmentRules = [
    {
      assign: options.escalationAssignee ?? options.assignee,
      description: `Route urgent ${name} work to the escalation lane.`,
      name: `${name}-urgent-routing`,
      queue: options.escalationQueue ?? defaults.escalationQueue,
      when: {
        priority: "urgent" as const,
      },
    },
  ].filter(
    (rule) => rule.assign || rule.queue,
  ) satisfies VoiceOpsTaskAssignmentRules;

  return {
    createTaskFromReview: ({ disposition, review }) =>
      buildRecipeTask({
        defaults,
        disposition,
        options,
        review,
      }),
    description: defaults.description,
    name,
    taskAssignmentRules,
    taskPolicies,
  };
};
