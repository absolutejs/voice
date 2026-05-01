import { expect, test } from 'bun:test';
import {
	buildVoiceTraceReplay,
	createVoiceMemoryTraceEventStore,
	createVoiceProfileTraceTagger,
	createVoiceProofTraceStore,
	createVoiceScopedTraceEventStore,
	createVoiceTraceHTTPSink,
	createVoiceTraceEvent,
	createVoiceTraceS3Sink,
	createVoiceTraceSinkStore,
	deliverVoiceTraceEventsToSinks,
	evaluateVoiceTrace,
	exportVoiceTrace,
	pruneVoiceTraceEvents,
	redactVoiceTraceEvents,
	redactVoiceTraceText,
	renderVoiceTraceHTML,
	renderVoiceTraceMarkdown,
	selectVoiceTraceEventsForPrune,
	summarizeVoiceTrace,
	type StoredVoiceTraceEvent
} from '../src';

const createTraceEvents = (): StoredVoiceTraceEvent[] => [
	createVoiceTraceEvent({
		at: 100,
		payload: {
			type: 'start'
		},
		sessionId: 'session-trace',
		type: 'call.lifecycle'
	}),
	createVoiceTraceEvent({
		at: 120,
		payload: {
			isFinal: false,
			text: 'order status',
			transcriptId: 'partial-1'
		},
		sessionId: 'session-trace',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 140,
		payload: {
			isFinal: true,
			text: 'order status please',
			transcriptId: 'final-1'
		},
		sessionId: 'session-trace',
		type: 'turn.transcript'
	}),
	createVoiceTraceEvent({
		at: 160,
		payload: {
			reason: 'manual',
			text: 'order status please',
			transcriptCount: 1
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.committed'
	}),
	createVoiceTraceEvent({
		at: 170,
		payload: {
			elapsedMs: 42,
			messageCount: 1,
			round: 0,
			toolCallCount: 1
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.model'
	}),
	createVoiceTraceEvent({
		at: 180,
		payload: {
			agentId: 'support',
			status: 'error',
			toolName: 'lookup_order'
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'agent.tool'
	}),
	createVoiceTraceEvent({
		at: 190,
		payload: {
			text: 'I could not look that up yet.',
			ttsConfigured: true
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.assistant'
	}),
	createVoiceTraceEvent({
		at: 200,
		payload: {
			estimatedRelativeCostUnits: 0.05,
			totalBillableAudioMs: 1500
		},
		sessionId: 'session-trace',
		turnId: 'turn-1',
		type: 'turn.cost'
	}),
	createVoiceTraceEvent({
		at: 240,
		payload: {
			disposition: 'completed',
			type: 'end'
		},
		sessionId: 'session-trace',
		type: 'call.lifecycle'
	})
];

test('createVoiceScopedTraceEventStore enforces scope after listing', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: { status: 'started' },
		scenarioId: 'proof-a',
		sessionId: 'session-a',
		type: 'call.lifecycle'
	});
	await store.append({
		at: 101,
		payload: { status: 'started' },
		scenarioId: 'proof-b',
		sessionId: 'session-b',
		type: 'call.lifecycle'
	});

	const scoped = createVoiceScopedTraceEventStore(store, {
		scenarioId: 'proof-a'
	});

	await expect(scoped.list()).resolves.toMatchObject([
		{ scenarioId: 'proof-a', sessionId: 'session-a' }
	]);
	await expect(scoped.list({ scenarioId: 'proof-b' })).resolves.toMatchObject([
		{ scenarioId: 'proof-a', sessionId: 'session-a' }
	]);
});

test('createVoiceProofTraceStore keeps proof reads scoped while mirroring app traces', async () => {
	const proofStore = createVoiceMemoryTraceEventStore();
	const mirrorStore = createVoiceMemoryTraceEventStore();
	const store = createVoiceProofTraceStore({
		mirrorStore,
		proofStore,
		scope: {
			scenarioId: 'provider-slo-proof'
		}
	});

	const stored = await store.append({
		at: 100,
		payload: { kind: 'llm', providerStatus: 'success' },
		scenarioId: 'provider-slo-proof',
		sessionId: 'proof-session',
		type: 'session.error'
	});
	await proofStore.append({
		at: 101,
		payload: { kind: 'llm', providerStatus: 'success' },
		scenarioId: 'other-proof',
		sessionId: 'other-session',
		type: 'session.error'
	});

	await expect(store.list()).resolves.toMatchObject([
		{ scenarioId: 'provider-slo-proof', sessionId: 'proof-session' }
	]);
	await expect(mirrorStore.list()).resolves.toMatchObject([
		{ id: stored.id, scenarioId: 'provider-slo-proof' }
	]);

	await store.remove(stored.id);
	await expect(proofStore.get(stored.id)).resolves.toBeUndefined();
	await expect(mirrorStore.get(stored.id)).resolves.toBeUndefined();
});

test('summarizeVoiceTrace reports replay metrics', () => {
	const summary = summarizeVoiceTrace(createTraceEvents());

	expect(summary).toMatchObject({
		assistantReplyCount: 1,
		callDurationMs: 140,
		cost: {
			estimatedRelativeCostUnits: 0.05,
			totalBillableAudioMs: 1500
		},
		errorCount: 0,
		eventCount: 9,
		failed: false,
		modelCallCount: 1,
		sessionId: 'session-trace',
		toolCallCount: 1,
		toolErrorCount: 1,
		transcriptCount: 2,
		turnCount: 1
	});
});

test('evaluateVoiceTrace flags tool errors and missing essentials', () => {
	const evaluation = evaluateVoiceTrace(createTraceEvents());

	expect(evaluation.pass).toBe(false);
	expect(evaluation.issues).toMatchObject([
		{
			code: 'tool-errors',
			severity: 'error'
		}
	]);

	const missing = evaluateVoiceTrace([]);
	expect(missing.pass).toBe(false);
	expect(missing.issues.map((issue) => issue.code)).toEqual([
		'call-not-ended',
		'missing-transcript',
		'missing-turn'
	]);
});

test('trace renderers produce portable markdown and html replay artifacts', () => {
	const events = createTraceEvents();
	const markdown = renderVoiceTraceMarkdown(events, {
		title: 'Support Call Trace'
	});
	const html = renderVoiceTraceHTML(events, {
		title: 'Support Call Trace'
	});
	const replay = buildVoiceTraceReplay(events, {
		title: 'Support Call Trace'
	});

	expect(markdown).toContain('# Support Call Trace');
	expect(markdown).toContain('[error] tool-errors');
	expect(markdown).toContain('assistant "I could not look that up yet."');
	expect(html).toContain('<table>');
	expect(html).toContain('Support Call Trace');
	expect(replay.summary.turnCount).toBe(1);
	expect(replay.evaluation.pass).toBe(false);
});

test('redactVoiceTraceEvents scrubs PII text and sensitive payload keys', () => {
	const events = [
		createVoiceTraceEvent({
			at: 100,
			metadata: {
				token: 'secret-token'
			},
			payload: {
				email: 'customer@example.com',
				nested: {
					apiKey: 'api-key-1'
				},
				phone: '415-555-1212',
				text: 'Call Jane at jane@example.com or 415-555-1212'
			},
			sessionId: 'session-redact',
			type: 'turn.transcript'
		})
	];

	const redacted = redactVoiceTraceEvents(events);

	expect(redacted[0]?.metadata).toEqual({
		token: '[redacted]'
	});
	expect(redacted[0]?.payload).toEqual({
		email: '[redacted]',
		nested: {
			apiKey: '[redacted]'
		},
		phone: '[redacted]',
		text: 'Call Jane at [redacted] or [redacted]'
	});
	expect(events[0]?.payload.text).toBe(
		'Call Jane at jane@example.com or 415-555-1212'
	);
});

test('trace exports and renderers can redact shared artifacts', async () => {
	const events = [
		createVoiceTraceEvent({
			at: 100,
			payload: {
				text: 'Email alex@example.com'
			},
			sessionId: 'session-redact',
			type: 'turn.assistant'
		})
	];
	const store = {
		append: async () => events[0]!,
		get: async () => events[0],
		list: async () => events,
		remove: async () => {}
	};
	const exported = await exportVoiceTrace({
		redact: true,
		store
	});
	const markdown = renderVoiceTraceMarkdown(events, {
		redact: true
	});
	const html = renderVoiceTraceHTML(events, {
		redact: {
			replacement: '[safe]'
		}
	});
	const replay = buildVoiceTraceReplay(events, {
		redact: true
	});

	expect(exported.events[0]?.payload.text).toBe('Email [redacted]');
	expect(markdown).toContain('Email [redacted]');
	expect(html).toContain('Email [safe]');
	expect(replay.markdown).toContain('[redacted]');
});

test('selectVoiceTraceEventsForPrune filters by retention policy', () => {
	const events = [
		createVoiceTraceEvent({
			at: 100,
			id: 'a-100',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.transcript'
		}),
		createVoiceTraceEvent({
			at: 200,
			id: 'a-200',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.assistant'
		}),
		createVoiceTraceEvent({
			at: 300,
			id: 'a-300',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.cost'
		}),
		createVoiceTraceEvent({
			at: 150,
			id: 'b-150',
			payload: {},
			sessionId: 'session-b',
			type: 'turn.transcript'
		})
	];

	expect(
		selectVoiceTraceEventsForPrune(events, {
			beforeOrAt: 200,
			filter: {
				sessionId: 'session-a'
			}
		}).map((event) => event.id)
	).toEqual(['a-100', 'a-200']);

	expect(
		selectVoiceTraceEventsForPrune(events, {
			filter: {
				sessionId: 'session-a'
			},
			keepNewest: 1
		}).map((event) => event.id)
	).toEqual(['a-100', 'a-200']);

	expect(
		selectVoiceTraceEventsForPrune(events, {
			keepNewest: 1,
			limit: 1
		}).map((event) => event.id)
	).toEqual(['a-100']);
});

test('pruneVoiceTraceEvents supports dry runs and store removal', async () => {
	const events = [
		createVoiceTraceEvent({
			at: 100,
			id: 'a-100',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.transcript'
		}),
		createVoiceTraceEvent({
			at: 200,
			id: 'a-200',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.assistant'
		}),
		createVoiceTraceEvent({
			at: 300,
			id: 'a-300',
			payload: {},
			sessionId: 'session-a',
			type: 'turn.cost'
		}),
		createVoiceTraceEvent({
			at: 150,
			id: 'b-150',
			payload: {},
			sessionId: 'session-b',
			type: 'turn.transcript'
		})
	];
	const stored = new Map(events.map((event) => [event.id, event]));
	const store = {
		append: async (event: StoredVoiceTraceEvent) => {
			stored.set(event.id, event);
			return event;
		},
		get: async (id: string) => stored.get(id),
		list: async () =>
			[...stored.values()].sort(
				(left, right) => left.at - right.at || left.id.localeCompare(right.id)
			),
		remove: async (id: string) => {
			stored.delete(id);
		}
	};

	const dryRun = await pruneVoiceTraceEvents({
		beforeOrAt: 200,
		dryRun: true,
		filter: {
			sessionId: 'session-a'
		},
		store
	});
	expect(dryRun).toMatchObject({
		deletedCount: 2,
		dryRun: true,
		scannedCount: 4
	});
	expect(await store.list()).toHaveLength(4);

	const pruned = await pruneVoiceTraceEvents({
		filter: {
			sessionId: 'session-a'
		},
		keepNewest: 1,
		store
	});
	expect(pruned.deleted.map((event) => event.id)).toEqual(['a-100', 'a-200']);
	expect((await store.list()).map((event) => event.id)).toEqual([
		'b-150',
		'a-300'
	]);
});

test('deliverVoiceTraceEventsToSinks fans out filtered trace batches', async () => {
	const events = createTraceEvents();
	const delivered: StoredVoiceTraceEvent[][] = [];

	const result = await deliverVoiceTraceEventsToSinks({
		events,
		sinks: [
			{
				deliver: async ({ events: sinkEvents }) => {
					delivered.push(sinkEvents);
					return {
						attempts: 1,
						deliveredAt: 1000,
						eventCount: sinkEvents.length,
						status: 'delivered'
					};
				},
				eventTypes: ['agent.tool'],
				id: 'tool-traces',
				kind: 'memory'
			},
			{
				deliver: async ({ events: sinkEvents }) => ({
					attempts: 1,
					eventCount: sinkEvents.length,
					status: 'delivered'
				}),
				eventTypes: ['session.error'],
				id: 'errors-only'
			}
		]
	});

	expect(result.status).toBe('delivered');
	expect(result.sinkDeliveries['tool-traces']).toMatchObject({
		eventCount: 1,
		status: 'delivered'
	});
	expect(result.sinkDeliveries['errors-only']).toMatchObject({
		attempts: 0,
		eventCount: 0,
		status: 'skipped'
	});
	expect(delivered[0]?.map((event) => event.type)).toEqual(['agent.tool']);
});

test('createVoiceTraceHTTPSink posts trace envelopes with optional redaction', async () => {
	const requests: Array<{
		body: Record<string, unknown>;
		headers: Headers;
		url: string;
	}> = [];
	const event = createVoiceTraceEvent({
		at: 100,
		payload: {
			text: 'Email alex@example.com'
		},
		sessionId: 'session-http',
		type: 'turn.assistant'
	});

	const result = await deliverVoiceTraceEventsToSinks({
		events: [event],
		redact: true,
		sinks: [
			createVoiceTraceHTTPSink({
				fetch: async (url, init) => {
					requests.push({
						body: JSON.parse(String(init?.body ?? '{}')),
						headers: new Headers(init?.headers),
						url: String(url)
					});
					return Response.json({
						ok: true
					});
				},
				id: 'warehouse',
				signingSecret: 'trace-secret',
				url: 'https://example.test/traces'
			})
		]
	});

	expect(result.status).toBe('delivered');
	expect(requests).toHaveLength(1);
	expect(requests[0]?.body).toMatchObject({
		eventCount: 1,
		source: 'absolutejs-voice'
	});
	expect(
		(requests[0]?.body.events as StoredVoiceTraceEvent[] | undefined)?.[0]?.payload
			.text
	).toBe('Email [redacted]');
	expect(requests[0]?.headers.get('x-absolutejs-signature')).toStartWith(
		'sha256='
	);
});

test('createVoiceTraceS3Sink writes trace envelopes to object storage', async () => {
	const writes: Array<{ data: string; key: string }> = [];
	const event = createVoiceTraceEvent({
		at: 100,
		payload: {
			text: 'Trace me'
		},
		sessionId: 'session-s3',
		type: 'turn.assistant'
	});

	const result = await deliverVoiceTraceEventsToSinks({
		events: [event],
		redact: false,
		sinks: [
			createVoiceTraceS3Sink({
				bucket: 'voice-bucket',
				client: {
					file: (key) => ({
						write: (data) => {
							writes.push({ data, key: String(key) });
							return Promise.resolve(String(data).length);
						}
					})
				} as never,
				id: 'trace-s3',
				keyPrefix: 'exports/traces'
			})
		]
	});

	expect(result.status).toBe('delivered');
	expect(writes).toHaveLength(1);
	expect(writes[0]?.key).toStartWith('exports/traces/');
	expect(JSON.parse(writes[0]?.data ?? '{}')).toMatchObject({
		eventCount: 1,
		source: 'absolutejs-voice'
	});
	expect(result.sinkDeliveries['trace-s3']?.deliveredTo).toStartWith(
		's3://voice-bucket/exports/traces/'
	);
});

test('createVoiceTraceSinkStore mirrors appends to sinks', async () => {
	const base = createVoiceMemoryTraceEventStore();
	const delivered: StoredVoiceTraceEvent[] = [];
	const deliveryResults: string[] = [];
	const store = createVoiceTraceSinkStore({
		awaitDelivery: true,
		onDelivery: (result) => {
			deliveryResults.push(result.status);
		},
		sinks: [
			{
				deliver: async ({ events }) => {
					delivered.push(...events);
					return {
						attempts: 1,
						eventCount: events.length,
						status: 'delivered'
					};
				},
				id: 'memory-sink'
			}
		],
		store: base
	});

	const event = await store.append({
		at: 100,
		payload: {
			text: 'stored'
		},
		sessionId: 'session-sink-store',
		type: 'turn.assistant'
	});

	expect(await base.get(event.id)).toEqual(event);
	expect(delivered).toEqual([event]);
	expect(deliveryResults).toEqual(['delivered']);
});

test('createVoiceProfileTraceTagger annotates appended events with benchmark profile metadata', async () => {
	const base = createVoiceMemoryTraceEventStore();
	const store = createVoiceProfileTraceTagger({
		defaultProfile: {
			description: 'Browser meeting recorder path.',
			id: 'meeting-recorder',
			label: 'Meeting recorder'
		},
		store: base
	});

	const event = await store.append({
		at: 100,
		payload: {
			elapsedMs: 420,
			kind: 'llm',
			provider: 'openai'
		},
		sessionId: 'profile-tagged-session',
		type: 'session.error'
	});

	expect(await base.get(event.id)).toMatchObject({
		metadata: {
			benchmarkProfileId: 'meeting-recorder',
			profileDescription: 'Browser meeting recorder path.',
			profileId: 'meeting-recorder',
			profileLabel: 'Meeting recorder'
		},
		payload: {
			benchmarkProfileId: 'meeting-recorder',
			profileDescription: 'Browser meeting recorder path.',
			profileId: 'meeting-recorder',
			profileLabel: 'Meeting recorder'
		}
	});
});

test('createVoiceProfileTraceTagger resolves per-session profiles without overwriting explicit profile payloads', async () => {
	const base = createVoiceMemoryTraceEventStore();
	const store = createVoiceProfileTraceTagger({
		profiles: [
			{ id: 'support-agent', label: 'Support agent' },
			{ id: 'meeting-recorder', label: 'Meeting recorder' }
		],
		resolveProfile: (event) =>
			event.sessionId.startsWith('support')
				? 'support-agent'
				: 'meeting-recorder',
		store: base
	});

	const event = await store.append({
		at: 100,
		payload: {
			profileId: 'custom-profile',
			text: 'stored'
		},
		sessionId: 'support-session',
		type: 'turn.assistant'
	});

	expect(await base.get(event.id)).toMatchObject({
		metadata: {
			benchmarkProfileId: 'support-agent',
			profileId: 'support-agent',
			profileLabel: 'Support agent'
		},
		payload: {
			benchmarkProfileId: 'support-agent',
			profileId: 'custom-profile',
			profileLabel: 'Support agent'
		}
	});
});

test('redactVoiceTraceText supports custom replacements', () => {
	expect(
		redactVoiceTraceText('Reach me at alex@example.com', {
			replacement: ({ key }) => `[${key ?? 'pii'}]`
		})
	).toBe('Reach me at [pii]');
});
