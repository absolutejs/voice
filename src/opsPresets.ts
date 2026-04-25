import type {
	VoiceOpsDispositionTaskPolicies,
	VoiceOpsTaskAssignmentRules,
	VoiceOpsSLABreachPolicy
} from './ops';

export type VoiceOpsPresetName =
	| 'support-default'
	| 'sales-default'
	| 'collections-default';

export type VoiceResolvedOpsPreset = {
	assignmentRules: VoiceOpsTaskAssignmentRules;
	description: string;
	name: VoiceOpsPresetName;
	sla: {
		followUpTask?: VoiceOpsSLABreachPolicy;
	};
	taskPolicies: VoiceOpsDispositionTaskPolicies;
};

type VoiceOpsPresetInput = Omit<VoiceResolvedOpsPreset, 'name'>;

export type VoiceOpsPresetOverrides = {
	assignmentRules?: VoiceOpsTaskAssignmentRules;
	sla?: {
		followUpTask?: VoiceOpsSLABreachPolicy;
	};
	taskPolicies?: VoiceOpsDispositionTaskPolicies;
};

const PRESET_INPUTS: Record<VoiceOpsPresetName, VoiceOpsPresetInput> = {
	'collections-default': {
		description:
			'Biases toward fast callback recovery, aggressive retry routing, and supervisor escalation for overdue debt or collections follow-up.',
		assignmentRules: [
			{
				assign: 'collections-priority-team',
				description: 'Urgent collections work goes to the priority response team.',
				name: 'collections-priority-routing',
				queue: 'collections-priority',
				when: {
					priority: 'urgent'
				}
			}
		],
		sla: {
			followUpTask: {
				assignee: 'collections-supervisors',
				description:
					'This collections task missed its SLA and requires supervisor review.',
				dueInMs: 10 * 60_000,
				name: 'collections-sla-escalation',
				priority: 'urgent',
				queue: 'collections-supervisors',
				recommendedAction:
					'Review the overdue collections task and decide whether to escalate, reassign, or retry immediately.',
				title: 'Collections SLA escalation'
			}
		},
		taskPolicies: {
			escalated: {
				assignee: 'collections-supervisors',
				dueInMs: 10 * 60_000,
				name: 'collections-escalation',
				priority: 'urgent',
				queue: 'collections-supervisors'
			},
			failed: {
				assignee: 'collections-ops',
				dueInMs: 15 * 60_000,
				name: 'collections-failed-review',
				priority: 'high',
				queue: 'collections-ops'
			},
			'no-answer': {
				assignee: 'collections-retries',
				dueInMs: 45 * 60_000,
				name: 'collections-no-answer',
				priority: 'high',
				queue: 'collections-retries'
			},
			transferred: {
				assignee: 'collections-verification',
				dueInMs: 20 * 60_000,
				name: 'collections-transfer-verification',
				priority: 'normal',
				queue: 'collections-verification'
			},
			voicemail: {
				assignee: 'collections-callbacks',
				dueInMs: 20 * 60_000,
				name: 'collections-voicemail',
				priority: 'high',
				queue: 'collections-callbacks'
			}
		}
	},
	'sales-default': {
		description:
			'Biases toward rapid callback recovery and handoff verification for inbound or outbound sales flows.',
		assignmentRules: [
			{
				assign: 'sales-priority-desk',
				description: 'Urgent sales follow-up goes to the priority desk.',
				name: 'sales-priority-routing',
				queue: 'sales-priority',
				when: {
					priority: 'urgent'
				}
			}
		],
		sla: {
			followUpTask: {
				assignee: 'sales-leads',
				description:
					'This sales task missed its SLA and should be reviewed by a lead.',
				dueInMs: 15 * 60_000,
				name: 'sales-sla-escalation',
				priority: 'urgent',
				queue: 'sales-leads',
				recommendedAction:
					'Review the overdue sales task and decide whether to reassign, retry, or escalate.',
				title: 'Sales SLA escalation'
			}
		},
		taskPolicies: {
			escalated: {
				assignee: 'sales-leads',
				dueInMs: 15 * 60_000,
				name: 'sales-escalation',
				priority: 'urgent',
				queue: 'sales-leads'
			},
			failed: {
				assignee: 'sales-ops',
				dueInMs: 20 * 60_000,
				name: 'sales-failed-review',
				priority: 'high',
				queue: 'sales-ops'
			},
			'no-answer': {
				assignee: 'sales-retries',
				dueInMs: 30 * 60_000,
				name: 'sales-no-answer',
				priority: 'high',
				queue: 'sales-retries'
			},
			transferred: {
				assignee: 'sales-verification',
				dueInMs: 15 * 60_000,
				name: 'sales-transfer-verification',
				priority: 'normal',
				queue: 'sales-verification'
			},
			voicemail: {
				assignee: 'sales-callbacks',
				dueInMs: 15 * 60_000,
				name: 'sales-voicemail',
				priority: 'high',
				queue: 'sales-callbacks'
			}
		}
	},
	'support-default': {
		description:
			'Balanced support-ops workflow with callback recovery, transfer verification, and urgent escalation handling.',
		assignmentRules: [
			{
				assign: 'support-oncall',
				description: 'Urgent support work routes to the on-call queue.',
				name: 'support-urgent-routing',
				queue: 'support-oncall',
				when: {
					priority: 'urgent'
				}
			},
			{
				assign: 'support-priority-callbacks',
				description: 'High-priority callback work routes to the fast callback pool.',
				name: 'support-callback-priority-routing',
				queue: 'support-priority-callbacks',
				when: {
					kind: 'callback',
					priority: 'high'
				}
			}
		],
		sla: {
			followUpTask: {
				assignee: 'support-supervisors',
				description:
					'This support task missed its SLA and now requires supervisor follow-up.',
				dueInMs: 15 * 60_000,
				name: 'support-sla-escalation',
				priority: 'urgent',
				queue: 'support-supervisors',
				recommendedAction:
					'Review the overdue support task and decide whether to reassign, escalate, or contact the customer immediately.',
				title: 'Support SLA escalation'
			}
		},
		taskPolicies: {
			escalated: {
				assignee: 'support-escalations',
				dueInMs: 10 * 60_000,
				name: 'support-escalation',
				priority: 'urgent',
				queue: 'support-escalations'
			},
			failed: {
				assignee: 'support-ops',
				dueInMs: 15 * 60_000,
				name: 'support-failed-review',
				priority: 'high',
				queue: 'support-ops'
			},
			'no-answer': {
				assignee: 'support-retries',
				dueInMs: 2 * 60 * 60_000,
				name: 'support-no-answer',
				priority: 'normal',
				queue: 'support-retries'
			},
			transferred: {
				assignee: 'support-transfer-verification',
				dueInMs: 20 * 60_000,
				name: 'support-transfer-verification',
				priority: 'normal',
				queue: 'support-transfer-verification'
			},
			voicemail: {
				assignee: 'support-callbacks',
				dueInMs: 30 * 60_000,
				name: 'support-voicemail',
				priority: 'high',
				queue: 'support-callbacks'
			}
		}
	}
};

const mergePolicies = (
	base: VoiceOpsDispositionTaskPolicies,
	overrides?: VoiceOpsDispositionTaskPolicies
): VoiceOpsDispositionTaskPolicies => {
	if (!overrides) {
		return {
			...base
		};
	}

	return {
		...base,
		...Object.fromEntries(
			Object.entries(overrides).map(([disposition, policy]) => [
				disposition,
				policy
					? {
							...(base[disposition as keyof VoiceOpsDispositionTaskPolicies] ?? {}),
							...policy
						}
					: policy
			])
		)
	};
};

export const resolveVoiceOpsPreset = (
	name: VoiceOpsPresetName,
	overrides: VoiceOpsPresetOverrides = {}
): VoiceResolvedOpsPreset => {
	const preset = PRESET_INPUTS[name];

	return {
		assignmentRules: overrides.assignmentRules ?? preset.assignmentRules,
		description: preset.description,
		name,
		sla: {
			followUpTask:
				preset.sla.followUpTask || overrides.sla?.followUpTask
					? {
							...(preset.sla.followUpTask ?? {}),
							...(overrides.sla?.followUpTask ?? {})
						}
					: undefined
		},
		taskPolicies: mergePolicies(preset.taskPolicies, overrides.taskPolicies)
	};
};
