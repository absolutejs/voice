import { expect, test } from 'bun:test';
import {
	createVoiceCRMActivitySink,
	createVoiceHelpdeskTicketSink,
	createVoiceHubSpotTaskSink,
	createVoiceHubSpotTaskSyncSinks,
	createVoiceHubSpotTaskUpdateSink,
	createVoiceIntegrationHTTPSink,
	createVoiceLinearIssueSink,
	createVoiceLinearIssueSyncSinks,
	createVoiceLinearIssueUpdateSink,
	createVoiceReviewSavedEvent,
	createVoiceSessionRecord,
	createVoiceTaskCreatedEvent,
	createVoiceTaskUpdatedEvent,
	createStoredVoiceCallReviewArtifact,
	createStoredVoiceOpsTask,
	createVoiceZendeskTicketSink,
	createVoiceZendeskTicketSyncSinks,
	createVoiceZendeskTicketUpdateSink,
	deliverVoiceIntegrationEventToSinks
} from '../src';
import type {
	StoredVoiceExternalObjectMap,
	VoiceExternalObjectMapStore
} from '../src';

const createExternalObjectStore = (): VoiceExternalObjectMapStore => {
	const values = new Map<string, StoredVoiceExternalObjectMap>();

	return {
		find: async (input) =>
			[...values.values()].find(
				(mapping) =>
					mapping.provider === input.provider &&
					mapping.sourceId === input.sourceId &&
					(input.sinkId === undefined || mapping.sinkId === input.sinkId) &&
					(input.sourceType === undefined ||
						mapping.sourceType === input.sourceType)
			),
		get: async (id) => values.get(id),
		list: async () => [...values.values()],
		remove: async (id) => {
			values.delete(id);
		},
		set: async (id, mapping) => {
			values.set(id, mapping);
		}
	};
};

test('deliverVoiceIntegrationEventToSinks fans out through a generic HTTP sink', async () => {
	const requests: Array<{
		body: Record<string, unknown>;
		url: string;
	}> = [];

	const event = createVoiceReviewSavedEvent(
		createStoredVoiceCallReviewArtifact('review-sink', {
			errors: [],
			generatedAt: 100,
			latencyBreakdown: [],
			notes: [],
			summary: {
				outcome: 'completed',
				pass: true,
				turnCount: 1
			},
			title: 'Sink Review',
			timeline: [],
			transcript: {
				actual: 'Done.'
			}
		})
	);

	const delivered = await deliverVoiceIntegrationEventToSinks({
		event,
		sinks: [
			createVoiceIntegrationHTTPSink({
				body: ({ event: sinkEvent }) => ({
					eventId: sinkEvent.id,
					outcome: sinkEvent.payload.outcome,
					type: sinkEvent.type
				}),
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						url: String(url)
					});
					return new Response(null, {
						status: 202
					});
				},
				id: 'ops-http',
				url: 'https://example.test/sinks/http'
			})
		]
	});

	expect(requests).toHaveLength(1);
	expect(requests[0]).toEqual({
		body: {
			eventId: event.id,
			outcome: 'completed',
			type: 'review.saved'
		},
		url: 'https://example.test/sinks/http'
	});
	expect(delivered.deliveryStatus).toBe('delivered');
	expect(delivered.sinkDeliveries?.['ops-http']).toMatchObject({
		attempts: 1,
		deliveredTo: 'https://example.test/sinks/http',
		sinkId: 'ops-http',
		sinkKind: 'http',
		status: 'delivered'
	});
});

test('helpdesk and CRM sinks normalize task and call payloads into portable envelopes', async () => {
	const helpdeskBodies: Array<Record<string, unknown>> = [];
	const crmBodies: Array<Record<string, unknown>> = [];
	const task = createStoredVoiceOpsTask('task-helpdesk', {
		assignee: 'support-oncall',
		createdAt: 100,
		description: 'Escalated callback',
		history: [],
		kind: 'callback',
		outcome: 'voicemail',
		priority: 'urgent',
		queue: 'support-callbacks',
		recommendedAction: 'Call the customer back right away.',
		reviewId: 'review-helpdesk',
		status: 'open',
		title: 'Urgent callback',
		updatedAt: 100
	});
	const taskEvent = createVoiceTaskUpdatedEvent(task);
	const callEvent = {
		createdAt: 100,
		id: 'session-crm:call.completed',
		payload: {
			disposition: 'completed',
			scenarioId: 'support-demo',
			sessionId: 'session-crm',
			status: 'completed',
			turnCount: 2
		},
		type: 'call.completed' as const
	};

	const deliveredTask = await deliverVoiceIntegrationEventToSinks({
		event: taskEvent,
		sinks: [
			createVoiceHelpdeskTicketSink({
				fetch: async (_url, init) => {
					helpdeskBodies.push(JSON.parse(String(init?.body ?? '{}')));
					return new Response(null, {
						status: 201
					});
				},
				id: 'helpdesk',
				project: 'support',
				url: 'https://example.test/helpdesk'
			})
		]
	});
	const deliveredCall = await deliverVoiceIntegrationEventToSinks({
		event: callEvent,
		sinks: [
			createVoiceCRMActivitySink({
				fetch: async (_url, init) => {
					crmBodies.push(JSON.parse(String(init?.body ?? '{}')));
					return new Response(null, {
						status: 202
					});
				},
				id: 'crm',
				pipeline: 'support-pipeline',
				url: 'https://example.test/crm'
			})
		]
	});

	expect(helpdeskBodies[0]?.ticket).toMatchObject({
		assignee: 'support-oncall',
		externalId: 'task-helpdesk',
		priority: 'urgent',
		queue: 'support-callbacks',
		reviewId: 'review-helpdesk',
		status: 'open',
		taskId: 'task-helpdesk',
		title: 'Urgent callback'
	});
	expect(helpdeskBodies[0]?.project).toBe('support');
	expect(crmBodies[0]?.activity).toMatchObject({
		entityId: 'session-crm',
		entityType: 'call',
		eventType: 'call.completed',
		externalId: 'session-crm:call.completed',
		outcome: 'completed',
		scenarioId: 'support-demo'
	});
	expect(crmBodies[0]?.pipeline).toBe('support-pipeline');
	expect(deliveredTask.sinkDeliveries?.helpdesk?.status).toBe('delivered');
	expect(deliveredCall.sinkDeliveries?.crm?.status).toBe('delivered');
});

test('deliverVoiceIntegrationEventToSinks marks non-matching sink filters as skipped', async () => {
	const event = createVoiceReviewSavedEvent(
		createStoredVoiceCallReviewArtifact('review-skip', {
			errors: [],
			generatedAt: 100,
			latencyBreakdown: [],
			notes: [],
			summary: {
				outcome: 'completed',
				pass: true,
				turnCount: 1
			},
			title: 'Skip Review',
			timeline: [],
			transcript: {
				actual: 'Done.'
			}
		})
	);

	const delivered = await deliverVoiceIntegrationEventToSinks({
		event,
		sinks: [
			createVoiceHelpdeskTicketSink({
				eventTypes: ['task.created'],
				fetch: async () =>
					new Response(null, {
						status: 204
					}),
				id: 'skip-helpdesk',
				url: 'https://example.test/helpdesk'
			})
		]
	});

	expect(delivered.deliveryStatus).toBe('skipped');
	expect(delivered.sinkDeliveries?.['skip-helpdesk']).toMatchObject({
		attempts: 0,
		sinkId: 'skip-helpdesk',
		status: 'skipped'
	});
});

test('packaged Zendesk, HubSpot, and Linear sinks emit documented request shapes', async () => {
	const requests: Array<{
		body: Record<string, unknown>;
		headers: Headers;
		url: string;
	}> = [];
	const task = createStoredVoiceOpsTask('task-vendor', {
		assignee: 'callbacks',
		createdAt: 100,
		description: 'Call back soon',
		dueAt: 5_000,
		history: [],
		kind: 'callback',
		outcome: 'voicemail',
		priority: 'high',
		queue: 'callback-queue',
		recommendedAction: 'Return the call today.',
		reviewId: 'review-vendor',
		status: 'open',
		title: 'Return customer call',
		updatedAt: 100
	});
	const taskEvent = createVoiceTaskCreatedEvent(task);

	const sinks = [
		createVoiceZendeskTicketSink({
			accessToken: 'zd-token',
			fetch: async (url, init) => {
				requests.push({
					body: JSON.parse(String(init?.body ?? '{}')),
					headers: new Headers(init?.headers),
					url: String(url)
				});
				return new Response(null, { status: 201 });
			},
			id: 'zendesk',
			requester: {
				email: 'caller@example.com',
				name: 'Caller'
			},
			subdomain: 'acme'
		}),
		createVoiceHubSpotTaskSink({
			accessToken: 'hs-token',
			fetch: async (url, init) => {
				requests.push({
					body: JSON.parse(String(init?.body ?? '{}')),
					headers: new Headers(init?.headers),
					url: String(url)
				});
				return new Response(null, { status: 201 });
			},
			id: 'hubspot',
			ownerId: 'owner-1'
		}),
		createVoiceLinearIssueSink({
			accessToken: 'linear-token',
			fetch: async (url, init) => {
				requests.push({
					body: JSON.parse(String(init?.body ?? '{}')),
					headers: new Headers(init?.headers),
					url: String(url)
				});
				return new Response(null, { status: 200 });
			},
			id: 'linear',
			teamId: 'team-123'
		})
	];

	await deliverVoiceIntegrationEventToSinks({
		event: taskEvent,
		sinks
	});

	expect(requests[0]?.url).toBe('https://acme.zendesk.com/api/v2/tickets');
	expect(requests[0]?.headers.get('authorization')).toBe('Bearer zd-token');
	expect(requests[0]?.body).toEqual({
		ticket: {
			comment: {
				body: 'Return the call today.'
			},
			priority: 'high',
			requester: {
				email: 'caller@example.com',
				name: 'Caller'
			},
			subject: 'Return customer call'
		}
	});

	expect(requests[1]?.url).toBe('https://api.hubapi.com/crm/v3/objects/tasks');
	expect(requests[1]?.headers.get('authorization')).toBe('Bearer hs-token');
	expect(requests[1]?.body).toEqual({
		properties: {
			hs_task_body: 'Return the call today.',
			hs_task_priority: 'HIGH',
			hs_task_status: 'NOT_STARTED',
			hs_task_subject: 'Return customer call',
			hs_task_type: 'CALL',
			hs_timestamp: '5000',
			hubspot_owner_id: 'owner-1'
		}
	});

	expect(requests[2]?.url).toBe('https://api.linear.app/graphql');
	expect(requests[2]?.headers.get('authorization')).toBe('Bearer linear-token');
	expect(requests[2]?.body).toEqual({
		query: `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      title
    }
  }
}`,
		variables: {
			input: {
				description: 'Return the call today.',
				teamId: 'team-123',
				title: 'Return customer call'
			}
		}
	});
});

test('packaged Zendesk, HubSpot, and Linear update sinks target existing external records', async () => {
	const requests: Array<{
		body: Record<string, unknown>;
		headers: Headers;
		method: string;
		url: string;
	}> = [];
	const task = createStoredVoiceOpsTask('task-update', {
		assignee: 'callbacks',
		createdAt: 100,
		description: 'Call is complete',
		dueAt: 5_000,
		history: [],
		kind: 'callback',
		outcome: 'completed',
		priority: 'normal',
		queue: 'callback-queue',
		recommendedAction: 'Task completed after callback.',
		reviewId: 'review-update',
		status: 'done',
		title: 'Completed callback',
		updatedAt: 200
	});
	const taskEvent = createVoiceTaskUpdatedEvent(task);
	taskEvent.payload.zendeskTicketId = '123';
	taskEvent.payload.hubspotTaskId = '456';
	taskEvent.payload.linearIssueId = 'LIN-789';

	await deliverVoiceIntegrationEventToSinks({
		event: taskEvent,
		sinks: [
			createVoiceZendeskTicketUpdateSink({
				accessToken: 'zd-token',
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						headers: new Headers(init?.headers),
						method: String(init?.method),
						url: String(url)
					});
					return new Response(null, { status: 200 });
				},
				id: 'zendesk-update',
				status: 'solved',
				subdomain: 'acme'
			}),
			createVoiceHubSpotTaskUpdateSink({
				accessToken: 'hs-token',
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						headers: new Headers(init?.headers),
						method: String(init?.method),
						url: String(url)
					});
					return new Response(null, { status: 200 });
				},
				id: 'hubspot-update'
			}),
			createVoiceLinearIssueUpdateSink({
				accessToken: 'linear-token',
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						headers: new Headers(init?.headers),
						method: String(init?.method),
						url: String(url)
					});
					return new Response(null, { status: 200 });
				},
				id: 'linear-update',
				stateId: 'done-state'
			})
		]
	});

	expect(requests[0]?.method).toBe('PUT');
	expect(requests[0]?.url).toBe('https://acme.zendesk.com/api/v2/tickets/123');
	expect(requests[0]?.headers.get('authorization')).toBe('Bearer zd-token');
	expect(requests[0]?.body).toEqual({
		ticket: {
			comment: {
				body: 'Task completed after callback.'
			},
			priority: 'normal',
			status: 'solved'
		}
	});

	expect(requests[1]?.method).toBe('PATCH');
	expect(requests[1]?.url).toBe(
		'https://api.hubapi.com/crm/v3/objects/tasks/456'
	);
	expect(requests[1]?.headers.get('authorization')).toBe('Bearer hs-token');
	expect(requests[1]?.body).toEqual({
		properties: {
			hs_task_body: 'Task completed after callback.',
			hs_task_priority: 'MEDIUM',
			hs_task_status: 'COMPLETED',
			hs_task_subject: 'Completed callback',
			hs_task_type: 'CALL',
			hs_timestamp: '5000'
		}
	});

	expect(requests[2]?.method).toBe('POST');
	expect(requests[2]?.url).toBe('https://api.linear.app/graphql');
	expect(requests[2]?.headers.get('authorization')).toBe('Bearer linear-token');
	expect(requests[2]?.body).toEqual({
		query: `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      title
    }
  }
}`,
		variables: {
			id: 'LIN-789',
			input: {
				description: 'Task completed after callback.',
				stateId: 'done-state',
				title: 'Completed callback'
			}
		}
	});
});

test('packaged update sinks skip events without external ids', async () => {
	let posts = 0;
	const event = createVoiceTaskUpdatedEvent(
		createStoredVoiceOpsTask('task-no-external-id', {
			createdAt: 100,
			description: 'No external id',
			history: [],
			kind: 'callback',
			recommendedAction: 'Nothing to update externally.',
			status: 'open',
			title: 'No external id',
			updatedAt: 100
		})
	);

	const delivered = await deliverVoiceIntegrationEventToSinks({
		event,
		sinks: [
			createVoiceZendeskTicketUpdateSink({
				accessToken: 'zd-token',
				fetch: async () => {
					posts += 1;
					return new Response(null, { status: 200 });
				},
				id: 'zendesk-update',
				subdomain: 'acme'
			}),
			createVoiceHubSpotTaskUpdateSink({
				accessToken: 'hs-token',
				fetch: async () => {
					posts += 1;
					return new Response(null, { status: 200 });
				},
				id: 'hubspot-update'
			}),
			createVoiceLinearIssueUpdateSink({
				accessToken: 'linear-token',
				fetch: async () => {
					posts += 1;
					return new Response(null, { status: 200 });
				},
				id: 'linear-update'
			})
		]
	});

	expect(posts).toBe(0);
	expect(delivered.deliveryStatus).toBe('skipped');
	expect(delivered.sinkDeliveries?.['zendesk-update']?.status).toBe('skipped');
	expect(delivered.sinkDeliveries?.['hubspot-update']?.status).toBe('skipped');
	expect(delivered.sinkDeliveries?.['linear-update']?.status).toBe('skipped');
});

test('packaged create sinks persist external ids for later update sinks', async () => {
	const externalObjects = createExternalObjectStore();
	const requests: Array<{
		body: Record<string, unknown>;
		url: string;
	}> = [];
	const task = createStoredVoiceOpsTask('task-mapped', {
		createdAt: 100,
		description: 'Map this task',
		history: [],
		kind: 'callback',
		recommendedAction: 'Create and then update the external record.',
		status: 'open',
		title: 'Mapped callback',
		updatedAt: 100
	});
	const createEvent = createVoiceTaskCreatedEvent(task);
	const updateEvent = createVoiceTaskUpdatedEvent({
		...task,
		recommendedAction: 'Update the external record.',
		status: 'done',
		updatedAt: 200
	});

	await deliverVoiceIntegrationEventToSinks({
		event: createEvent,
		sinks: [
			createVoiceHubSpotTaskSink({
				accessToken: 'hs-token',
				externalObjects,
				fetch: async () =>
					Response.json(
						{
							id: 'hubspot-external-1'
						},
						{
							status: 201
						}
					),
				id: 'hubspot'
			})
		]
	});

	const delivered = await deliverVoiceIntegrationEventToSinks({
		event: updateEvent,
		sinks: [
			createVoiceHubSpotTaskUpdateSink({
				accessToken: 'hs-token',
				externalObjects,
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						url: String(url)
					});
					return new Response(null, { status: 200 });
				},
				id: 'hubspot'
			})
		]
	});

	expect((await externalObjects.list())[0]).toMatchObject({
		externalId: 'hubspot-external-1',
		provider: 'hubspot',
		sinkId: 'hubspot',
		sourceId: 'task-mapped',
		sourceType: 'task'
	});
	expect(requests[0]?.url).toBe(
		'https://api.hubapi.com/crm/v3/objects/tasks/hubspot-external-1'
	);
	expect(requests[0]?.body).toMatchObject({
		properties: {
			hs_task_body: 'Update the external record.',
			hs_task_status: 'COMPLETED'
		}
	});
	expect(delivered.sinkDeliveries?.hubspot?.status).toBe('delivered');
});

test('packaged sync sink helpers split create and update delivery safely', async () => {
	const externalObjects = createExternalObjectStore();
	const requests: Array<{
		body: Record<string, unknown>;
		method?: string;
		url: string;
	}> = [];
	const task = createStoredVoiceOpsTask('task-sync', {
		createdAt: 100,
		description: 'Sync this task',
		history: [],
		kind: 'callback',
		recommendedAction: 'Create the vendor task.',
		status: 'open',
		title: 'Sync callback',
		updatedAt: 100
	});
	const sinks = createVoiceHubSpotTaskSyncSinks({
		accessToken: 'hs-token',
		externalObjects,
		fetch: async (url, init) => {
			requests.push({
				body: JSON.parse(String(init?.body ?? '{}')),
				method: init?.method,
				url: String(url)
			});
			return String(url).endsWith('/tasks')
				? Response.json({ id: 'hubspot-sync-1' }, { status: 201 })
				: new Response(null, { status: 200 });
		},
		id: 'hubspot-sync'
	});

	expect(sinks.map((sink) => sink.eventTypes)).toEqual([
		['task.created'],
		['task.updated', 'task.sla_breached']
	]);

	const created = await deliverVoiceIntegrationEventToSinks({
		event: createVoiceTaskCreatedEvent(task),
		sinks
	});
	const updated = await deliverVoiceIntegrationEventToSinks({
		event: createVoiceTaskUpdatedEvent({
			...task,
			recommendedAction: 'Update the vendor task.',
			status: 'done',
			updatedAt: 200
		}),
		sinks
	});

	expect(requests).toHaveLength(2);
	expect(requests[0]).toMatchObject({
		method: 'POST',
		url: 'https://api.hubapi.com/crm/v3/objects/tasks'
	});
	expect(requests[1]).toMatchObject({
		method: 'PATCH',
		url: 'https://api.hubapi.com/crm/v3/objects/tasks/hubspot-sync-1'
	});
	expect(requests[1]?.body).toMatchObject({
		properties: {
			hs_task_body: 'Update the vendor task.',
			hs_task_status: 'COMPLETED'
		}
	});
	expect(created.sinkDeliveries?.['hubspot-sync']?.status).toBe('delivered');
	expect(created.sinkDeliveries?.['hubspot-sync:update']?.status).toBe(
		'skipped'
	);
	expect(updated.sinkDeliveries?.['hubspot-sync']?.status).toBe('skipped');
	expect(updated.sinkDeliveries?.['hubspot-sync:update']?.status).toBe(
		'delivered'
	);
	expect((await externalObjects.list())[0]).toMatchObject({
		externalId: 'hubspot-sync-1',
		provider: 'hubspot',
		sinkId: 'hubspot-sync',
		sourceId: 'task-sync',
		sourceType: 'task'
	});
});

test('packaged sync sink helpers expose paired create and update defaults', () => {
	expect(
		createVoiceZendeskTicketSyncSinks({
			accessToken: 'zendesk-token',
			id: 'zendesk-sync',
			subdomain: 'absolute'
		}).map((sink) => ({
			eventTypes: sink.eventTypes,
			id: sink.id,
			kind: sink.kind
		}))
	).toEqual([
		{
			eventTypes: ['review.saved', 'task.created'],
			id: 'zendesk-sync',
			kind: 'zendesk-ticket'
		},
		{
			eventTypes: ['task.updated', 'task.sla_breached'],
			id: 'zendesk-sync:update',
			kind: 'zendesk-ticket-update'
		}
	]);
	expect(
		createVoiceLinearIssueSyncSinks({
			accessToken: 'linear-token',
			id: 'linear-sync',
			teamId: 'team-1'
		}).map((sink) => ({
			eventTypes: sink.eventTypes,
			id: sink.id,
			kind: sink.kind
		}))
	).toEqual([
		{
			eventTypes: ['review.saved', 'task.created'],
			id: 'linear-sync',
			kind: 'linear-issue'
		},
		{
			eventTypes: ['task.updated', 'task.sla_breached'],
			id: 'linear-sync:update',
			kind: 'linear-issue-update'
		}
	]);
});
