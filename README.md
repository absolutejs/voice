# `@absolutejs/voice`

`@absolutejs/voice` is the self-hosted voice operations layer for AbsoluteJS.

It gives your app the primitives hosted voice platforms usually keep behind their dashboards: browser voice sessions, phone-call routes, provider routing, assistant tools, handoffs, traces, evals, production-readiness checks, latency proof, storage adapters, and framework-native UI helpers.

Use it when you want Vapi/Retell/Bland-style voice-agent capability, but you want the orchestration, data, traces, storage, and UI to live inside the AbsoluteJS server you already operate.

## Why AbsoluteJS Voice

- Self-hosted by default: your app owns sessions, traces, reviews, tasks, handoffs, retention, and provider keys.
- Provider-neutral: use Deepgram, AssemblyAI, OpenAI, Anthropic, Gemini, ElevenLabs-style TTS, or your own adapters without rewriting app workflow code.
- Browser and phone surfaces: mount browser WebSocket voice routes plus Twilio, Telnyx, and Plivo telephony routes from the same package.
- Production proof: App Kit, production readiness, turn quality, turn latency, live browser p50/p95 latency, trace timelines, evals, fixtures, and contracts are package primitives.
- Framework parity: React, Vue, Svelte, Angular, HTML, HTMX, and plain client entrypoints share the same core behavior.
- No hosted platform tax: AbsoluteJS Voice does not add a mandatory per-minute orchestration fee between your app and your providers.

## Start Here

Pick the path that matches what you are building:

- Browser voice agent: mount `voice(...)`, choose an STT adapter, and use the React/Vue/Svelte/Angular/HTML/HTMX client helpers for mic, transcript, reconnect, and status UI.
- Phone voice agent: mount Twilio, Telnyx, or Plivo routes, normalize carrier outcomes, inspect carrier readiness, and persist call lifecycle traces.
- Production readiness: mount `createVoiceAppKitRoutes(...)` to get ops console/status, quality, evals, provider health, sessions, handoffs, diagnostics, and readiness gates.
- Provider routing and fallback: use LLM/STT/TTS provider routers, provider health, provider simulation controls, and cost/latency-aware routing policies.
- Evals and simulation: run scenario fixtures, workflow contracts, tool contracts, outcome contracts, baseline comparisons, and saved benchmark artifacts before live traffic.

## How This Differs From Hosted Voice Platforms

Hosted voice-agent platforms are strongest when you want a managed dashboard, phone-number provisioning, hosted orchestration, and campaign tooling out of the box.

AbsoluteJS Voice is strongest when voice is part of your own product and you need code-owned primitives:

- Your app stores the call data instead of a vendor dashboard being the source of truth.
- Your app controls provider routing, fallback, retries, handoffs, and retention.
- Your team can inspect and extend every primitive.
- Your framework UI can render first-class voice state without iframe/dashboard handoffs.
- Your production checks and evals can run in CI, smoke tests, or your own admin UI.

The goal is not to clone a hosted platform. The goal is to make AbsoluteJS the best place to build and operate self-hosted voice products.

## Install

```bash
bun add @absolutejs/voice @absolutejs/voice-deepgram
```

Peer dependencies:

- `@absolutejs/absolute`
- `elysia`

Optional framework entrypoints:

- `@absolutejs/voice/react`
- `@absolutejs/voice/vue`
- `@absolutejs/voice/svelte`
- `@absolutejs/voice/angular`
- `@absolutejs/voice/client`

Common optional adapters:

- `@absolutejs/voice-deepgram`
- `@absolutejs/voice-assemblyai`

## Browser Voice Agent

```ts
import { Elysia } from 'elysia';
import {
	voice,
	createVoiceMemoryStore,
	createPhraseHintCorrectionHandler
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const app = new Elysia()
	.use(
		voice({
			path: '/voice',
			preset: 'guided-intake',
			lexicon: [
				{
					text: 'AbsoluteJS',
					aliases: ['absoloot js'],
					pronunciation: 'ab-so-lute jay ess'
				}
			],
			phraseHints: [
				{ text: 'AbsoluteJS', aliases: ['absolute js'] },
				{ text: 'Joe Johnston', aliases: ['joe johnson'] }
			],
			correctTurn: createPhraseHintCorrectionHandler(),
			onComplete: async ({ session }) => {
				console.log(session.turns);
			},
			async onTurn({ turn }) {
				console.log('turn quality:', {
					source: turn.quality?.source,
					fallbackUsed: turn.quality?.fallbackUsed,
					confidence: turn.quality?.averageConfidence
				});
				return {
					assistantText: `You said: ${turn.text}`
				};
			},
			session: createVoiceMemoryStore(),
			stt: deepgram({
				apiKey: process.env.DEEPGRAM_API_KEY!,
				model: 'nova-3'
			})
		})
	);
```

`createVoiceMemoryStore()` is dev-only. Real deployments should provide a shared store backed by Redis, Postgres, or equivalent.

## Production Readiness Path

Once the basic route works, mount the App Kit. This gives you the self-hosted operational surface that hosted platforms usually make mandatory:

```ts
import {
	createVoiceAppKitRoutes,
	createVoiceFileRuntimeStorage,
	createVoiceLiveLatencyRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceTraceTimelineRoutes,
	createVoiceTurnLatencyRoutes,
	createVoiceTurnQualityRoutes
} from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

app
	.use(
		createVoiceAppKitRoutes({
			store: runtime.traces,
			llmProviders: ['openai', 'anthropic', 'gemini'],
			sttProviders: ['deepgram', 'assemblyai']
		}).routes
	)
	.use(
		createVoiceTurnLatencyRoutes({
			htmlPath: '/turn-latency',
			path: '/api/turn-latency',
			store: runtime.session,
			traceStore: runtime.traces
		})
	)
	.use(
		createVoiceLiveLatencyRoutes({
			htmlPath: '/live-latency',
			path: '/api/live-latency',
			store: runtime.traces
		})
	)
	.use(
		createVoiceTurnQualityRoutes({
			htmlPath: '/turn-quality',
			path: '/api/turn-quality',
			store: runtime.session
		})
	)
	.use(
		createVoiceTraceTimelineRoutes({
			htmlPath: '/traces',
			path: '/api/voice-traces',
			store: runtime.traces
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			htmlPath: '/production-readiness',
			path: '/api/production-readiness',
			store: runtime.traces
		})
	);
```

Recommended proof routes:

- `/app-kit/status`: compact customer-facing app status.
- `/production-readiness`: production gate summary.
- `/traces`: per-session trace timelines.
- `/turn-latency`: server-side turn-stage latency.
- `/live-latency`: browser-measured speech-to-assistant p50/p95 latency.
- `/turn-quality`: STT confidence, correction, fallback, and transcript diagnostics.

## Phone Voice Agent Path

Use the telephony primitives when the agent needs to answer or place calls through your own carrier account:

```ts
import {
	createVoicePhoneAgent,
	createVoiceTelephonyOutcomePolicy
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const outcomePolicy = createVoiceTelephonyOutcomePolicy({
	transferTarget: '+15551234567'
});

app
	.use(
		createVoicePhoneAgent({
			matrix: {
				path: '/api/carriers',
				title: 'AbsoluteJS Voice Carrier Matrix'
			},
			carriers: [
				{
					provider: 'twilio',
					options: {
						context: {},
						outcomePolicy,
						session: runtime.session,
						stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
						streamPath: '/api/voice/twilio/stream',
						twiml: {
							path: '/api/voice/twilio',
							streamUrl: process.env.TWILIO_STREAM_URL
						},
						webhook: {
							path: '/api/voice/twilio/webhook',
							signingSecret: process.env.TWILIO_AUTH_TOKEN
						},
						async onTurn({ turn }) {
							return { assistantText: `I heard: ${turn.text}` };
						},
						onComplete: async () => {}
					}
				}
			]
		}).routes
	);
```

The wrapper mounts selected carrier routes and a readiness matrix. Telnyx and Plivo use the same wrapper with `{ provider: 'telnyx', options: ... }` or `{ provider: 'plivo', options: ... }`. The lower-level `createTwilioVoiceRoutes(...)`, `createTelnyxVoiceRoutes(...)`, and `createPlivoVoiceRoutes(...)` helpers remain available when you need carrier-specific control.

## App Kit And Status Widgets

Use `createVoiceAppKitRoutes(...)` when you want a self-hosted operations surface without hand-wiring every dashboard route. It adds the ops console, quality gates, eval routes, provider health, session replay, handoff health, diagnostics, and `GET /app-kit/status`.

```ts
import { createVoiceAppKitRoutes, createVoiceFileRuntimeStorage } from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({ directory: '.voice-runtime/support' });

app.use(
	createVoiceAppKitRoutes({
		store: runtime.traces,
		llmProviders: ['openai', 'anthropic', 'gemini'],
		sttProviders: ['deepgram', 'assemblyai']
	}).routes
);
```

The status endpoint is intentionally small enough for customer-facing demos. It can report fixture-backed workflow readiness while leaving deeper live quality/session failures visible on the ops pages.

```ts
app.use(
	createVoiceAppKitRoutes({
		appStatus: {
			include: { quality: false, sessions: false },
			preferFixtureWorkflows: true
		},
		evals: { fixtures: certificationFixtures, scenarios: workflowScenarios },
		store: runtime.traces
	}).routes
);
```

### React Status Widget

```tsx
import { VoiceOpsStatus } from '@absolutejs/voice/react';

export function OpsBadge() {
	return <VoiceOpsStatus intervalMs={5000} />;
}
```

### Vue Status Widget

```vue
<script setup lang="ts">
import { VoiceOpsStatus } from '@absolutejs/voice/vue';
</script>

<template>
	<VoiceOpsStatus :interval-ms="5000" />
</template>
```

### Svelte Status Widget

```svelte
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createVoiceOpsStatus } from '@absolutejs/voice/svelte';

	const status = createVoiceOpsStatus('/app-kit/status', { intervalMs: 5000 });
	let html = '';
	onMount(() => status.subscribe(() => (html = status.getHTML())));
	onDestroy(() => status.close());
</script>

{@html html}
```

### Angular Status Widget

```ts
import { VoiceAppKitStatusService } from '@absolutejs/voice/angular';

status = inject(VoiceAppKitStatusService).connect('/app-kit/status', {
	intervalMs: 5000
});
```

```html
<h2>{{ status.report()?.status === 'pass' ? 'Passing' : 'Needs attention' }}</h2>
<p>{{ status.report()?.passed ?? 0 }} passing checks</p>
```

### HTML Or HTMX Status Widget

```html
<div id="voice-ops-status"></div>
<script type="module">
	import { mountVoiceOpsStatus } from '@absolutejs/voice/client';

	mountVoiceOpsStatus(document.querySelector('#voice-ops-status'), '/app-kit/status', {
		intervalMs: 5000
	});
</script>
```

For custom elements:

```html
<absolute-voice-ops-status interval-ms="5000"></absolute-voice-ops-status>
<script type="module">
	import { defineVoiceOpsStatusElement } from '@absolutejs/voice/client';
	defineVoiceOpsStatusElement();
</script>
```

## Voice Assistants

Use `createVoiceAssistant(...)` when you want one product-level surface for a voice agent instead of wiring tools, guardrails, experiments, traces, and ops recipes separately. It returns a standard `onTurn` handler, plus an `ops` object you can pass to `voice(...)`.

```ts
import {
	createVoiceAssistant,
	createVoiceExperiment,
	createVoiceFileRuntimeStorage,
	createVoiceMemoryStore,
	createVoiceAgentTool,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtimeStorage = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

const lookupOrder = createVoiceAgentTool({
	name: 'lookup_order',
	description: 'Look up an order by id.',
	execute: async ({ args }) => ({ orderId: args.orderId, status: 'shipped' })
});

const assistant = createVoiceAssistant({
	id: 'support',
	artifactPlan: {
		ops: {
			events: runtimeStorage.events,
			reviews: runtimeStorage.reviews,
			tasks: runtimeStorage.tasks
		},
		preset: {
			name: 'support-triage',
			options: {
				queue: 'support-triage'
			}
		}
	},
	experiment: createVoiceExperiment({
		id: 'support-prompt',
		variants: [
			{ id: 'baseline', weight: 1 },
			{
				id: 'direct',
				weight: 1,
				system: 'You are concise, practical, and resolve the caller quickly.'
			}
		]
	}),
	guardrails: {
		beforeTurn: ({ turn }) =>
			turn.text.toLowerCase().includes('human')
				? { escalate: { reason: 'caller requested a human' } }
				: undefined
	},
	model: {
		async generate({ messages, tools }) {
			return {
				assistantText: `I can help. Available tools: ${tools.map((tool) => tool.name).join(', ')}`
			};
		}
	},
	system: 'You are a support voice assistant.',
	tools: [lookupOrder],
	trace: runtimeStorage.traces
});

voice({
	path: '/voice',
	session: createVoiceMemoryStore(),
	stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
	trace: runtimeStorage.traces,
	ops: assistant.ops,
	onTurn: assistant.onTurn,
	onComplete: async () => {}
});
```

Assistant experiments are deterministic by session id, so a caller stays on the same variant for a call. Variants can change the model, system prompt, tools, and tool-round budget; guardrails can block a turn before model execution or rewrite the returned `VoiceRouteResult`.

## Agent Tools And Squads

For assistant-style products, use `createVoiceAgent(...)` as the `onTurn` handler. The agent layer is provider-neutral: plug in any model adapter, register server-side tools, and return normal voice route results like `assistantText`, `transfer`, `escalate`, or `complete`.

```ts
import {
	createVoiceAgent,
	createVoiceAgentSquad,
	createVoiceAgentTool,
	createVoiceMemoryStore,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const lookupOrder = createVoiceAgentTool({
	name: 'lookup_order',
	description: 'Look up an order by id.',
	parameters: {
		type: 'object',
		properties: {
			orderId: { type: 'string' }
		},
		required: ['orderId']
	},
	execute: async ({ args }) => {
		return { orderId: args.orderId, status: 'shipped' };
	}
});

const supportAgent = createVoiceAgent({
	id: 'support',
	system: 'You are a concise support voice agent.',
	tools: [lookupOrder],
	model: {
		async generate({ messages, tools }) {
			// Call your LLM provider here. If it returns tool calls, AbsoluteJS
			// executes them and calls the model again with tool results.
			return {
				assistantText: `I can help. Available tools: ${tools.map((tool) => tool.name).join(', ')}`
			};
		}
	}
});

const billingAgent = createVoiceAgent({
	id: 'billing',
	system: 'You handle billing questions.',
	model: {
		async generate() {
			return { assistantText: 'I can help with billing.' };
		}
	}
});

const frontDesk = createVoiceAgentSquad({
	id: 'front-desk',
	defaultAgentId: 'support',
	agents: [supportAgent, billingAgent]
});

voice({
	path: '/voice',
	session: createVoiceMemoryStore(),
	stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
	onTurn: frontDesk.onTurn,
	onComplete: async () => {}
});
```

`createVoiceAgentSquad(...)` gives you squad-style specialization without locking your app into a hosted voice platform. An agent can return `handoff: { targetAgentId: 'billing' }`; the squad records the handoff, runs the target agent on the same turn, and still returns a standard `VoiceRouteResult`.

## Traces And Replay

Use trace stores when you want every call to be inspectable outside a hosted platform. Trace events are append-only records for model passes, tool calls, handoffs, agent results, call lifecycle, turn timing, errors, and cost telemetry.

```ts
import {
	buildVoiceTraceReplay,
	createVoiceAgent,
	createVoiceFileRuntimeStorage,
	createVoiceRedisTaskLeaseCoordinator,
	createVoiceTraceHTTPSink,
	createVoiceTraceSinkStore,
	createVoiceTraceSinkDeliveryWorker,
	exportVoiceTrace,
	pruneVoiceTraceEvents,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtimeStorage = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});
const redisLeases = createVoiceRedisTaskLeaseCoordinator({
	url: process.env.REDIS_URL
});
const trace = createVoiceTraceSinkStore({
	store: runtimeStorage.traces,
	deliveryQueue: runtimeStorage.traceDeliveries,
	redact: true,
	sinks: [
		createVoiceTraceHTTPSink({
			id: 'warehouse',
			url: process.env.TRACE_WAREHOUSE_URL!
		})
	]
});
const traceSinkWorker = createVoiceTraceSinkDeliveryWorker({
	deliveries: runtimeStorage.traceDeliveries,
	leases: redisLeases,
	redact: true,
	sinks: [
		createVoiceTraceHTTPSink({
			id: 'warehouse',
			url: process.env.TRACE_WAREHOUSE_URL!
		})
	],
	workerId: 'trace-sink-worker'
});

const supportAgent = createVoiceAgent({
	id: 'support',
	trace,
	model: {
		async generate() {
			return { assistantText: 'How can I help?' };
		}
	}
});

voice({
	path: '/voice',
	session: runtimeStorage.session,
	stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
	trace,
	onTurn: supportAgent.onTurn,
	onComplete: async () => {}
});

const replay = await exportVoiceTrace({
	store: runtimeStorage.traces,
	filter: {
		sessionId: 'session-123'
	}
});

const report = buildVoiceTraceReplay(replay.events, {
	redact: true,
	title: 'Support call session-123'
});

console.log(report.summary);
console.log(report.evaluation.pass);
await Bun.write('trace.html', report.html);

await pruneVoiceTraceEvents({
	store: runtimeStorage.traces,
	before: Date.now() - 30 * 24 * 60 * 60 * 1000
});
```

`createVoiceMemoryTraceEventStore(...)`, `createVoiceFileTraceEventStore(...)`, `createVoiceSQLiteTraceEventStore(...)`, and `createVoicePostgresTraceEventStore(...)` all implement the same `VoiceTraceEventStore` contract. File, SQLite, and Postgres runtime storage expose `runtimeStorage.traces` and `runtimeStorage.traceDeliveries` alongside sessions, reviews, tasks, events, and external object mappings. Passing `trace` to `voice(...)` records session lifecycle, transcript, committed-turn, assistant, cost, and error events; passing it to agents records model passes, tools, results, and handoffs.

For self-hosted QA and support workflows, use `summarizeVoiceTrace(...)`, `evaluateVoiceTrace(...)`, `renderVoiceTraceMarkdown(...)`, `renderVoiceTraceHTML(...)`, or `buildVoiceTraceReplay(...)`. They turn raw trace events into portable artifacts you can attach to tickets, inspect locally, or fail in CI when a call has missing transcripts, missing turns, tool errors, session errors, or excessive handoffs.

For observability pipelines, wrap any trace store with `createVoiceTraceSinkStore(...)` and pass sinks such as `createVoiceTraceHTTPSink(...)`. The wrapper still writes to your normal file, SQLite, or Postgres store, then fans out appended events to your warehouse, logs, S3 bridge, or analytics endpoint. Use `awaitDelivery: true` only when you want trace delivery to block append completion. For durable delivery, pass `deliveryQueue` and run `createVoiceTraceSinkDeliveryWorker(...)` or `createVoiceTraceSinkDeliveryWorkerLoop(...)`; the worker uses the same Redis lease/idempotency primitives as ops workers and supports retries plus dead-letter stores.

When traces may leave your private runtime, pass `redact: true` or a redaction config to `exportVoiceTrace(...)`, `renderVoiceTraceMarkdown(...)`, `renderVoiceTraceHTML(...)`, or `buildVoiceTraceReplay(...)`. The built-in redactor scrubs common email addresses, phone numbers, and sensitive keys like `token`, `secret`, `password`, `apiKey`, `authorization`, `phone`, and `email`; you can pass custom keys or replacement text for stricter policies.

For retention jobs, `pruneVoiceTraceEvents(...)` works against any trace store. Use `dryRun: true` before deleting, filter by session, trace, scenario, turn, or event type, cap each run with `limit`, or keep only the newest N matching events with `keepNewest`.

## Production Voice Ops

The recommended production pattern is:

- persistent session storage
- built-in review recording
- built-in task creation from call outcomes
- built-in integration event recording

The simplest durable local setup uses `createVoiceFileRuntimeStorage(...)` plus `voice({ ops })`:

```ts
import { Elysia } from 'elysia';
import {
	createVoiceCRMActivitySink,
	createVoiceFileRuntimeStorage,
	createVoiceHelpdeskTicketSink,
	resolveVoiceOutcomeRecipe,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtimeStorage = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

const app = new Elysia().use(
	voice({
		path: '/voice',
		preset: 'reliability',
		session: runtimeStorage.session,
		stt: deepgram({
			apiKey: process.env.DEEPGRAM_API_KEY!,
			model: 'flux-general-en'
		}),
		async onTurn({ turn }) {
			if (turn.text.toLowerCase().includes('billing')) {
				return {
					assistantText: 'Transferring to billing.',
					transfer: {
						reason: 'caller-requested-transfer',
						target: 'billing'
					}
				};
			}

			return {
				assistantText: `You said: ${turn.text}`
			};
		},
		onComplete: async () => {},
		ops: {
			...resolveVoiceOutcomeRecipe('support-triage', {
				assignee: 'support-oncall',
				queue: 'support-triage'
			}),
			reviews: runtimeStorage.reviews,
			tasks: runtimeStorage.tasks,
			events: runtimeStorage.events,
			webhook: {
				url: process.env.VOICE_OPS_WEBHOOK_URL!,
				retries: 2,
				backoffMs: 500,
				signingSecret: process.env.VOICE_OPS_WEBHOOK_SECRET
			},
			sinks: [
				createVoiceHelpdeskTicketSink({
					id: 'helpdesk',
					url: process.env.HELPDESK_SYNC_URL!
				}),
				createVoiceCRMActivitySink({
					id: 'crm',
					url: process.env.CRM_SYNC_URL!
				})
			]
		}
	})
);
```

That gives you:

- persisted sessions under `runtimeStorage.session`
- persisted review artifacts under `runtimeStorage.reviews`
- persisted follow-up tasks under `runtimeStorage.tasks`
- persisted integration events under `runtimeStorage.events`
- persisted vendor object mappings under `runtimeStorage.externalObjects`
- built-in webhook delivery with persisted delivery status on each event
- built-in sink fanout with per-sink delivery metadata on each event

If you need richer review artifacts, pass `ops.buildReview(...)`. If you need custom task routing, pass `ops.createTaskFromReview(...)`. If you need external sync side effects inside your app, use `ops.onEvent(...)`. If you want built-in outbound delivery, use `ops.webhook`. If you want core-managed CRM/helpdesk fanout, use `ops.sinks` with `createVoiceIntegrationHTTPSink(...)`, `createVoiceHelpdeskTicketSink(...)`, or `createVoiceCRMActivitySink(...)`.

For fast production defaults, spread `resolveVoiceOutcomeRecipe(...)` into `ops`. Built-in recipes cover `appointment-booking`, `lead-qualification`, `support-triage`, `voicemail-callback`, and `warm-transfer`; each returns task creation, SLA policies, and urgent routing rules while staying fully self-hosted.

For packaged external systems, core now also includes:

- `createVoiceZendeskTicketSink(...)`
- `createVoiceZendeskTicketUpdateSink(...)`
- `createVoiceZendeskTicketSyncSinks(...)`
- `createVoiceHubSpotTaskSink(...)`
- `createVoiceHubSpotTaskUpdateSink(...)`
- `createVoiceHubSpotTaskSyncSinks(...)`
- `createVoiceLinearIssueSink(...)`
- `createVoiceLinearIssueUpdateSink(...)`
- `createVoiceLinearIssueSyncSinks(...)`

Those adapters stick to the documented-safe request shapes:

- Zendesk: `POST /api/v2/tickets`
- Zendesk updates: `PUT /api/v2/tickets/{ticketId}`
- HubSpot: `POST /crm/v3/objects/tasks`
- HubSpot updates: `PATCH /crm/v3/objects/tasks/{taskId}`
- Linear: `issueCreate` over `https://api.linear.app/graphql`
- Linear updates: `issueUpdate` over `https://api.linear.app/graphql`

Create sinks can persist vendor object ids into `runtimeStorage.externalObjects` when you pass `externalObjects` to the adapter. Update sinks first check explicit event payload ids like `zendeskTicketId`, `hubspotTaskId`, or `linearIssueId`, then resolver callbacks like `ticketId`, `taskId`, or `issueId`, then the external object map. If no external id can be resolved, the sink records a skipped delivery instead of accidentally treating an internal AbsoluteJS task id as a vendor object id.

Use the `*SyncSinks(...)` helpers when you want create/update parity without hand-wiring two adapters. They return a pair of sinks: a create sink for creation events and an update sink for `task.updated` / `task.sla_breached`, sharing the same credentials, fetch options, and `externalObjects` mapping store.

If you want durable non-file runtime storage under Bun, use `createVoiceSQLiteRuntimeStorage(...)` with the same `ops` shape:

```ts
import { createVoiceSQLiteRuntimeStorage, voice } from '@absolutejs/voice';

const runtimeStorage = createVoiceSQLiteRuntimeStorage({
	path: '.voice-runtime/support.sqlite'
});
```

This uses Bun's native `bun:sqlite` driver directly.

If you want production-friendly shared storage, use `createVoicePostgresRuntimeStorage(...)`:

```ts
import { createVoicePostgresRuntimeStorage, voice } from '@absolutejs/voice';

const runtimeStorage = createVoicePostgresRuntimeStorage({
	connectionString: process.env.DATABASE_URL!,
	schemaName: 'voice_ops',
	tablePrefix: 'support'
});
```

This uses Bun's native `Bun.SQL` client for PostgreSQL.

File, SQLite, and Postgres runtime storage expose the same core surfaces: `session`, `reviews`, `tasks`, `events`, and `externalObjects`. Vendor create/update sink mapping works the same way across local demos and production deployments.

If you need worker coordination for follow-up tasks, use Bun's native Redis client through `createVoiceRedisTaskLeaseCoordinator(...)`:

```ts
import { createVoiceRedisTaskLeaseCoordinator } from '@absolutejs/voice';

const leases = createVoiceRedisTaskLeaseCoordinator({
	url: process.env.REDIS_URL,
	keyPrefix: 'voice:ops'
});

const claimed = await leases.claim({
	taskId: 'task-123',
	workerId: 'worker-a',
	leaseMs: 30_000
});
```

For durable redelivery and idempotent event processing, combine that with `createVoiceRedisIdempotencyStore(...)` and `createVoiceWebhookDeliveryWorker(...)`.

If you want a long-running worker loop, use `createVoiceWebhookDeliveryWorkerLoop(...)` and attach a dead-letter store for repeatedly failing events.

If you need operator task workers in core, use `createVoiceOpsTaskWorker(...)` for lease-backed claim/heartbeat/complete/requeue flows, or `createVoiceOpsTaskProcessorWorker(...)` when you want a handler-driven queue that records failures, requeues retries, and dead-letters tasks after repeated errors.

For task queue observability, use `summarizeVoiceOpsTaskQueue(...)` to report claimed/unclaimed counts, retry-eligible tasks, overdue work, assignee/claim ownership, and dead-letter totals from the same persisted task stores.

If you want assignee and worker throughput metrics directly from stored task history, use `summarizeVoiceOpsTaskAnalytics(...)`. It derives:

- aging buckets (`fresh`, `aging`, `due-soon`, `overdue`, `stale`)
- assignee backlog and average completion time
- worker claim / heartbeat / failure / completion counts
- total overdue and completed workload

If you want outcome-driven SLAs in core, set `ops.taskPolicies` or `ops.resolveTaskPolicy(...)`. Tasks can now carry:

- `priority`
- `dueAt`
- `policyName`
- `processingAttempts`
- `processingError`
- `deadLetteredAt`

The built-in default policies already bias toward real ops behavior:

- `escalated` -> urgent, short SLA
- `failed` -> high priority review
- `voicemail` -> callback SLA
- `no-answer` -> retry SLA
- `transferred` -> verification SLA

Policies can also set:

- `assignee`
- `queue`
- `priority`
- `dueInMs`
- `recommendedAction`

If you need routing beyond static outcome policies, use `ops.taskAssignmentRules` or `ops.resolveTaskAssignment(...)`. Assignment rules run after task policy resolution, so you can do things like:

- route urgent tasks to an on-call queue
- move high-priority callbacks into a fast-lane pool
- escalate specific policy lanes to supervisor ownership

If you want SLA follow-up automation in core, use `createVoiceOpsRuntime(...).checkSLA()` or configure `sla.followUpTask` on the runtime. Overdue tasks can now:

- be marked once with `slaBreachedAt`
- emit a portable `task.sla_breached` integration event
- create a secondary follow-up task for supervisors or escalation queues

If you want one higher-level core surface instead of wiring review recording, webhook workers, task processors, and queue summaries by hand, use `createVoiceOpsRuntime(...)`:

```ts
import {
	createVoiceCRMActivitySink,
	createVoiceFileRuntimeStorage,
	createVoiceHelpdeskTicketSink,
	createVoiceOpsRuntime,
	createVoiceRedisTaskLeaseCoordinator,
	voice
} from '@absolutejs/voice';

const runtimeStorage = createVoiceFileRuntimeStorage({
	dir: '.voice-runtime/support'
});

const ops = {
	reviews: runtimeStorage.reviews,
	tasks: runtimeStorage.tasks,
	events: runtimeStorage.events,
	sinks: [
		createVoiceHelpdeskTicketSink({
			id: 'helpdesk',
			url: process.env.HELPDESK_SYNC_URL!
		}),
		createVoiceCRMActivitySink({
			id: 'crm',
			url: process.env.CRM_SYNC_URL!
		})
	]
} as const;

const opsRuntime = createVoiceOpsRuntime({
	ops,
	sinks: {
		autoStart: true,
		leases: createVoiceRedisTaskLeaseCoordinator({
			url: process.env.REDIS_URL,
			keyPrefix: 'voice:ops:sinks'
		}),
		maxFailures: 3,
		workerId: 'ops-sink-worker'
	},
	tasks: {
		autoStart: true,
		leases: createVoiceRedisTaskLeaseCoordinator({
			url: process.env.REDIS_URL,
			keyPrefix: 'voice:ops:tasks'
		}),
		maxFailures: 3,
		process: async (task) => {
			if (task.kind === 'callback') {
				// hand off to CRM / dialer / queue
				return { action: 'complete' };
			}

			return { action: 'requeue', detail: 'Waiting for a downstream system.' };
		},
		workerId: 'ops-task-worker'
	},
	webhooks: {
		autoStart: true,
		leases: createVoiceRedisTaskLeaseCoordinator({
			url: process.env.REDIS_URL,
			keyPrefix: 'voice:ops:events'
		}),
		retries: 2,
		signingSecret: process.env.VOICE_OPS_WEBHOOK_SECRET,
		url: process.env.VOICE_OPS_WEBHOOK_URL!,
		workerId: 'ops-webhook-worker'
	}
});

opsRuntime.start();

app.use(
	voice({
		path: '/voice',
		ops
	})
);
```

That gives you:

- one portable `ops` config for review/task/event recording
- built-in sink fanout plus sink redelivery workers
- built-in webhook delivery workers
- built-in task processor workers
- unified `tick()`, `start()`, `stop()`, and `summarize()` controls
- one queue/runtime surface to test and operate

If you want opinionated queue routing without handcrafting every assignee/queue/SLA rule, start from `resolveVoiceOpsPreset(...)` and spread the result into your ops runtime:

```ts
import { resolveVoiceOpsPreset } from '@absolutejs/voice';

const opsPreset = resolveVoiceOpsPreset('support-default');

const opsRuntime = createVoiceOpsRuntime({
	ops: {
		reviews: runtimeStorage.reviews,
		tasks: runtimeStorage.tasks,
		events: runtimeStorage.events,
		taskPolicies: opsPreset.taskPolicies
	},
	sla: opsPreset.sla
});
```

Built-in presets:

- `support-default`
- `sales-default`
- `collections-default`

Those presets include both:

- `taskPolicies`
- `assignmentRules`

If you want larger review artifacts in object storage instead of a local or SQL store, use Bun's native S3 client through `createVoiceS3ReviewStore(...)`.

## Production Checklist

Use this as the default deployment checklist for a real voice app:

- Storage:
  use a shared session store for `session`
- Runtime ops:
  enable `ops.reviews`, `ops.tasks`, and `ops.events`
- Review path:
  make stored review artifacts visible somewhere operators can inspect quickly
- Task path:
  turn non-happy outcomes like `transferred`, `escalated`, `voicemail`, `no-answer`, and `failed` into follow-up work
- Task policy:
  set `ops.taskPolicies` or `ops.resolveTaskPolicy(...)` so follow-up work gets real priorities and deadlines instead of ad hoc app rules
- Worker path:
  run Redis-leased task workers for follow-up ops and keep dead-letter queues for tasks that repeatedly fail downstream processing
- Event path:
  persist `ops.events`, enable `ops.webhook` for outbound delivery, and reserve `ops.onEvent(...)` for app-local side effects
- STT:
  use the adapter/model pair you have actually benchmarked for the channel you are shipping
- PSTN:
  prefer the telephony path you have validated live, and keep channel-specific settings in presets instead of ad hoc script overrides
- Correction:
  keep correction deterministic and domain-safe; do not ship benchmark-shaped seeded aliases as your default public path
- Observability:
  capture first partial, first commit, first outbound audio, barge-in stop, disposition, and per-turn errors
- QA:
  run repeated live benchmarks for the channel you care about, not just single-pass smoke checks

For the local file-backed starter path, the minimum production-shaped stack is:

- `createVoiceFileRuntimeStorage(...)`
- `voice({ session: runtimeStorage.session, ops: { reviews, tasks, events } })`
- one review UI
- one task queue UI
- one integration-event sink

## TTS

`@absolutejs/voice` now supports optional assistant audio streaming on the same session path. If you provide a `tts` adapter, `assistantText` responses are still sent as text, and the synthesized PCM chunks are streamed as `audio` messages alongside them.

```ts
import { voice, createVoiceMemoryStore } from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';
import { elevenlabs } from '@absolutejs/voice-elevenlabs';

app.use(
	voice({
		path: '/voice',
		session: createVoiceMemoryStore(),
		stt: deepgram({
			apiKey: process.env.DEEPGRAM_API_KEY!,
			model: 'flux-general-en'
		}),
		tts: elevenlabs({
			apiKey: process.env.ELEVENLABS_API_KEY!,
			voiceId: process.env.ELEVENLABS_VOICE_ID!
		}),
		onTurn: async ({ turn }) => ({
			assistantText: `You said: ${turn.text}`
		}),
		onComplete: async () => {}
	})
);
```

Client state now exposes `assistantAudio` on the stream/controller helpers, so apps can buffer or play synthesized chunks without inventing a second transport.

If you want a minimal browser playback path, use the client audio player:

```ts
import {
	createVoiceAudioPlayer,
	createVoiceController
} from '@absolutejs/voice/client';

const voice = createVoiceController('/voice', {
	preset: 'chat'
});
const player = createVoiceAudioPlayer(voice);

await player.start(); // call from a user gesture
await player.interrupt(); // flush queued assistant playback for barge-in
```

`createVoiceAudioPlayer()` subscribes to `assistantAudio`, decodes raw `pcm_s16le` chunks, and queues them in WebAudio. It also exposes `interrupt()`, `lastInterruptLatencyMs`, and `lastPlaybackStopLatencyMs` so apps can flush assistant playback during barge-in and inspect how long it took for queued playback to fully stop.

For a higher-level client path, use the duplex helper:

```ts
import { createVoiceDuplexController } from '@absolutejs/voice/client';

const voice = createVoiceDuplexController('/voice', {
	bargeIn: {
		interruptThreshold: 0.08
	},
	preset: 'chat'
});

await voice.audioPlayer.start();
await voice.startRecording();
```

`createVoiceDuplexController()` composes the controller and audio player and automatically interrupts assistant playback when:

- microphone input crosses the configured barge-in threshold
- partial user speech starts arriving
- manual `sendAudio(...)` is called while assistant audio is playing

## Duplex Benchmarks

The first duplex benchmark lane measures package-level barge-in interruption on the client path. It records scenario pass/fail plus local interruption latency for:

- manual `sendAudio(...)`
- partial transcript start
- input-level threshold crossing

Run it with:

```bash
bun run bench:duplex
```

That writes:

- `benchmark-results/duplex-barge-in.json`

## Telephony

`@absolutejs/voice` now includes a first PSTN bridge layer for Twilio Media Streams. It converts inbound `audio/x-mulaw` 8 kHz frames into the PCM format the voice session expects, and converts assistant PCM audio back into outbound Twilio media events.

Minimal usage:

```ts
import { createTwilioMediaStreamBridge, createTwilioVoiceResponse } from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';
import { elevenlabs } from '@absolutejs/voice-elevenlabs';

const twiml = createTwilioVoiceResponse({
  streamUrl: 'wss://example.com/voice/twilio',
  parameters: {
    sessionId: 'call-123',
    scenarioId: 'phone-intake'
  },
  track: 'both_tracks'
});

const bridge = createTwilioMediaStreamBridge(twilioSocket, {
  context: {},
  onComplete: async () => {},
  onTurn: async ({ turn }) => ({
    assistantText: `You said: ${turn.text}`
  }),
  session: createVoiceMemoryStore(),
  stt: deepgram({
    apiKey: process.env.DEEPGRAM_API_KEY!,
    model: 'flux-general-en'
  }),
  tts: elevenlabs({
    apiKey: process.env.ELEVENLABS_API_KEY!,
    voiceId: process.env.ELEVENLABS_VOICE_ID!
  })
});

await bridge.handleMessage(startMessageFromTwilio);
await bridge.handleMessage(mediaMessageFromTwilio);
```

The bridge also sends Twilio `clear` events on new inbound media after assistant audio has started streaming, so telephony barge-in can stop queued outbound playback.

You can benchmark the package-level Twilio bridge path with:

```bash
bun run bench:telephony:run
```

That writes:
- `benchmark-results/telephony-twilio-bridge.json`
- `benchmark-results/telephony-run-manifest.json`

For a live vendor-backed duplex smoke benchmark on the real TTS adapters, run:

```bash
bun run bench:duplex:live:run
```

That writes fresh results to:

For a live vendor-backed telephony smoke benchmark through the Twilio bridge path, run:

```bash
bun run bench:telephony:live:run
```

That writes:
- `benchmark-results/telephony-live-deepgram-elevenlabs.json`
- `benchmark-results/telephony-live-run-manifest.json`

For a repeated live telephony stability read, run:

```bash
bun run bench:telephony:live:series
```

That writes:
- `benchmark-results/telephony-live-series-summary-runs-3.json`

For a live Deepgram telephony model shootout on the same PSTN path, run:

```bash
bun run bench:telephony:live:shootout
```

That writes:
- `benchmark-results/telephony-live-flux-general-en.json`
- `benchmark-results/telephony-live-nova-3-phone.json`
- `benchmark-results/telephony-live-shootout-manifest.json`

- `benchmark-results/duplex-live-elevenlabs.json`
- `benchmark-results/duplex-live-openai.json`
- `benchmark-results/duplex-live-all.json`
- `benchmark-results/duplex-live-run-manifest.json`

For a browser-run duplex benchmark that uses a real headless Chrome `AudioContext` instead of the fake Node-side playback context, run:

```bash
bun run bench:duplex:browser:run
```

That writes fresh results to:

- `benchmark-results/duplex-browser-elevenlabs.json`
- `benchmark-results/duplex-browser-openai.json`
- `benchmark-results/duplex-browser-all.json`
- `benchmark-results/duplex-browser-run-manifest.json`

To measure browser duplex stability across repeated runs, use:

```bash
bun run bench:duplex:browser:series
```

That writes:

- `benchmark-results/duplex-browser-series-summary-runs-3.json`
- per-run provider artifacts like `benchmark-results/duplex-browser-elevenlabs-series-run-1.json`

For repeated interrupt-and-resume across several consecutive assistant turns, run:

```bash
bun run bench:duplex:browser:overlap:run
```

That writes:

- `benchmark-results/duplex-browser-overlap-elevenlabs.json`
- `benchmark-results/duplex-browser-overlap-openai.json`
- `benchmark-results/duplex-browser-overlap-all.json`
- `benchmark-results/duplex-browser-overlap-run-manifest.json`

To measure overlap stability across repeated live browser runs, use:

```bash
bun run bench:duplex:browser:overlap:series
```

That writes:

- `benchmark-results/duplex-browser-overlap-series-summary-runs-3.json`
- per-run provider artifacts like `benchmark-results/duplex-browser-overlap-elevenlabs-series-run-1.json`

## TTS Benchmarks

`@absolutejs/voice` now includes a first TTS benchmark harness for streaming output adapters. The initial metrics are:

- `firstAudioLatencyMs`
- `elapsedMs`
- `audioChunkCount`
- `totalAudioBytes`
- estimated PCM `audioDurationMs`
- interruption responsiveness via `interruptionLatencyMs`

Run the full TTS suite with one command:

```bash
bun run bench:tts:run
```

That writes fresh results to:

- `benchmark-results/tts-all.json`
- `benchmark-results/tts-elevenlabs.json`
- `benchmark-results/tts-openai.json`
- `benchmark-results/tts-run-manifest.json`

To measure interruption/cancel responsiveness separately:

```bash
bun run bench:tts:interrupt:run
```

That writes fresh interruption results to:

- `benchmark-results/tts-all-interrupt.json`
- `benchmark-results/tts-elevenlabs-interrupt.json`
- `benchmark-results/tts-openai-interrupt.json`
- `benchmark-results/tts-interrupt-run-manifest.json`

## Recommended Production Path

The current best-performing path in the bundled benchmarks is:

- `deepgram-flux` as primary STT
- route-level `lexicon` for pronunciation/domain entries
- route-level `phraseHints`
- route-level `correctTurn` using `createPhraseHintCorrectionHandler()`

That combination outperformed the raw vendor-only paths in the package benchmarks because it lets AbsoluteJS repair domain-specific terms after strong base transcription instead of depending on a second STT vendor to rescue hard turns.

Minimal production-oriented example:

```ts
import {
	createVoiceSTTRoutingCorrectionHandler,
	createPhraseHintCorrectionHandler,
	resolveVoiceSTTRoutingStrategy,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

app.use(
	voice({
		path: '/voice/intake',
		preset: 'reliability',
		lexicon: [
			{
				text: 'AbsoluteJS',
				aliases: ['absoloot js'],
				pronunciation: 'ab-so-lute jay ess'
			}
		],
		phraseHints: [
			{ text: 'AbsoluteJS', aliases: ['absolute js'] },
			{ text: 'Joe Johnston', aliases: ['joe johnson'] },
			{
				text: 'beneath well thatched trees that shed the rain like a roof',
				aliases: ['beneath wealth', 'shelter beneath wealth']
			}
		],
		correctTurn: createPhraseHintCorrectionHandler(),
		session: createVoiceMemoryStore(),
		stt: deepgram({
			apiKey: process.env.DEEPGRAM_API_KEY!,
			model: 'flux-general-en'
		}),
		onTurn: async ({ turn }) => ({
			assistantText: `Captured: ${turn.text}`
		}),
		onComplete: async () => {}
	})
);
```

`phraseHints` are user-controlled route config, not hidden framework magic. They are there so the app can teach the voice route its domain vocabulary.

## Best Vs Cheap STT

`@absolutejs/voice` now exposes an explicit package-level routing split so apps can choose between the strongest benchmarked path and a cheaper/raw path without inventing their own policy layer.

```ts
import {
	createVoiceMemoryStore,
	createVoiceSTTRoutingCorrectionHandler,
	resolveVoiceSTTRoutingStrategy,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const strategy = resolveVoiceSTTRoutingStrategy('best');

app.use(
	voice({
		path: '/voice/stt',
		preset: strategy.preset,
		phraseHints: [{ text: 'Joe Johnston', aliases: ['joe johnson'] }],
		correctTurn: createVoiceSTTRoutingCorrectionHandler(strategy.correctionMode),
		session: createVoiceMemoryStore(),
		sttLifecycle: strategy.sttLifecycle,
		stt: deepgram({
			apiKey: process.env.DEEPGRAM_API_KEY!,
			model: 'flux-general-en'
		})
	})
);
```

- `best` maps to the current strongest in-package path: Deepgram Flux plus generic deterministic correction.
- `low-cost` maps to a cheaper/raw package path: one primary STT pass with no correction hook.
- session benchmarks now include per-turn cost telemetry fields like `averageRelativeCostUnits`, `averagePrimaryAudioMs`, and `averageFallbackReplayAudioMs`.
- use `bun run bench:stt:routing:run` to benchmark both in parallel and write fresh:
  - `benchmark-results/sessions-best-stt-runs-3.json`
  - `benchmark-results/sessions-cheap-stt-runs-3.json`
  - `benchmark-results/stt-routing-run-manifest.json`

## LLM Provider Routing

Use `createVoiceProviderRouter(...)` when your assistant can run on more than one LLM provider. The router keeps provider choice inside your app: you define the available model adapters, profile each provider, and choose a policy.

```ts
import {
	createAnthropicVoiceAssistantModel,
	createGeminiVoiceAssistantModel,
	createOpenAIVoiceAssistantModel,
	createVoiceProviderRouter,
	resolveVoiceProviderRoutingPolicyPreset
} from '@absolutejs/voice';

const model = createVoiceProviderRouter({
	providers: {
		openai: createOpenAIVoiceAssistantModel({ apiKey: process.env.OPENAI_API_KEY! }),
		anthropic: createAnthropicVoiceAssistantModel({ apiKey: process.env.ANTHROPIC_API_KEY! }),
		gemini: createGeminiVoiceAssistantModel({ apiKey: process.env.GEMINI_API_KEY! })
	},
	providerHealth: {
		failureThreshold: 1,
		cooldownMs: 30_000,
		rateLimitCooldownMs: 120_000
	},
	providerProfiles: {
		openai: { cost: 6, latencyMs: 650, quality: 0.92, timeoutMs: 3500 },
		anthropic: { cost: 7, latencyMs: 850, quality: 0.95, timeoutMs: 4500 },
		gemini: { cost: 2, latencyMs: 700, quality: 0.86, timeoutMs: 3500 }
	},
	policy: resolveVoiceProviderRoutingPolicyPreset('balanced')
});
```

Built-in policy presets:

- `quality-first`: rank by `providerProfiles[provider].quality`, then priority, latency, and cost.
- `latency-first`: rank by expected latency.
- `cost-first`: rank by expected cost.
- `cost-cap`: rank by cost and reject providers above `maxCost`.
- `balanced`: weighted score using cost, latency, quality, and priority.

Budget filters are strict. If you pass `maxCost`, `maxLatencyMs`, or `minQuality`, providers outside those limits are removed before ranking, even if they were selected by the request.

```ts
const policy = resolveVoiceProviderRoutingPolicyPreset('cost-cap', {
	maxCost: 3,
	minQuality: 0.82
});
```

For full control, pass an object policy:

```ts
const model = createVoiceProviderRouter({
	providers,
	providerProfiles,
	policy: {
		strategy: 'balanced',
		maxLatencyMs: 1000,
		weights: { cost: 1, latencyMs: 0.004, quality: 12 }
	}
});
```

The same profile and policy shape also works for STT and TTS provider routers, so a self-hosted app can choose the fastest provider for live calls, cap cost for background work, or require a minimum quality score without hard-coding provider branches.

```ts
const stt = createVoiceSTTProviderRouter({
	adapters: {
		deepgram,
		assemblyai
	},
	providerHealth: { cooldownMs: 30_000 },
	providerProfiles: {
		deepgram: { cost: 4, latencyMs: 180, quality: 0.93, timeoutMs: 1500 },
		assemblyai: { cost: 2, latencyMs: 650, quality: 0.88, timeoutMs: 3000 }
	},
	policy: resolveVoiceProviderRoutingPolicyPreset('latency-first')
});

const tts = createVoiceTTSProviderRouter({
	adapters: {
		elevenlabs,
		openai
	},
	providerProfiles: {
		elevenlabs: { cost: 5, latencyMs: 220, quality: 0.94 },
		openai: { cost: 2, latencyMs: 320, quality: 0.87 }
	},
	policy: resolveVoiceProviderRoutingPolicyPreset('cost-cap', {
		maxCost: 3,
		minQuality: 0.85
	})
});
```

## Presets

Voice now ships named runtime presets so apps can start from a useful baseline instead of hand-tuning silence and capture settings every time.

- `default`
- `chat`
- `guided-intake`
- `dictation`
- `noisy-room`
- `reliability`

On the server:

```ts
voice({
	path: '/voice/intake',
	preset: 'guided-intake',
	session: createVoiceMemoryStore(),
	stt: deepgram({
		apiKey: process.env.DEEPGRAM_API_KEY!,
		model: 'nova-3'
	}),
	onTurn: async ({ turn }) => ({
		assistantText: `Captured: ${turn.text}`
	}),
	onComplete: async () => {}
});
```

On the client:

```ts
import { createVoiceController } from '@absolutejs/voice/client';

const voice = createVoiceController('/voice/intake', {
	preset: 'guided-intake'
});

await voice.startRecording();
voice.endTurn();
voice.stopRecording();
```

Presets are still overridable. If you need to tune for a specific route, layer `turnDetection` or `audioConditioning` on top of the preset instead of replacing the whole setup.

Presets are not the same thing as phrase hints:

- presets tune framework-owned behavior like silence windows, reconnect defaults, and audio conditioning
- `lexicon` tunes pronunciation-aware domain entries that should reach STT/TTS adapters directly
- `phraseHints` tune app/domain vocabulary like company names, product names, legal phrases, or subscriber-specific jargon

In practice:

- use a preset to choose the runtime shape (`guided-intake`, `reliability`, `noisy-room`)
- use `lexicon` when pronunciation matters and you want adapter-consumable entries
- use `phraseHints` to teach the route what words matter for your business
- use `correctTurn` when you want deterministic post-STT repair before the turn is committed

## Framework Helpers

The package now exposes higher-level controller helpers as well as the lower-level stream primitives.

- `@absolutejs/voice/client`
  - `createVoiceController()`
  - `createVoiceStream()`
  - `bindVoiceHTMX()`
- `@absolutejs/voice/react`
  - `useVoiceController()`
  - `useVoiceStream()`
- `@absolutejs/voice/vue`
  - `useVoiceController()`
  - `useVoiceStream()`
- `@absolutejs/voice/svelte`
  - `createVoiceController()`
  - `createVoiceStream()`
- `@absolutejs/voice/angular`
  - `VoiceControllerService`
  - `VoiceStreamService`

The controller helpers abstract the common browser boilerplate:

- microphone capture
- start / stop / toggle recording
- stream subscription state
- HTMX session syncing

They do not hide the underlying transport. You still choose the route path and preset explicitly.

## Lexicon, Phrase Hints, And Correction

`lexicon` is a route-level input for pronunciation-aware domain entries.

It can be:

- a static array for known names, products, and jargon
- a resolver function when entries depend on the tenant, subscriber, or scenario

```ts
voice({
	path: '/voice/intake',
	lexicon: async ({ context }) => {
		return [
			{
				text: 'AbsoluteJS',
				aliases: ['absoloot js'],
				pronunciation: 'ab-so-lute jay ess'
			},
			{
				text: 'Eden Treaty',
				aliases: ['eden tree tea'],
				pronunciation: 'ee-den tree-tee'
			}
		];
	},
	session: createVoiceMemoryStore(),
	stt: deepgram({
		apiKey: process.env.DEEPGRAM_API_KEY!,
		model: 'flux-general-en'
	}),
	onTurn: async ({ turn }) => ({
		assistantText: turn.text
	}),
	onComplete: async () => {}
});
```

How the package uses it:

- adapters receive `lexicon` at open time and translate it into vendor-native hinting surfaces when possible
- STT adapters can use the canonical text plus aliases to bias recognition
- future TTS adapters can use the same entries for pronunciation-aware speech output

`phraseHints` are a separate route-level input that the application owns.

They can be:

- a static array for known domain vocabulary
- a resolver function when hints depend on the authenticated user, tenant, scenario, or subscriber record

```ts
voice({
	path: '/voice/intake',
	preset: 'reliability',
	phraseHints: async ({ context, scenarioId, sessionId }) => {
		return [
			{ text: 'AbsoluteJS', aliases: ['absolute js'] },
			{ text: 'Eden Treaty', aliases: ['eden treaty'] },
			{ text: 'Joe Johnston', aliases: ['joe johnson'] }
		];
	},
	correctTurn: createPhraseHintCorrectionHandler(),
	session: createVoiceMemoryStore(),
	stt: deepgram({
		apiKey: process.env.DEEPGRAM_API_KEY!,
		model: 'flux-general-en'
	}),
	onTurn: async ({ turn }) => ({
		assistantText: turn.text
	}),
	onComplete: async () => {}
});
```

How the package uses them:

- adapters receive `lexicon` and `phraseHints` at open time
- adapters receive `phraseHints` at open time and can translate them into vendor-native hinting surfaces
- the correction layer can use the same hints after STT to repair domain terms before commit

Current built-in correction helper:

```ts
import { createPhraseHintCorrectionHandler } from '@absolutejs/voice';

const correctTurn = createPhraseHintCorrectionHandler();
```

This helper is intentionally deterministic. It is for phrase normalization and domain repair, not for hiding an LLM behind your turn commit. If you need something more advanced, provide your own `correctTurn` handler.

### React

```tsx
import { useVoiceController } from '@absolutejs/voice/react';

export function VoiceWidget() {
	const voice = useVoiceController('/voice/intake', {
		preset: 'guided-intake'
	});

	return (
		<button onClick={() => void voice.toggleRecording()}>
			{voice.isRecording ? 'Stop microphone' : 'Start microphone'}
		</button>
	);
}
```

### Vue

```ts
import { useVoiceController } from '@absolutejs/voice/vue';

const voice = useVoiceController('/voice/intake', {
	preset: 'guided-intake'
});
```

### Svelte

```ts
import { createVoiceController } from '@absolutejs/voice/svelte';

const voice = createVoiceController('/voice/intake', {
	preset: 'guided-intake'
});
```

### Angular

```ts
import { VoiceControllerService } from '@absolutejs/voice/angular';

constructor(private readonly voice: VoiceControllerService) {}

controller = this.voice.connect('/voice/intake', {
	preset: 'guided-intake'
});
```

## HTMX

Voice now mirrors the AI plugin's HTMX pattern with plugin-owned renderers and a plugin-owned fragment route.

```ts
import { voice, createVoiceMemoryStore } from '@absolutejs/voice';

app.use(
	voice({
		path: '/voice/intake',
		htmx: {
			result: ({ result }) =>
				result
					? `<pre>${JSON.stringify(result, null, 2)}</pre>`
					: '<p>No structured result yet.</p>'
		},
		onComplete: async () => {},
		onTurn: async ({ turn }) => ({
			assistantText: `You said: ${turn.text}`
		}),
		session: createVoiceMemoryStore(),
		stt: deepgram({
			apiKey: process.env.DEEPGRAM_API_KEY!,
			model: 'nova-3'
		})
	})
);
```

The plugin exposes `GET /voice/intake/htmx/session?sessionId=...` by default. That route returns HTMX out-of-band fragments for:

- metrics
- status
- committed turns
- assistant replies
- structured result

On the client, bind the browser voice stream to a hidden HTMX refresh element:

```ts
import { createVoiceController } from '@absolutejs/voice/client';

const voice = createVoiceController('/voice/intake', {
	preset: 'guided-intake'
});
voice.bindHTMX({ element: '#voice-htmx-sync' });
```

That keeps HTMX pages declarative without inventing custom fragment endpoints for core voice session UI.

## Competitive Benchmarking

The package includes a competitive benchmark harness for STT quality and responsiveness.

Run:

```bash
bun run bench:vs
```

Use profiles to focus where you want to win:

- `bun run bench:vs all` (default)
- `bun run bench:vs all accents`
- `bun run bench:vs all code-switch`
- `bun run bench:vs all jargon`
- `bun run bench:vs all multilingual`
- `bun run bench:vs all multi-speaker`
- `bun run bench:vs all telephony`
- `bun run bench:vs all clean`
- `bun run bench:vs all noisy`
- `bun run bench:vs deepgram accents`
- `bun run bench:vs deepgram-flux accents` (compare Flux candidate, default includes VAPI output if configured)
- `bun run bench:vs deepgram-nova accents`

Current benchmark guidance:

- use `deepgram-flux` as the primary conversational STT path
- prefer route-level `phraseHints` plus `correctTurn` over cross-vendor fallback for domain-specific accuracy
- use fallback vendors only when your own traffic proves they beat the package-level correction path
- do not treat `openai` as the default STT path unless your own benchmarks prove it for your traffic

If you use a VAPI baseline file, you can run a direct model comparison:

```bash
bun run bench:vs:deepgram-flux
```

To benchmark Nova vs Flux back-to-back, set the model explicitly:

```bash
DEEPGRAM_MODEL=flux-general-en bun run bench:deepgram:accents
DEEPGRAM_MODEL=nova-3 bun run bench:deepgram:accents
```

To stress the STT path with synthesized narrowband phone audio:

```bash
bun run bench:telephony
bun run bench:telephony:run
bun run bench:deepgram:telephony
bun run bench:deepgram:corrected:telephony
bun run bench:jargon
bun run bench:deepgram:jargon
bun run bench:deepgram:corrected:audit:jargon
bun run bench:multi-speaker:run
bun run bench:multi-speaker:analyze
bun run bench:deepgram:multi-speaker
```

To compare against Vapi or other providers, provide a baseline JSON file:

```bash
bun run bench:vs all accents --compare /path/to/vapi-baseline.json
```

Expected benchmark payload:

```json
{
  "source": "vapi",
  "results": [
    {
      "adapterId": "vapi-baseline",
      "summary": {
        "passRate": 0.0,
        "averageWordErrorRate": 1.0,
        "averageTermRecall": 0.0,
        "averageElapsedMs": 0,
        "averageTimeToEndOfTurnMs": 0,
        "averageTimeToFirstFinalMs": 0,
        "averageTimeToFirstPartialMs": 0,
        "wordAccuracyRate": 0.0
      }
    }
  ]
}
```

For a fast parse-only validation of arguments:

```bash
bun run ./scripts/benchmark-vs.ts --dry-run
```

The harness prints:

- pass rate and recall deltas per adapter
- weighted scorecard (`passRate`, term recall, word accuracy)
- optional competitor deltas (Vapi)
- a markdown report beside the JSON output, for example:
  - `benchmark-results/vs-all-telephony.json`
  - `benchmark-results/vs-all-telephony.md`

For package-level multi-turn behavior, use the session benchmark harness instead of raw STT-only benchmarking:

```bash
bun run bench:sessions
bun run bench:deepgram:sessions
bun run bench:deepgram:soak:sessions
bun run bench:deepgram:hybrid:sessions
bun run bench:deepgram:corrected:sessions
bun run bench:deepgram:corrected:soak:sessions
bun run bench:stt:routing:run
bun run bench:assemblyai:sessions
bun run bench:openai:sessions
bun run bench:soak:run
```

That harness runs the adapter through `VoiceSession` itself, so the output reflects reconnect handling, turn commit stability, and duplicate-turn protection rather than only raw transcript quality.

`bench:soak:run` is the STT-5 runner. It executes the long-session soak lane for raw Deepgram Flux, corrected Deepgram, and the reconnect resilience suite in parallel, then writes fresh JSON into `benchmark-results/` without the runs deleting each other.

`bench:stt:routing:run` is the STT-7 runner. It benchmarks the package’s current `best` vs `low-cost` session strategies in parallel, clears stale outputs first, and writes a manifest so the cost-aware summaries are guaranteed fresh.

`bench:deepgram:corrected:sessions` exercises the current recommended package-level production path:

- Deepgram Flux as primary STT
- phrase hints routed through the adapter layer
- committed-turn correction via `createPhraseHintCorrectionHandler()`
- core turn dedupe, reconnect, and transcript selection still owned by `@absolutejs/voice`

## Adapter Contract

Adapters normalize vendor behavior into a core event model so the plugin never branches on vendor names.

### STT adapter

```ts
type STTAdapter = {
	kind: 'stt';
	open: (
		options: STTAdapterOpenOptions
	) => Promise<STTAdapterSession> | STTAdapterSession;
};

type STTAdapterSession = {
	on: <K extends keyof STTSessionEventMap>(
		event: K,
		handler: (payload: STTSessionEventMap[K]) => void | Promise<void>
	) => () => void;
	send: (audio: AudioChunk) => Promise<void>;
	close: (reason?: string) => Promise<void>;
};
```

Normalized events:

- `partial`: interim transcript updates
- `final`: finalized transcript segments
- `endOfTurn`: vendor-native turn completion when available
- `error`: recoverable or fatal adapter failures
- `close`: adapter transport shutdown

Requirements for third-party adapters:

- accept `16kHz` mono `pcm_s16le` from core without mutating the contract
- map vendor transcript payloads into `Transcript`
- emit `endOfTurn` only when the vendor actually provides a native signal
- never leak vendor-specific types through the core surface

## Session Storage Contract

Voice uses the same bring-your-own-session pattern as AI, now via the shared generic `SessionStore` contract.

```ts
type SessionStore<TSession, TSummary> = {
	get: (id: string) => Promise<TSession | undefined>;
	getOrCreate: (id: string) => Promise<TSession>;
	set: (id: string, value: TSession) => Promise<void>;
	list: () => Promise<TSummary[]>;
	remove: (id: string) => Promise<void>;
};
```

Voice specializes it as:

```ts
type VoiceSessionStore = SessionStore<
	VoiceSessionRecord,
	VoiceSessionSummary
>;
```

A storage implementation must:

- persist the whole `VoiceSessionRecord`
- make `getOrCreate()` safe across multiple app instances
- keep `set()` atomic enough that reconnects do not re-fire committed turns
- return `list()` summaries without loading full transcripts when possible

For Redis or Postgres stores, the usual pattern is:

1. `get(sessionId)` before opening a socket
2. `getOrCreate(sessionId)` on first contact
3. mutate the record in memory for a single turn transition
4. `set(sessionId, updatedRecord)` immediately after each state change

## Reconnect Behavior

Default reconnect strategy is `resume-last-turn`.

- `resume-last-turn`: reload the persisted transcript buffer and continue from the last uncommitted turn
- `restart`: discard the persisted voice turn state and start fresh on reconnect exhaustion
- `fail`: mark the session failed when reconnect policy is exhausted

If an adapter does not emit native end-of-turn events, core falls back to silence detection with a default `700ms` threshold.

## STT Fallback

You can pair a primary vendor with an optional fallback vendor per route when you need extra reliability for accents, edge environments, or short commands.

```ts
voice({
	path: '/voice/intake',
	preset: 'default',
	session: createVoiceMemoryStore(),
	stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY!, model: 'nova-3' }),
	sttFallback: {
		adapter: assemblyai({ apiKey: process.env.ASSEMBLYAI_API_KEY! }),
		trigger: 'empty-or-low-confidence',
		confidenceThreshold: 0.65,
		minTextLength: 2,
		replayWindowMs: 8000,
		settleMs: 220,
		maxAttemptsPerTurn: 1
	},
	onTurn: async ({ turn }) => {
		return { assistantText: `Captured: ${turn.text}` };
	},
	onComplete: async () => {}
});
```

Fallback triggers are evaluated at commit time:

- `empty-turn`: commit is empty (`< minTextLength` words), then fallback is attempted
- `low-confidence`: average transcript confidence is below `confidenceThreshold`
- `empty-or-low-confidence`: both conditions

The fallback adapter receives the same window of turn audio as the primary (default `8s`, configurable with `replayWindowMs`) and can only run `maxAttemptsPerTurn` times per turn.

## Benchmark Fixture Sources

Bundled fixtures cover the current in-repo English benchmark suite. For multilingual and code-switch evaluation, add external fixture directories and let the benchmark scripts merge them automatically.

The public corpus builder currently assembles:

- FLEURS multilingual dev clips
- BSC Catalan-Spanish code-switch evaluation clips
- CoSHE Hindi-English code-switch evaluation clips

Set either:

- `VOICE_FIXTURE_DIR=/abs/path/to/fixtures`
- `VOICE_FIXTURE_DIRS=/abs/path/one,/abs/path/two`

Each fixture directory must include:

- `manifest.json`
- `pcm/*.pcm`

Each manifest entry can include:

- `language`
- `tags`
  Use `multilingual`, `bilingual`, or `code-switch` to route fixtures into the multilingual benchmark lane.

Benchmark commands:

```bash
bun run bench:multilingual
bun run bench:code-switch
bun run bench:code-switch:series
bun run bench:code-switch:ca-es
bun run bench:code-switch:ca-es:series
bun run bench:code-switch:ca-es:corts:series
bun run bench:code-switch:ca-es:parlament:series
bun run bench:code-switch:hi-en
bun run bench:code-switch:hi-en:series
bun run bench:deepgram:multilingual
bun run bench:deepgram:code-switch
bun run bench:deepgram:code-switch:series
bun run bench:deepgram:code-switch:ca-es
bun run bench:deepgram:code-switch:ca-es:series
bun run bench:deepgram:code-switch:ca-es:corts:series
bun run bench:deepgram:code-switch:ca-es:parlament:series
bun run bench:deepgram:code-switch:ca-es:nova3-multi:series
bun run bench:deepgram:code-switch:ca-es:nova3-ca:series
bun run bench:deepgram:code-switch:ca-es:nova3-es:series
bun run bench:deepgram:code-switch:ca-es:nova2-ca:series
bun run bench:deepgram:code-switch:ca-es:nova2-es:series
bun run bench:deepgram:code-switch:ca-es:best:corrected:series
bun run bench:deepgram:code-switch:ca-es:parlament:debug
bun run bench:deepgram:code-switch:corrected:ca-es
bun run bench:deepgram:code-switch:corrected:ca-es:series
bun run bench:deepgram:code-switch:corrected:ca-es:corts:series
bun run bench:deepgram:code-switch:corrected:ca-es:parlament:series
bun run bench:deepgram:code-switch:hi-en
bun run bench:deepgram:code-switch:hi-en:series
bun run bench:deepgram:code-switch:corrected:hi-en
bun run bench:deepgram:code-switch:corrected:hi-en:series
bun run bench:deepgram:code-switch:corrected
bun run bench:deepgram:code-switch:corrected:series
bun run bench:assemblyai:multilingual
bun run bench:assemblyai:code-switch
bun run bench:openai:multilingual
bun run bench:openai:code-switch
bun run bench:openai:code-switch:series
bun run bench:openai:code-switch:ca-es
bun run bench:openai:code-switch:ca-es:series
bun run bench:openai:code-switch:corrected:ca-es
bun run bench:openai:code-switch:corrected:ca-es:series
bun run bench:openai:code-switch:hi-en
bun run bench:openai:code-switch:hi-en:series
bun run bench:openai:code-switch:corrected:hi-en
bun run bench:openai:code-switch:corrected:hi-en:series
bun run bench:openai:code-switch:corrected
bun run bench:openai:code-switch:corrected:series
```

Current benchmark direction:

- `openai` is the strongest adapter on the current public multilingual corpus
- `deepgram` remains the strongest browser-English path
- raw code-switch remains a weaker surface for every adapter and should be benchmarked separately with `bench:code-switch`
- jargon-heavy/domain-heavy English terms now have their own profile; use `bench:jargon` for the cross-adapter read and `bench:deepgram:corrected:audit:jargon` to compare `raw` vs `generic` vs `experimental` vs `benchmarkSeeded`
- code-switch should be treated as language-pair-specific, not one universal lane; `ca-es` and `hi-en` now have dedicated series commands
- `ca-es` also has a dedicated Deepgram model/language shootout lane so you can compare `nova-3`/`nova-2` with `multi`, `ca`, and `es` routing without overwriting results
- current best `ca-es` base path is `deepgram` `nova-3` with `language=ca`; the short runner script uses that path for corrected series
- `ca-es` is also split by source now: `corts_valencianes` and `parlament_parla` can be benchmarked independently, and `parlament_parla` has a dedicated transcript dump script
- corrected code-switch runs now have dedicated lexicon-driven series commands so raw and corrected stability can be compared directly
- multi-speaker diarization is now its own benchmark surface; use `bench:multi-speaker:run` for the parallel cross-adapter plus Deepgram-specific read
- when tuning diarization specifically, use `bench:multi-speaker:analyze` to split Deepgram into clean vs noisy handoff lanes, include a corrected noisy read, and emit a speaker-pattern debug dump
- use the `:series` commands when you need stability rather than a single-pass snapshot

## Client Primitives

Browser and framework helpers sit on top of the same connection core:

- `createVoiceStream()` in `@absolutejs/voice/client`
- `useVoiceStream()` in `@absolutejs/voice/react`
- `useVoiceStream()` in `@absolutejs/voice/vue`
- `createVoiceStream()` in `@absolutejs/voice/svelte`
- `VoiceStreamService` in `@absolutejs/voice/angular`

For plain HTML or HTMX flows, use `@absolutejs/voice/client` directly.
