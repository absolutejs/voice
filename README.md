# `@absolutejs/voice`

`@absolutejs/voice` is the self-hosted voice operations layer for AbsoluteJS.

It gives your app the primitives hosted voice platforms usually keep behind their dashboards: browser voice sessions, phone-call routes, provider routing, assistant tools, handoffs, traces, evals, production-readiness checks, latency proof, storage adapters, and framework-native UI helpers.

Use it when you want Vapi/Retell/Bland-style voice-agent capability, but you want the orchestration, data, traces, storage, and UI to live inside the AbsoluteJS server you already operate.

## Why AbsoluteJS Voice

- Self-hosted by default: your app owns sessions, traces, reviews, tasks, handoffs, retention, and provider keys.
- Provider-neutral: use Deepgram, AssemblyAI, OpenAI, Anthropic, Gemini, ElevenLabs-style TTS, or your own adapters without rewriting app workflow code.
- Browser and phone surfaces: mount browser WebSocket voice routes plus Twilio, Telnyx, and Plivo telephony routes from the same package.
- Production proof: ops status, ops recovery, production readiness, operations records, turn quality, turn latency, live browser p50/p95 latency, trace timelines, evals, fixtures, and contracts are package primitives.
- Framework parity: React, Vue, Svelte, Angular, HTML, HTMX, and plain client entrypoints share the same core behavior.
- No hosted platform tax: AbsoluteJS Voice does not add a mandatory per-minute orchestration fee between your app and your providers.

## Start Here

Pick the path that matches what you are building:

- Browser voice agent: mount `voice(...)`, choose an STT adapter, and use the React/Vue/Svelte/Angular/HTML/HTMX client helpers for mic, transcript, reconnect, and status UI.
- Phone voice agent: mount Twilio, Telnyx, or Plivo routes, normalize carrier outcomes, inspect carrier readiness, and persist call lifecycle traces.
- Outbound campaigns: create self-hosted campaign queues, import CSV/JSON recipients, enforce rate limits/quiet hours/retry backoff, dry-run carrier dialers, and fail production readiness when campaign proof regresses.
- Production readiness: mount the status and proof primitives you need, such as `createVoiceOpsStatusRoutes(...)`, `createVoiceProductionReadinessRoutes(...)`, quality routes, trace routes, eval routes, and smoke contracts.
- Support/debug entrypoint: mount `createVoiceOperationsRecordRoutes(...)` so every problematic session has one call-log object linking traces, replay, provider events, tools, handoffs, audit, reviews, tasks, and delivery attempts.
- Provider routing and fallback: use LLM/STT/TTS provider routers, provider health, provider simulation controls, and cost/latency-aware routing policies.
- Evals and simulation: mount `createVoiceSimulationSuiteRoutes(...)` to run scenario fixtures, workflow contracts, tool contracts, outcome contracts, baseline comparisons, and saved benchmark artifacts before live traffic.

## Buyer Paths

These are the primitive-first paths a Vapi-style buyer usually needs. Each path stays inside your AbsoluteJS app; the package gives you route handlers, stores, reports, hooks, composables, services, widgets, and contracts instead of a hosted dashboard.

| If you need | Start with | Add proof with | UI entrypoints |
| --- | --- | --- | --- |
| Web voice assistant | `voice(...)` or `createVoiceAssistant(...)` | trace timeline, turn quality, live latency, reconnect contract, operations record | React/Vue/Svelte/Angular voice stream helpers, HTML/HTMX/client helpers |
| Phone voice assistant | `createVoicePhoneAgent(...)` | carrier matrix, setup instructions, phone smoke contract, production readiness, operations record | phone setup HTML/JSON, smoke HTML/JSON, framework status UI |
| Multi-specialist support flow | `createVoiceAgentSquad(...)` | squad contract, handoff traces, context traces, operations record | Agent Squad status hooks/composables/services/widgets |
| Business actions and tools | `createVoiceAgentTool(...)` plus agent tool runtime | tool contracts, audit events, integration events, outcome contracts | operations record, action center, contract routes |
| Guardrails and policy checks | `createVoiceGuardrailPolicy(...)`, `createVoiceGuardrailRuntime(...)`, and `createVoiceGuardrailRoutes(...)` | live assistant/tool enforcement, blocking/warning decisions, redacted content, `assistant.guardrail` trace events | guardrail JSON/Markdown routes and operations record traces |
| Provider routing and fallback | provider routers, health checks, simulation controls | provider contract matrix, provider-stage traces, latency SLO reports | provider contract hooks/composables/services/widgets |
| Production operations | ops status, ops recovery, production readiness, delivery runtime | readiness gates, recovery report, incident Markdown, delivery queues | ops action center, delivery runtime UI, operations record |
| Outbound campaigns | `createVoiceCampaignRoutes(...)` | recipient validation, consent/dedupe, carrier dry-run, campaign readiness | campaign routes and operations-record-linked attempt proof |
| Simulation before launch | `createVoiceSimulationSuiteRoutes(...)` | scenarios, evals, tool contracts, outcome contracts, baselines | simulation-suite HTML/JSON and linked operations records |
| Compliance controls | runtime storage, audit logger, data-control routes | retention dry-run, redacted audit export, zero-retention policy, deploy gate | data-control HTML/JSON and audit/export routes |

## Capability Matrix

| Surface | Core package | Example/demo role | Not our lane |
| --- | --- | --- | --- |
| Browser voice | WebSocket voice route, client stream/controller/store primitives, reconnect, barge-in, latency, framework helpers | Prove the same mic/transcript/status workflow across React, Vue, Svelte, Angular, HTML, and HTMX | Hosted iframe widget that owns app UX |
| Telephony | Twilio, Telnyx, Plivo route bridges, phone-agent wrapper, setup instructions, smoke contracts, carrier outcomes | Show setup/smoke/proof surfaces and call lifecycle debugging | Buying/provisioning phone numbers for the user |
| Agents and tools | assistant, agent, tools, squads, handoff/context policies, contracts, audit hooks | Demonstrate realistic support/sales/workflow flows | Dashboard-only visual bot builder |
| Provider layer | OpenAI/Anthropic/Gemini model paths, STT/TTS adapter seams, routing, fallback, health, simulation | Show provider switching and health in UI | Reselling provider minutes or hiding provider accounts |
| Observability | traces, timelines, replay, operations records, incident Markdown, ops recovery, readiness | Make every failing proof link to a call/session record | Vendor dashboard as source of truth |
| Evals and simulation | fixtures, eval routes, simulation suite, workflow/tool/outcome contracts, baselines | Prove flows before live traffic | Opaque hosted test runner |
| Data and compliance controls | file/SQLite/Postgres/S3 storage paths, redaction, retention, audit exports, guarded deletion | Show customer-owned storage and export proof | Legal certification or compliance attestation |

## Proof Pack

Use this checklist when a buyer asks, "How do I know this replaces a hosted voice dashboard?" Each artifact is a route, report, contract, or export the app owns. The point is not screenshots; the point is reproducible proof that can live in CI, an internal admin page, or a customer-facing demo.

| Buyer question | Proof artifact | What it proves |
| --- | --- | --- |
| Can I launch a browser voice agent quickly? | `/voice`, framework mic/transcript UI, `/traces`, `/production-readiness` | Browser voice route, live transcript, trace persistence, readiness gate |
| Can I run phone agents without hosted orchestration? | `/voice/phone/setup`, `/voice/phone/smoke-contract`, carrier matrix JSON | Carrier setup instructions, webhook/stream URLs, smoke proof, lifecycle traces |
| Can I debug a bad call like a hosted call log? | `/voice-operations/:sessionId`, `/voice-operations/:sessionId/incident.md` | Transcript, trace timeline, provider decisions, tools, handoffs, reviews, tasks, audit, deliveries |
| Can I test before production traffic? | `/voice/simulations`, tool contracts, outcome contracts, workflow contracts | Scenario/eval proof, tool idempotency/retry proof, business outcome proof |
| Can I prove provider fallback and latency? | provider contract matrix, provider status UI, `/turn-latency`, `/live-latency` | Provider choice, fallback behavior, server turn timing, browser p50/p95 timing |
| Can operators intervene safely? | live-ops routes, action center, ops action audit routes, operations record | Pause/resume/takeover, injected instructions, operator action audit trail |
| Can I run outbound campaigns? | `/voice/campaigns`, `/voice/campaigns/observability`, `/api/voice/campaigns/readiness-proof` | Recipient import evidence, consent/dedupe checks, scheduling policy, worker-safe attempts |
| Can I handle post-call workflow? | `createVoicePostCallAnalysisRoutes(...)`, reviews, tasks, integration events, outcome contracts, operations record | Extracted-field proof, task creation, webhook/sink delivery, matched session proof |
| Can I keep data in my infrastructure? | `/data-control`, `/data-control/audit.md`, retention dry-run/apply routes | Customer-owned storage, redaction, audit export, guarded deletion, zero-retention planning |
| Can I prove release readiness? | `/production-readiness`, `/ops-recovery`, delivery runtime, readiness profiles | Deploy gates for session health, audits, delivery queues, provider/campaign/phone proof |

For a demo, the fastest convincing path is:

1. Start a browser or phone session.
2. Open `/voice-operations/:sessionId` for the session.
3. Open `/production-readiness` and follow any linked proof surface.
4. Open `/voice/simulations` or the relevant tool/outcome contract route.
5. Open `/data-control` to show where retention, redaction, and audit export live.

If those five surfaces are green and linked, the buyer can see the core difference from Vapi-style hosted orchestration: the operational proof lives inside the app, not in a vendor dashboard.

## Post-Call Analysis Proof

Use `createVoicePostCallAnalysisRoutes(...)` when the hosted-platform feature you need is call analysis plus follow-up proof. It validates that required extracted fields exist, expected ops tasks were created, integration/webhook events delivered, and the report links back to `/voice-operations/:sessionId`.

```ts
import { createVoicePostCallAnalysisRoutes } from '@absolutejs/voice';

app.use(
	createVoicePostCallAnalysisRoutes({
		path: '/api/voice/post-call-analysis',
		operationRecordBasePath: '/voice-operations/:sessionId',
		reviews: runtime.reviews,
		tasks: runtime.tasks,
		integrationEvents: runtime.events,
		source: ({ reviewId, sessionId }) => ({
			reviewId,
			sessionId,
			// Use your own extractor output here, for example fields persisted from an LLM/tool result.
			extractedFields: loadExtractedPostCallFields(reviewId ?? sessionId)
		}),
		fields: [
			{ path: 'review.postCall.target', label: 'customer target' },
			{ path: 'customerId' },
			{ path: 'category' }
		],
		requiredTaskKinds: ['support-triage'],
		requireDeliveredIntegrationEvent: true
	})
);
```

## Guardrails

Use `createVoiceGuardrailRuntime(...)` when you need code-owned live enforcement for what an agent may say, what tool payloads may contain, or which transcript content should warn/redact before downstream workflow. Use `createVoiceGuardrailRoutes(...)` beside it when you also want JSON/Markdown proof. The primitive does not force a moderation vendor or hosted dashboard; it emits `assistant.guardrail` trace events from the runtime and route surfaces.

```ts
import {
	createVoiceGuardrailRuntime,
	createVoiceGuardrailRoutes,
	voiceGuardrailPolicyPresets
} from '@absolutejs/voice';

const guardrails = createVoiceGuardrailRuntime({
	blockResult: ({ decision }) => ({
		assistantText: 'I need to route this to a human specialist.',
		escalate: {
			reason: `guardrail-blocked-${decision.stage}`
		}
	}),
	policies: [voiceGuardrailPolicyPresets.supportSafeDefaults],
	trace: runtime.traces
});

const assistant = createVoiceAssistant({
	guardrails: guardrails.assistantGuardrails,
	id: 'support',
	model,
	tools: guardrails.wrapTools([lookupCustomerTool, createTicketTool])
});

app.use(
	createVoiceGuardrailRoutes({
		path: '/api/voice/guardrails',
		policies: [voiceGuardrailPolicyPresets.supportSafeDefaults],
		trace: runtime.traces
	})
);
```

## Use-Case Recipe: Support Triage

Use this path when you want a Vapi-style support assistant that can answer web or phone calls, look up customer context, route billing issues to a specialist, create follow-up work, and leave one debuggable call record. It is a recipe over primitives, not a support app kit.

The production shape is:

1. Persist sessions, traces, reviews, tasks, integration events, and audit events in app-owned runtime storage.
2. Define server-side tools with idempotency and contract proof.
3. Compose support and billing specialists with `createVoiceAgentSquad(...)`.
4. Mount a browser route with `voice(...)` and optionally a phone route with `createVoicePhoneAgent(...)`.
5. Add outcome, readiness, simulation, audit, and operations-record routes so every failed proof links back to the call.

```ts
import { Elysia } from 'elysia';
import {
	createVoiceAgent,
	createVoiceAgentSquad,
	createVoiceAgentTool,
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceSimulationSuiteRoutes,
	createVoiceToolContractRoutes,
	createVoiceToolRuntimeContractDefaults,
	resolveVoiceOutcomeRecipe,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support-triage'
});

const lookupCustomer = createVoiceAgentTool({
	name: 'lookup_customer',
	description: 'Look up a customer and their open support state.',
	parameters: {
		type: 'object',
		properties: {
			customerId: { type: 'string' }
		},
		required: ['customerId']
	},
	execute: async ({ args }) => ({
		customerId: args.customerId,
		plan: 'business',
		openTickets: 1,
		status: 'active'
	})
});

const support = createVoiceAgent({
	id: 'support',
	system: 'Triage the caller, use tools for account context, and hand billing questions to billing.',
	tools: [lookupCustomer],
	trace: runtime.traces,
	model: {
		async generate({ messages, tools }) {
			const latest = messages.at(-1)?.content.toLowerCase() ?? '';
			if (latest.includes('billing')) {
				return {
					assistantText: 'I am routing you to billing with the context so far.',
					handoff: { reason: 'billing-request', targetAgentId: 'billing' }
				};
			}

			return {
				assistantText: `I can help with that. I can also use ${tools.map((tool) => tool.name).join(', ')} when I need account context.`
			};
		}
	}
});

const billing = createVoiceAgent({
	id: 'billing',
	system: 'Handle billing questions and escalate refund or cancellation risk.',
	trace: runtime.traces,
	model: {
		async generate() {
			return {
				assistantText: 'I can help with billing. I have the handoff context from support.'
			};
		}
	}
});

const supportDesk = createVoiceAgentSquad({
	id: 'support-desk',
	defaultAgentId: 'support',
	agents: [support, billing],
	trace: runtime.traces,
	handoffPolicy: ({ handoff }) =>
		handoff.targetAgentId === 'billing'
			? {
					summary: 'Billing specialist receives the support summary and current caller intent.',
					metadata: { queue: 'billing' }
				}
			: {
					allow: false,
					reason: 'Only billing handoffs are approved in this recipe.',
					escalate: { reason: 'unsupported-specialist' }
				}
});

const toolContractDefinitions = [
	{
		id: 'lookup-customer-contract',
		label: 'Lookup customer returns support state',
		tool: lookupCustomer,
		cases: [
			{
				id: 'active-business-customer',
				args: { customerId: 'cus_123' },
				expect: {
					expectedResult: {
						customerId: 'cus_123',
						openTickets: 1,
						plan: 'business',
						status: 'active'
					},
					expectStatus: 'ok'
				}
			}
		],
		defaultRuntime: createVoiceToolRuntimeContractDefaults()
	}
];

const app = new Elysia()
	.use(
		voice({
			path: '/voice/support',
			preset: 'reliability',
			session: runtime.session,
			stt: deepgram({
				apiKey: process.env.DEEPGRAM_API_KEY!,
				model: 'flux-general-en'
			}),
			trace: runtime.traces,
			onTurn: supportDesk.onTurn,
			onComplete: async () => {},
			ops: {
				...resolveVoiceOutcomeRecipe('support-triage', {
					assignee: 'support-oncall',
					queue: 'support-triage'
				}),
				events: runtime.events,
				reviews: runtime.reviews,
				tasks: runtime.tasks
			}
		})
	)
	.use(
		createVoiceToolContractRoutes({
			contracts: toolContractDefinitions,
			htmlPath: '/voice/support/tool-contracts',
			path: '/api/voice/support/tool-contracts'
		})
	)
	.use(
		createVoiceSimulationSuiteRoutes({
			htmlPath: '/voice/support/simulations',
			path: '/api/voice/support/simulations',
			tools: toolContractDefinitions,
			operationsRecordHref: '/voice-operations/:sessionId'
		})
	)
	.use(
		createVoiceOperationsRecordRoutes({
			htmlPath: '/voice-operations/:sessionId',
			path: '/api/voice-operations/:sessionId',
			store: runtime.traces,
			reviews: runtime.reviews,
			tasks: runtime.tasks,
			integrationEvents: runtime.events
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			htmlPath: '/production-readiness',
			path: '/api/production-readiness',
			store: runtime.traces,
			links: {
				operationsRecords: '/voice-operations/:sessionId',
				simulations: '/voice/support/simulations'
			}
		})
	);
```

The demo UI should show a mic button, transcript, current specialist badge, readiness link, simulation link, and operations-record link. Use the framework helpers for that surface instead of embedding a dashboard: `VoiceAgentSquadStatus` in React, `useVoiceAgentSquadStatus(...)` in Vue, `createVoiceAgentSquadStatus(...)` in Svelte, `VoiceAgentSquadStatusService` in Angular, or `<absolute-voice-agent-squad-status>` for HTML/HTMX.

This recipe covers the hosted-platform expectations that matter for support triage: assistant entrypoint, business tools, specialist handoff, post-call task creation, simulation proof, tool contract proof, production readiness, audit-compatible runtime storage, and a call-log replacement at `/voice-operations/:sessionId`.

## Use-Case Recipe: Appointment Scheduling

Use this path when the assistant needs to check availability, book a slot, create a confirmation task, and prove the post-call workflow before production traffic. This is the self-hosted version of a hosted scheduling agent: your app owns the calendar tool, booking policy, storage, follow-up tasks, and call evidence.

The production shape is:

1. Persist sessions, traces, reviews, tasks, integration events, and audit events in app-owned runtime storage.
2. Define `check_availability` and `book_appointment` as server-side tools with deterministic tool contracts.
3. Use `resolveVoiceOutcomeRecipe('appointment-booking')` so completed calls create appointment-confirmation work.
4. Add an outcome contract that requires a completed session, review, task, and integration events.
5. Mount simulation, outcome-contract, readiness, and operations-record routes so scheduling regressions fail before live calls.

```ts
import { Elysia } from 'elysia';
import {
	createVoiceAgent,
	createVoiceAgentTool,
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoiceOutcomeContractRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceSimulationSuiteRoutes,
	createVoiceToolContractRoutes,
	createVoiceToolRuntimeContractDefaults,
	resolveVoiceOutcomeRecipe,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/appointments'
});

const checkAvailability = createVoiceAgentTool({
	name: 'check_availability',
	description: 'Return open appointment slots for a service and date.',
	parameters: {
		type: 'object',
		properties: {
			date: { type: 'string' },
			service: { type: 'string' }
		},
		required: ['date', 'service']
	},
	execute: async ({ args }) => ({
		date: args.date,
		service: args.service,
		slots: ['2026-05-04T15:00:00-04:00', '2026-05-04T16:30:00-04:00']
	})
});

const bookAppointment = createVoiceAgentTool({
	name: 'book_appointment',
	description: 'Book a confirmed appointment slot.',
	parameters: {
		type: 'object',
		properties: {
			customerName: { type: 'string' },
			phone: { type: 'string' },
			service: { type: 'string' },
			startsAt: { type: 'string' }
		},
		required: ['customerName', 'phone', 'service', 'startsAt']
	},
	execute: async ({ args }) => ({
		appointmentId: `appt_${args.startsAt}`,
		customerName: args.customerName,
		phone: args.phone,
		service: args.service,
		startsAt: args.startsAt,
		status: 'confirmed'
	})
});

const scheduler = createVoiceAgent({
	id: 'scheduler',
	system: 'Collect caller details, check availability, book an appointment, and summarize the confirmation.',
	tools: [checkAvailability, bookAppointment],
	trace: runtime.traces,
	model: {
		async generate({ tools }) {
			return {
				assistantText: `I can check times and book the appointment. Available tools: ${tools.map((tool) => tool.name).join(', ')}`
			};
		}
	}
});

const toolContractDefinitions = [
	{
		id: 'check-availability-contract',
		label: 'Availability returns bookable slots',
		tool: checkAvailability,
		cases: [
			{
				id: 'consultation-slots',
				args: { date: '2026-05-04', service: 'consultation' },
				expect: { expectStatus: 'ok' }
			}
		],
		defaultRuntime: createVoiceToolRuntimeContractDefaults()
	},
	{
		id: 'book-appointment-contract',
		label: 'Booking returns a confirmed appointment',
		tool: bookAppointment,
		cases: [
			{
				id: 'confirmed-consultation',
				args: {
					customerName: 'Ada Lovelace',
					phone: '+15551234567',
					service: 'consultation',
					startsAt: '2026-05-04T15:00:00-04:00'
				},
				expect: {
					expectedResult: {
						appointmentId: 'appt_2026-05-04T15:00:00-04:00',
						customerName: 'Ada Lovelace',
						phone: '+15551234567',
						service: 'consultation',
						startsAt: '2026-05-04T15:00:00-04:00',
						status: 'confirmed'
					},
					expectStatus: 'ok'
				}
			}
		],
		defaultRuntime: createVoiceToolRuntimeContractDefaults()
	}
];

const outcomeContractDefinitions = [
	{
		id: 'appointment-booked',
		label: 'Completed appointment call produces follow-up work',
		expectedDisposition: 'completed',
		minSessions: 1,
		minTasks: 1,
		requireIntegrationEvents: ['call.completed', 'review.saved', 'task.created'],
		requireReview: true,
		requireTask: true
	}
];

const app = new Elysia()
	.use(
		voice({
			path: '/voice/appointments',
			preset: 'reliability',
			session: runtime.session,
			stt: deepgram({
				apiKey: process.env.DEEPGRAM_API_KEY!,
				model: 'flux-general-en'
			}),
			trace: runtime.traces,
			onTurn: scheduler.onTurn,
			onComplete: async () => {},
			ops: {
				...resolveVoiceOutcomeRecipe('appointment-booking', {
					assignee: 'scheduling-oncall',
					queue: 'appointments'
				}),
				events: runtime.events,
				reviews: runtime.reviews,
				tasks: runtime.tasks
			}
		})
	)
	.use(
		createVoiceToolContractRoutes({
			contracts: toolContractDefinitions,
			htmlPath: '/voice/appointments/tool-contracts',
			path: '/api/voice/appointments/tool-contracts'
		})
	)
	.use(
		createVoiceOutcomeContractRoutes({
			contracts: outcomeContractDefinitions,
			events: runtime.events,
			htmlPath: '/voice/appointments/outcome-contracts',
			operationsRecordHref: '/voice-operations/:sessionId',
			path: '/api/voice/appointments/outcome-contracts',
			reviews: runtime.reviews,
			sessions: runtime.session,
			tasks: runtime.tasks
		})
	)
	.use(
		createVoiceSimulationSuiteRoutes({
			htmlPath: '/voice/appointments/simulations',
			operationsRecordHref: '/voice-operations/:sessionId',
			outcomes: {
				contracts: outcomeContractDefinitions,
				events: runtime.events,
				reviews: runtime.reviews,
				sessions: runtime.session,
				tasks: runtime.tasks
			},
			path: '/api/voice/appointments/simulations',
			tools: toolContractDefinitions
		})
	)
	.use(
		createVoiceOperationsRecordRoutes({
			htmlPath: '/voice-operations/:sessionId',
			integrationEvents: runtime.events,
			path: '/api/voice-operations/:sessionId',
			reviews: runtime.reviews,
			store: runtime.traces,
			tasks: runtime.tasks
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			htmlPath: '/production-readiness',
			links: {
				operationsRecords: '/voice-operations/:sessionId',
				simulations: '/voice/appointments/simulations'
			},
			path: '/api/production-readiness',
			store: runtime.traces
		})
	);
```

The UI should keep the scheduling flow simple: microphone, transcript, selected slot, booking status, confirmation task link, `/voice/appointments/simulations`, `/voice/appointments/outcome-contracts`, `/production-readiness`, and `/voice-operations/:sessionId`. If the booking or confirmation proof fails, the operator should start at the outcome contract and follow the linked operations record.

This recipe covers the hosted-platform expectations that matter for appointment scheduling: scheduling tools, deterministic tool proof, post-call confirmation work, outcome validation, simulation proof, production readiness, and one call-log replacement for debugging.

## Use-Case Recipe: Campaign Outreach

Use this path when you need Retell/Bland-style outbound outreach without handing recipients, consent proof, attempt policy, carrier outcomes, or debugging records to a hosted campaign dashboard. The package gives you campaign primitives; your app decides who can upload recipients, when workers run, which carrier dials, and how campaign results sync back to your product.

The production shape is:

1. Store campaigns in app-owned storage.
2. Import recipients with consent checks, phone validation, dedupe, variables, and rejected-row evidence.
3. Configure campaign policy for max attempts, concurrency, attempt windows, quiet hours, rate limits, and retry backoff.
4. Use a carrier dialer or your own dialer function, then apply Twilio/Telnyx/Plivo webhook outcomes back to attempts.
5. Expose campaign routes, observability, readiness proof, production readiness, and operations-record links for every attempted call.

```ts
import { Elysia } from 'elysia';
import {
	createVoiceCampaignRoutes,
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile,
	createVoiceSQLiteCampaignStore,
	runVoiceCampaignReadinessProof
} from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/campaign-outreach'
});

const campaigns = createVoiceSQLiteCampaignStore({
	path: '.voice-runtime/campaigns.sqlite'
});

const app = new Elysia()
	.use(
		createVoiceCampaignRoutes({
			htmlPath: '/voice/campaigns',
			operationsRecordHref: '/voice-operations/:sessionId',
			path: '/api/voice/campaigns',
			store: campaigns,
			title: 'Renewal Outreach'
		})
	)
	.use(
		createVoiceOperationsRecordRoutes({
			htmlPath: '/voice-operations/:sessionId',
			path: '/api/voice-operations/:sessionId',
			store: runtime.traces
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			...createVoiceReadinessProfile('phone-agent', {
				campaignReadiness: () =>
					runVoiceCampaignReadinessProof({
						store: campaigns
					}),
				explain: true
			}),
			links: {
				campaigns: '/voice/campaigns',
				operationsRecords: '/voice-operations/:sessionId'
			},
			store: runtime.traces
		})
	);

await fetch('/api/voice/campaigns', {
	body: JSON.stringify({
		maxAttempts: 3,
		maxConcurrentAttempts: 10,
		name: 'Renewal outreach',
		schedule: {
			attemptWindow: { startHour: 9, endHour: 17 },
			quietHours: { startHour: 12, endHour: 13 },
			rateLimit: { maxAttempts: 60, windowMs: 60_000 },
			retryPolicy: { backoffMs: [5 * 60_000, 30 * 60_000] }
		}
	}),
	headers: { 'content-type': 'application/json' },
	method: 'POST'
});

await fetch('/api/voice/campaigns/campaign-1/recipients/import', {
	body: JSON.stringify({
		csv: `id,name,phone,consent,segment
recipient-1,Ada,+15550001001,yes,trial
recipient-2,Grace,+15550001002,true,enterprise
recipient-3,Linus,not-a-phone,yes,partner
recipient-4,Barbara,+15550001004,no,trial`,
		metadataColumns: ['segment'],
		requireConsent: true,
		variableColumns: ['segment']
	}),
	headers: { 'content-type': 'application/json' },
	method: 'POST'
});

await fetch('/api/voice/campaigns/campaign-1/enqueue', {
	method: 'POST'
});
```

Use `/api/voice/campaigns/campaign-1/tick` for manual workers or `createVoiceCampaignWorkerLoop(...)` when the app should continuously drain eligible recipients. The runtime enforces the campaign policy on each tick, so parallel workers do not double-start recipients and attempts respect quiet hours, rate limits, retry backoff, and max attempts.

For production carrier dialing, pass a `dialer` to `createVoiceCampaignRoutes(...)`: `createVoiceTwilioCampaignDialer(...)`, `createVoiceTelnyxCampaignDialer(...)`, `createVoicePlivoCampaignDialer(...)`, or a custom dialer that starts the call and returns an external call id. Run `runVoiceCampaignDialerProof(...)` before live traffic to dry-run carrier request metadata and webhook outcome application.

The UI should show `/voice/campaigns`, `/voice/campaigns/observability`, `/api/voice/campaigns/readiness-proof`, `/production-readiness`, and operations-record links for recent attempts. If a recipient failed, the operator should open the campaign attempt, follow `/voice-operations/:sessionId`, and see the same trace/review/task/audit context used by support and phone-agent flows.

This recipe covers the hosted-platform expectations that matter for campaign outreach: recipient import evidence, consent/dedupe checks, scheduling policy, worker-safe attempts, carrier dry-run proof, webhook outcome mapping, queue observability, readiness gating, and call-log replacement links.

## Use-Case Recipe: Meeting Recorder

Use this path when the product needs a browser recorder for meetings, interviews, demos, or internal calls: capture microphone audio, persist transcripts and traces, generate a post-call review, expose a replayable operations record, and keep retention/export controls inside the app. This is not a hosted meeting bot; it is a set of recorder primitives your AbsoluteJS UI can own.

The production shape is:

1. Mount a browser voice route with persistent session, trace, review, task, and audit-capable storage.
2. Use framework stream/controller helpers for the microphone, transcript, reconnect state, and recording status.
3. Persist a review artifact on completion with transcript, summary, latency, outcome, and recommended follow-up.
4. Mount trace timelines, operations records, production readiness, and data-control routes.
5. Gate release with the `meeting-recorder` readiness profile so reconnect, barge-in/interruption, provider routing, latency, and session-health proof stay visible.

```ts
import { Elysia } from 'elysia';
import {
	createVoiceDataControlRoutes,
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile,
	createVoiceTraceTimelineRoutes,
	voice,
	voiceComplianceRedactionDefaults
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/meeting-recorder'
});

const app = new Elysia()
	.use(
		voice({
			path: '/voice/meeting-recorder',
			preset: 'reliability',
			session: runtime.session,
			stt: deepgram({
				apiKey: process.env.DEEPGRAM_API_KEY!,
				model: 'flux-general-en'
			}),
			trace: runtime.traces,
			async onTurn({ turn }) {
				return {
					assistantText: '',
					metadata: {
						recorder: true,
						transcript: turn.text
					}
				};
			},
			onComplete: async () => {},
			ops: {
				events: runtime.events,
				reviews: runtime.reviews,
				tasks: runtime.tasks,
				buildReview: ({ session }) => ({
					errors: [],
					latencyBreakdown: [],
					notes: ['Generated by the self-hosted meeting recorder path.'],
					postCall: {
						label: 'Meeting summary',
						recommendedAction: 'Review the transcript and share action items.',
						summary: 'Review transcript, decisions, and follow-up owners.'
					},
					summary: {
						outcome: 'completed',
						pass: true,
						turnCount: session.turns.length
					},
					title: `Meeting recorder review for ${session.id}`,
					timeline: [],
					transcript: {
						actual: session.turns
							.map((turn) => turn.text)
							.filter(Boolean)
							.join('\n')
					}
				})
			}
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
		createVoiceOperationsRecordRoutes({
			htmlPath: '/voice-operations/:sessionId',
			integrationEvents: runtime.events,
			path: '/api/voice-operations/:sessionId',
			reviews: runtime.reviews,
			store: runtime.traces,
			tasks: runtime.tasks
		})
	)
	.use(
		createVoiceDataControlRoutes({
			...runtime,
			audit: runtime.audit,
			auditDeliveries: runtime.auditDeliveries,
			redact: voiceComplianceRedactionDefaults,
			traceDeliveries: runtime.traceDeliveries
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			...createVoiceReadinessProfile('meeting-recorder', {
				explain: true
			}),
			links: {
				dataControl: '/data-control',
				operationsRecords: '/voice-operations/:sessionId',
				traces: '/traces'
			},
			store: runtime.traces
		})
	);
```

The UI should show a clear recording button, elapsed time, live transcript, reconnect state, recording status, a stop/finalize action, and links to `/voice-operations/:sessionId`, `/traces`, `/production-readiness`, and `/data-control`. Use `useVoiceStream(...)`, `useVoiceController(...)`, `createVoiceStream(...)`, `VoiceStreamService`, or the HTML/HTMX client helpers depending on the framework; the route and trace/review stores stay the same.

For customer-facing exports, use the same redaction/export primitives as support workflows: render trace Markdown or audit Markdown with `voiceComplianceRedactionDefaults`, then deliver it through file, webhook, or S3 delivery runtimes. For sensitive recordings, start with a retention dry run through `/data-control/retention/plan` before applying deletion.

This recipe covers the hosted-platform expectations that matter for meeting recorders: browser mic capture, live transcript UI, reconnect visibility, post-call review, transcript/debug record, readiness proof, customer-owned storage, retention controls, and redacted export paths.

## Use-Case Recipe: Compliance-Sensitive Calls

Use this path when the voice app handles sensitive customer support, healthcare-adjacent intake, financial workflows, internal investigations, or regulated customer data. AbsoluteJS Voice can provide self-hosted controls and evidence: customer-owned storage, provider-key ownership, redaction defaults, audit trails, guarded deletion, zero-retention policy helpers, redacted exports, and deploy gates. It does not certify the app for HIPAA, SOC 2, GDPR, or any other legal regime by itself.

The production shape is:

1. Use customer-owned runtime storage, preferably Postgres for production records and S3/webhook delivery for exported evidence.
2. Keep provider keys in the app owner environment, not in a hosted voice dashboard.
3. Pass `audit` into agents/tools/squads so provider calls, tool executions, handoffs, retention runs, and operator actions are recorded.
4. Mount data-control routes for redacted audit export, retention dry-runs, guarded deletion, zero-retention planning, and provider-key recommendations.
5. Make audit evidence, recent retention-policy evidence, and audit/trace delivery health part of production readiness.

```ts
import { Elysia } from 'elysia';
import {
	applyVoiceDataRetentionPolicy,
	buildVoiceDataRetentionPlan,
	createVoiceAuditLogger,
	createVoiceDataControlRoutes,
	createVoiceOperationsRecordRoutes,
	createVoicePostgresRuntimeStorage,
	createVoiceProductionReadinessRoutes,
	createVoiceZeroRetentionPolicy,
	exportVoiceAuditTrail,
	renderVoiceAuditMarkdown,
	voiceComplianceRedactionDefaults
} from '@absolutejs/voice';

const runtime = createVoicePostgresRuntimeStorage({
	connectionString: process.env.DATABASE_URL!,
	schemaName: 'voice_ops',
	tablePrefix: 'sensitive'
});

const audit = createVoiceAuditLogger(runtime.audit);

const app = new Elysia()
	.use(
		createVoiceDataControlRoutes({
			...runtime,
			audit: runtime.audit,
			auditDeliveries: runtime.auditDeliveries,
			path: '/data-control',
			redact: voiceComplianceRedactionDefaults,
			title: 'Sensitive Voice Data Control',
			traceDeliveries: runtime.traceDeliveries
		})
	)
	.use(
		createVoiceOperationsRecordRoutes({
			audit: runtime.audit,
			htmlPath: '/voice-operations/:sessionId',
			integrationEvents: runtime.events,
			path: '/api/voice-operations/:sessionId',
			reviews: runtime.reviews,
			store: runtime.traces,
			tasks: runtime.tasks
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			audit: {
				require: [
					{ type: 'provider.call' },
					{ type: 'operator.action' },
					{ type: 'retention.policy', maxAgeMs: 7 * 24 * 60 * 60 * 1000 }
				],
				store: runtime.audit
			},
			auditDeliveries: runtime.auditDeliveries,
			links: {
				audit: '/audit',
				auditDeliveries: '/audit/deliveries',
				dataControl: '/data-control',
				operationsRecords: '/voice-operations/:sessionId',
				traceDeliveries: '/traces/deliveries'
			},
			store: runtime.traces,
			traceDeliveries: runtime.traceDeliveries
		})
	);

await audit.operatorAction({
	action: 'retention.policy.reviewed',
	actor: { id: 'ops-admin', type: 'operator' },
	outcome: 'ok',
	resource: { id: 'zero-retention-policy', type: 'voice.retention' }
});

const zeroRetentionPolicy = createVoiceZeroRetentionPolicy({
	...runtime,
	audit: runtime.audit,
	auditDeliveries: runtime.auditDeliveries,
	traceDeliveries: runtime.traceDeliveries
});

const retentionPlan = await buildVoiceDataRetentionPlan(zeroRetentionPolicy);

if (retentionPlan.deletedCount > 0) {
	await applyVoiceDataRetentionPolicy({
		...zeroRetentionPolicy,
		dryRun: false
	});
}

const auditExport = await exportVoiceAuditTrail({
	redact: voiceComplianceRedactionDefaults,
	store: runtime.audit
});

const redactedAuditMarkdown = renderVoiceAuditMarkdown(auditExport.events, {
	title: 'Sensitive Voice Audit Export'
});
```

For the actual agent or squad, pass the same `audit` logger into `createVoiceAgent(...)`, `createVoiceAgentSquad(...)`, or `createVoiceAssistant(...)` with explicit `auditProvider` and `auditModel` labels. That makes provider usage and tool execution visible in `/data-control/audit.md`, `/audit`, readiness checks, and operations records.

The UI should expose `/data-control`, `/data-control.json`, `/data-control/audit.md`, `/data-control/retention/plan`, `/production-readiness`, and `/voice-operations/:sessionId`. Destructive retention application should remain a server-side operator action that first reviews the dry-run plan and then posts `confirm: "apply-retention-policy"`.

This recipe covers the hosted-platform expectations that matter for compliance-sensitive voice apps: customer-owned records, provider-key ownership, redacted exports, audit evidence, guarded retention, zero-retention planning, deploy gates, and a clear boundary that the package supplies controls and proof artifacts, not legal certification.

## How This Differs From Hosted Voice Platforms

Hosted voice-agent platforms are strongest when you want a managed dashboard, phone-number provisioning, hosted orchestration, and campaign tooling out of the box.

AbsoluteJS Voice is strongest when voice is part of your own product and you need code-owned primitives:

- Your app stores the call data instead of a vendor dashboard being the source of truth.
- Your app controls provider routing, fallback, retries, handoffs, and retention.
- Your team can inspect and extend every primitive.
- Your framework UI can render first-class voice state without iframe/dashboard handoffs.
- Your production checks and evals can run in CI, smoke tests, or your own admin UI.

The goal is not to clone a hosted platform. The goal is to make AbsoluteJS the best place to build and operate self-hosted voice products.

## Default Debug Path

Hosted platforms usually make the call log the center of debugging. AbsoluteJS Voice makes the operations record that center, while keeping the data and routes inside your app.

Mount `createVoiceOperationsRecordRoutes(...)` early in any serious voice app and use `/voice-operations/:sessionId` as the first support link for failed calls, bad transcripts, provider fallback, slow turns, handoff failures, campaign attempts, and post-call workflow issues.

The recommended investigation path is:

1. Open `/production-readiness`, `/ops-recovery`, `/voice/simulations`, a tool contract report, or an outcome contract report.
2. Follow the linked `/voice-operations/:sessionId` record for the impacted call or session.
3. Inspect the transcript, trace timeline, replay links, provider decisions, tool calls, handoffs, reviews, tasks, audit events, integration events, and sink delivery attempts from one page.
4. Use `/voice-operations/:sessionId/incident.md` when support, engineering, or a customer-facing handoff needs copyable incident context.

That is the Vapi-style call-log workflow without a vendor dashboard becoming the source of truth.

## Switching From Vapi

If a team is already evaluating Vapi, map the dashboard concepts to AbsoluteJS primitives this way:

| Hosted voice-platform concept | AbsoluteJS Voice primitive |
| --- | --- |
| Assistant | `createVoiceAssistant(...)`, `createVoiceAgent(...)`, or `voice({ onTurn })` |
| Web call | `voice(...)` plus React, Vue, Svelte, Angular, HTML, HTMX, or client helpers |
| Phone call | `createVoicePhoneAgent(...)` with Twilio, Telnyx, or Plivo routes |
| Squads / multi-assistant routing | `createVoiceAgentSquad(...)` with `handoffPolicy`, `contextPolicy`, specialist tools, traces, and squad contracts |
| Tools / functions | Agent tools, tool runtime, `runVoiceToolContract(...)`, audit events, and integration events |
| Call logs | `/voice-operations/:sessionId`, trace timelines, replay links, reviews, tasks, audit, provider decisions, and delivery queues |
| Post-call analysis | reviews, outcomes, ops tasks, handoff deliveries, integration events, webhook/audit sinks, and outcome contracts |
| Simulation testing | `createVoiceSimulationSuiteRoutes(...)` with scenarios, fixtures, tool contracts, outcome contracts, and baseline comparison |
| Production monitoring | `createVoiceProductionReadinessRoutes(...)`, `createVoiceOpsRecoveryRoutes(...)`, ops status, latency SLO gates, provider health, and delivery runtime proof |
| Campaigns | `createVoiceCampaignRoutes(...)`, recipient import, scheduling controls, carrier dialer proof, and campaign readiness |
| Compliance controls | self-hosted storage, redaction defaults, retention plans, audit exports, data-control routes, and provider-key ownership |

The practical difference is ownership. In Vapi-style systems, the assistant, call log, tool execution, and operational dashboard live primarily in the vendor platform. With AbsoluteJS Voice, those same surfaces are route handlers, stores, reports, hooks, and contracts inside the AbsoluteJS app.

Use `createVoiceAssistant(...)` when you want a product-level assistant surface with tools, guardrails, experiments, tracing, reviews, tasks, and ops recipes. Drop down to `createVoiceAgent(...)` when you want a provider-neutral model/tool loop. Use raw `voice({ onTurn })` when you want the smallest possible browser voice route.

Use `createVoiceAgentSquad(...)` for Vapi Squads-style specialist routing without moving routing policy into a hosted dashboard. Each specialist owns its tools, `handoffPolicy` decides whether to allow, reroute, block, or escalate transfers, and `contextPolicy` decides what conversation context the next specialist receives. Squad traces and contracts make the handoff graph testable before production.

Use `createVoicePhoneAgent(...)` when the hosted-platform feature you need is "call this assistant by phone." The wrapper mounts carrier routes, setup pages, carrier matrix proof, and smoke-contract routes while still letting your app own Twilio, Telnyx, or Plivo credentials, webhooks, stream URLs, traces, and lifecycle outcomes.

Use operations records instead of hosted call logs. A proof failure should link to `/voice-operations/:sessionId`; the record then links the transcript, replay, provider choices, tool calls, handoffs, audit events, reviews, tasks, integration events, and delivery attempts. When someone needs a support handoff, send `/voice-operations/:sessionId/incident.md`.

Use simulation and contracts before live traffic. The simulation suite, tool contracts, outcome contracts, provider routing contracts, phone-agent smoke contracts, and production-readiness gates turn dashboard-only confidence into code-owned deploy evidence.

### Vapi Migration Checklist

Use this checklist when a buyer asks whether AbsoluteJS Voice covers the practical Vapi surface area without becoming a hosted platform:

| Vapi evaluation question | AbsoluteJS proof to show |
| --- | --- |
| Can I make a web voice assistant? | Framework page using `voice(...)`, then `/traces` and `/production-readiness` |
| Can I make phone calls? | `/phone-agent`, `/api/voice/phone/setup`, carrier matrix, and phone smoke proof |
| Can I use multiple assistants? | `createVoiceAgentSquad(...)`, `/agent-squad-contract`, current-specialist framework helpers, and handoff traces |
| Can I call tools/functions? | Tool definitions, `/tool-contracts`, audit events, integration events, and operations records |
| Can I debug a bad call? | `/voice-operations/:sessionId`, session replay, trace timeline, incident Markdown, delivery attempts, and provider decisions |
| Can I monitor production health? | `/production-readiness`, `/ops-recovery`, `/api/production-readiness/gate`, provider SLOs, and delivery runtime proof |
| Can I test before live traffic? | `/voice/simulations`, scenario fixtures, tool contracts, outcome contracts, provider routing contracts, and eval baselines |
| Can I run outbound campaigns? | `createVoiceCampaignRoutes(...)`, campaign readiness proof, carrier dry-run proof, retry/quiet-hours/rate-limit evidence |
| Can operators intervene? | Live-ops routes, action-center helpers, pause/resume/takeover runtime controls, and operator action audit history |
| Can I own compliance evidence? | `/data-control`, redacted audit export, retention dry-run/apply routes, provider-key recommendations, and customer-owned storage |
| Can I export logs to my infrastructure? | `/voice/observability-export`, delivery receipts, artifact index, replay proof, S3/SQLite/Postgres/file/webhook destinations |

The migration path should start by replacing hosted-dashboard concepts with mounted primitives and proof routes. Do not start by copying a hosted dashboard. Start with the voice route, operations record, readiness gate, provider contracts, and customer-owned observability export; then add campaigns, live-ops, or compliance controls only when the app needs those surfaces.

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

## Fastest First Success

Use these paths when you want the smallest useful setup that still proves the app is production-shaped. The point is not to hide primitives; it is to mount the voice route plus the debug surfaces a real team needs immediately.

### Browser Agent In 10 Minutes

```ts
import { Elysia } from 'elysia';
import {
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoiceOpsStatusRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceTraceTimelineRoutes,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

export const app = new Elysia()
	.use(
		voice({
			path: '/voice',
			session: runtime.session,
			trace: runtime.traces,
			stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
			async onTurn({ turn }) {
				return { assistantText: `I heard: ${turn.text}` };
			},
			onComplete: async () => {}
		})
	)
	.use(
		createVoiceOpsStatusRoutes({
			path: '/api/voice/ops-status',
			store: runtime.traces,
			sttProviders: ['deepgram']
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
		createVoiceOperationsRecordRoutes({
			audit: runtime.audit,
			htmlPath: '/voice-operations/:sessionId',
			path: '/api/voice-operations/:sessionId',
			store: runtime.traces
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			links: {
				operationsRecords: '/voice-operations/:sessionId'
			},
			path: '/api/production-readiness',
			htmlPath: '/production-readiness',
			store: runtime.traces
		})
	);
```

After one browser call, open:

- `/api/voice/ops-status`: compact health signal for UI/widgets.
- `/traces`: trace timeline by session.
- `/voice-operations/:sessionId`: call-log/debug record for the session.
- `/voice-operations/:sessionId/incident.md`: copyable incident handoff.
- `/production-readiness`: deploy gate summary.

### Phone Agent In 20 Minutes

```ts
import { Elysia } from 'elysia';
import {
	createVoiceFileRuntimeStorage,
	createVoiceOperationsRecordRoutes,
	createVoicePhoneAgent,
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile,
	createVoiceTelephonyOutcomePolicy
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});
const outcomePolicy = createVoiceTelephonyOutcomePolicy({
	transferTarget: process.env.VOICE_TRANSFER_TARGET
});

export const app = new Elysia()
	.use(
		createVoicePhoneAgent({
			setup: { path: '/api/voice/phone/setup' },
			matrix: { path: '/api/carriers' },
			productionSmoke: {
				maxAgeMs: 24 * 60 * 60 * 1000,
				required: [
					'carrier-contract',
					'media-started',
					'transcript',
					'assistant-response',
					'lifecycle-outcome',
					'no-session-error',
					'fresh-trace'
				],
				store: runtime.traces
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
	)
	.use(
		createVoiceOperationsRecordRoutes({
			audit: runtime.audit,
			htmlPath: '/voice-operations/:sessionId',
			path: '/api/voice-operations/:sessionId',
			store: runtime.traces
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			...createVoiceReadinessProfile('phone-agent', {
				explain: true
			}),
			links: {
				operationsRecords: '/voice-operations/:sessionId'
			},
			path: '/api/production-readiness',
			htmlPath: '/production-readiness',
			store: runtime.traces
		})
	);
```

Open `/api/voice/phone/setup?format=html`, copy the reported Twilio URLs into the carrier dashboard, run one smoke call, then inspect:

- `/api/carriers?format=html`: carrier setup matrix.
- `/voice/phone/smoke-contract?sessionId=...`: trace-backed phone smoke proof.
- `/voice-operations/:sessionId`: call-log/debug record.
- `/production-readiness`: phone-agent readiness gate.

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

Once the basic route works, mount the proof routes you need. These give you the self-hosted operational surfaces that hosted platforms usually make mandatory, without forcing a bundled app kit:

```ts
import {
	createVoiceAuditDeliveryRoutes,
	createVoiceDemoReadyRoutes,
	createVoiceFileRuntimeStorage,
	createVoiceLiveLatencyRoutes,
	createVoiceOpsStatusRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceTraceDeliveryRoutes,
	createVoiceTraceTimelineRoutes,
	createVoiceTurnLatencyRoutes,
	createVoiceTurnQualityRoutes
} from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

app
	.use(
		createVoiceOpsStatusRoutes({
			store: runtime.traces,
			llmProviders: ['openai', 'anthropic', 'gemini'],
			sttProviders: ['deepgram', 'assemblyai']
		})
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
			audit: runtime.audit,
			auditDeliveries: runtime.auditDeliveries,
			htmlPath: '/production-readiness',
			path: '/api/production-readiness',
			store: runtime.traces,
			traceDeliveries: runtime.traceDeliveries
		})
	)
	.use(
		createVoiceAuditDeliveryRoutes({
			htmlPath: '/audit/deliveries',
			path: '/api/voice-audit-deliveries',
			store: runtime.auditDeliveries
		})
	)
	.use(
		createVoiceTraceDeliveryRoutes({
			htmlPath: '/traces/deliveries',
			path: '/api/voice-trace-deliveries',
			store: runtime.traceDeliveries
		})
	);
```

Recommended proof routes:

- `/api/voice/ops-status`: compact status for hooks, widgets, and customer-facing demos.
- `/api/voice/ops-status/html`: HTML status card for quick internal review.
- `/demo-ready`: customer-facing demo readiness checklist.
- `/production-readiness`: production gate summary.
- `/voice-operations/:sessionId`: default call-log/debug record for one problematic session.
- `/voice-operations/:sessionId/incident.md`: copyable incident handoff for support and engineering.
- `/audit/deliveries`: audit sink export queue and failed delivery details.
- `/voice/phone/smoke-contract`: trace-backed phone-agent production smoke proof.
- `/traces`: per-session trace timelines.
- `/traces/deliveries`: trace sink export queue and failed delivery details.
- `/turn-latency`: server-side turn-stage latency.
- `/live-latency`: browser-measured speech-to-assistant p50/p95 latency.
- `/turn-quality`: STT confidence, correction, fallback, and transcript diagnostics.

### Readiness Profiles

Use `createVoiceReadinessProfile(...)` when you want production-shaped defaults without adopting an app kit. Profiles are just spreadable route-option bundles for `createVoiceProductionReadinessRoutes(...)`; every option remains explicit and overrideable.

```ts
import {
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile
} from '@absolutejs/voice';

app.use(
	createVoiceProductionReadinessRoutes({
		...createVoiceReadinessProfile('meeting-recorder', {
			bargeInReports: async () => [await buildBargeInReport()],
			explain: true,
			providerRoutingContracts: async () => [await runProviderRoutingContract()],
			reconnectContracts: async () => [await runReconnectContract()]
		}),
		store: runtime.traces
	})
);
```

Use `evaluateVoiceProductionReadinessEvidence(...)` or `assertVoiceProductionReadinessEvidence(...)` when a proof pack should check the readiness JSON directly. This keeps release gates tied to structured evidence instead of route text:

```ts
const readiness = await buildVoiceProductionReadinessReport({
	store: runtime.traces,
	providerSlo,
	opsRecovery
});

assertVoiceProductionReadinessEvidence(readiness, {
	requireStatus: 'pass',
	requiredChecks: ['Provider SLO gates', 'Session health', 'Turn quality']
});
```

Use `createVoiceProductionReadinessProofRuntime(...)` when the app needs a fresh, isolated proof window instead of letting stale local traces certify a deploy. The runtime is intentionally small: it owns a bounded in-memory trace store, route-cache defaults, a reusable TTL cache, a proof-freshness check, and optional synthetic provider/live-latency seed events. Your app still mounts routes, writes artifacts, and decides which proof sources matter.

```ts
import {
	createVoiceProductionReadinessProofRuntime,
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile
} from '@absolutejs/voice';

const readinessProof = createVoiceProductionReadinessProofRuntime({
	cacheMs: 10_000,
	traceMaxAgeMs: 30 * 60_000
});

const refreshReadinessProof = () =>
	readinessProof.refresh(async (metadata) => {
		await readinessProof.seedTraceProof({
			llmProvider: 'openai',
			scenarioId: 'provider-slo-proof',
			sttProvider: 'deepgram',
			ttsProvider: 'openai'
		});

		await writeProofPack({
			generatedAt: metadata.generatedAt,
			runId: metadata.runId
		});
	});

app.use(
	createVoiceProductionReadinessRoutes({
		...createVoiceReadinessProfile('phone-agent', {
			explain: true
		}),
		additionalChecks: async () => [
			await readinessProof.buildFreshnessCheck()
		],
		cacheMs: readinessProof.options.cacheMs,
		providerSlo: async () => {
			await refreshReadinessProof();
			return {
				events: await readinessProof.store.list(),
				requiredKinds: ['llm', 'stt', 'tts']
			};
		},
		resolveOptions: async () => {
			await refreshReadinessProof();
			return {};
		},
		store: readinessProof.store,
		traceMaxAgeMs: readinessProof.options.traceMaxAgeMs
	})
);
```

This primitive does not start workers, create persistent storage, mount a dashboard, or prescribe a deploy workflow. It only gives self-hosted apps one clean readiness-proof runtime so JSON, HTML, gate checks, proof packs, and trend artifacts agree on the same fresh evidence window.

Use `buildVoiceRealCallProfileEvidenceFromTraceEvents(...)` or `loadVoiceRealCallProfileEvidenceFromTraceStore(...)` when repeated real browser/phone sessions should drive profile defaults and provider/runtime recommendations. These helpers read ordinary trace events such as `session.error`, `provider.decision`, `client.live_latency`, `client.browser_media`, `client.telephony_media`, `client.barge_in`, and `turn_latency.stage`, then emit `VoiceProofTrendRealCallProfileEvidence[]` for `buildVoiceRealCallProfileHistoryReport(...)`.

```ts
import {
	buildVoiceRealCallProfileHistoryReport,
	createVoiceRealCallProfileHistoryRoutes,
	loadVoiceRealCallProfileEvidenceFromTraceStore
} from '@absolutejs/voice';

const buildRealCallHistory = async () =>
	buildVoiceRealCallProfileHistoryReport({
		evidence: await loadVoiceRealCallProfileEvidenceFromTraceStore({
			defaultProfileId: 'meeting-recorder',
			defaultProfileLabel: 'Meeting recorder',
			store: runtime.traces
		}),
		source: 'runtime.traces'
	});

app.use(
	createVoiceRealCallProfileHistoryRoutes({
		source: buildRealCallHistory
	})
);
```

The point is not to benchmark a fake demo once. The point is to let every real call add profile evidence so `/api/voice/real-call-profile-history`, provider recommendations, profile-switch readiness, and operations records can explain which provider/runtime path is winning for each call shape.

Use `buildVoiceRealCallProfileReadinessCheck(...)` to make that history deploy-blocking through `createVoiceProductionReadinessRoutes(...)`:

```ts
createVoiceProductionReadinessRoutes({
	additionalChecks: async () => [
		buildVoiceRealCallProfileReadinessCheck(await buildRealCallHistory(), {
			minActionableProfiles: 2,
			minCycles: 10,
			requiredProfileIds: ['meeting-recorder', 'support-agent'],
			requiredProviderRoles: ['llm', 'stt', 'tts']
		})
	],
	store: runtime.traces
});
```

The readiness check includes recovery actions from `buildVoiceRealCallProfileRecoveryActions(...)`, so failed gates can point operators at the profile history report, browser/phone proof, missing provider-role evidence, operations records, and production-readiness refresh instead of only saying "failed."

Use `createVoiceProfileTraceTagger(...)` when the app already has a trace store and needs every appended trace to carry a benchmark profile label. It wraps any `VoiceTraceEventStore`, preserves the underlying store behavior, and adds `profileId`/`benchmarkProfileId` metadata and payload fields that real-call profile history can ingest later.

```ts
import { createVoiceProfileTraceTagger } from '@absolutejs/voice';

const trace = createVoiceProfileTraceTagger({
	defaultProfile: {
		id: 'meeting-recorder',
		label: 'Meeting recorder'
	},
	resolveProfile: (event) =>
		event.sessionId.startsWith('support-') ? 'support-agent' : undefined,
	store: runtime.traces
});
```

Built-in profiles:

- `meeting-recorder`: live latency, session health, provider fallback, routing contracts, reconnect proof, and barge-in interruption proof.
- `phone-agent`: carrier readiness, phone-agent smoke proof, campaign readiness proof, handoffs, provider routing contracts, audit/trace delivery health, customer-owned observability export delivery history, and delivery runtime proof.
- `ops-heavy`: audit evidence, operator action history, audit/trace delivery health, customer-owned observability export delivery history, delivery runtime proof, and deploy-gate support.

Phone-agent fast path:

```ts
app.use(
	createVoiceProductionReadinessRoutes({
		...createVoiceReadinessProfile('phone-agent', {
			auditDeliveries: runtime.auditDeliveries,
			campaignReadiness: () =>
				runVoiceCampaignReadinessProof({
					store: runtime.campaigns
				}),
			carriers: loadCarrierMatrixInputs,
			deliveryRuntime,
			explain: true,
			observabilityExportDeliveryHistory: {
				store: observabilityExportDeliveryReceipts,
				maxAgeMs: 60 * 60 * 1000,
				failOnStale: true
			},
			phoneAgentSmokes: async () => [await runPhoneSmoke()],
			providerRoutingContracts: async () => [await runProviderRoutingContract()],
			traceDeliveries: runtime.traceDeliveries
		}),
		store: runtime.traces
	})
);
```

Ops-heavy fast path:

```ts
app.use(
	createVoiceProductionReadinessRoutes({
		...createVoiceReadinessProfile('ops-heavy', {
			audit: runtime.audit,
			auditDeliveries: runtime.auditDeliveries,
			deliveryRuntime,
			observabilityExportDeliveryHistory: {
				store: observabilityExportDeliveryReceipts
			},
			traceDeliveries: runtime.traceDeliveries
		}),
		gate: {
			failOnWarnings: true
		},
		store: runtime.traces
	})
);
```

The profile helper intentionally does not mount routes, create storage, start workers, or prescribe a deploy workflow. It only returns readiness options so teams can standardize defaults while keeping control over proof sources and route mounting.

Pass `explain: true` when the readiness JSON and HTML should describe the selected profile, its purpose, and which expected proof surfaces are configured or still missing. This is useful for customer demos and internal release reviews where the readiness URL needs to explain what it certifies without sending people to docs.

## Delivery Runtime Presets

Use `createVoiceDeliveryRuntimePresetConfig(...)` when you want one primitive to create paired audit and trace delivery workers for the same target. The preset returns a normal `VoiceDeliveryRuntimeConfig`, so you can still inspect or override worker options before passing it to `createVoiceDeliveryRuntime(...)`.

### File Delivery

Use file delivery for local demos, dev environments, or self-hosted deployments that collect exports from disk.

```ts
import {
	createVoiceDeliveryRuntime,
	createVoiceDeliveryRuntimePresetConfig,
	createVoiceDeliveryRuntimeRoutes,
	createVoiceFileRuntimeStorage
} from '@absolutejs/voice';

const runtimeStorage = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

const deliveryRuntime = createVoiceDeliveryRuntime(
	createVoiceDeliveryRuntimePresetConfig({
		auditDeliveries: runtimeStorage.auditDeliveries,
		directory: '.voice-runtime/support/delivery-exports',
		leases: createLeaseCoordinator(),
		mode: 'file',
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);

app.use(
	createVoiceDeliveryRuntimeRoutes({
		runtime: deliveryRuntime
	})
);
```

### Webhook Delivery

Use webhook delivery when audit and trace exports should go to your own ingestion service, SIEM bridge, warehouse collector, or internal ops backend. The built-in HTTP sinks support retries, optional HMAC signing, custom headers, timeouts, and custom envelope bodies.

```ts
const deliveryRuntime = createVoiceDeliveryRuntime(
	createVoiceDeliveryRuntimePresetConfig({
		auditDeliveries: runtimeStorage.auditDeliveries,
		auditSinkId: 'support-audit-webhook',
		body: {
			audit: ({ events }) => ({
				eventCount: events.length,
				events,
				source: 'support-app',
				surface: 'audit-deliveries'
			}),
			trace: ({ events }) => ({
				eventCount: events.length,
				events,
				source: 'support-app',
				surface: 'trace-deliveries'
			})
		},
		failures: {
			maxFailures: 3
		},
		leases: {
			audit: createLeaseCoordinator(),
			trace: createLeaseCoordinator()
		},
		mode: 'webhook',
		signingSecret: process.env.VOICE_DELIVERY_WEBHOOK_SECRET,
		traceDeliveries: runtimeStorage.traceDeliveries,
		traceSinkId: 'support-trace-webhook',
		url: process.env.VOICE_DELIVERY_WEBHOOK_URL!
	})
);
```

### S3 Delivery

Use S3 delivery when exports should land directly in object storage through Bun's native S3 client. Set `bucket` and `keyPrefix`; the preset writes audit and trace exports under separate prefixes.

```ts
const deliveryRuntime = createVoiceDeliveryRuntime(
	createVoiceDeliveryRuntimePresetConfig({
		auditDeliveries: runtimeStorage.auditDeliveries,
		auditSinkId: 'support-audit-s3',
		bucket: process.env.VOICE_DELIVERY_S3_BUCKET,
		failures: {
			maxFailures: 3
		},
		keyPrefix: 'support/voice-deliveries',
		leases: {
			audit: createLeaseCoordinator(),
			trace: createLeaseCoordinator()
		},
		mode: 's3',
		traceDeliveries: runtimeStorage.traceDeliveries,
		traceSinkId: 'support-trace-s3'
	})
);
```

Mount `createVoiceDeliveryRuntimeRoutes({ runtime: deliveryRuntime })` to expose:

- `/api/voice-delivery-runtime`: combined audit and trace worker summary.
- `/api/voice-delivery-runtime/tick`: manual tick for both workers.
- `/delivery-runtime`: HTML worker control plane.

Pass the same runtime to production readiness so failed, dead-lettered, or pending export queues become deploy-blocking evidence:

```ts
app.use(
	createVoiceProductionReadinessRoutes({
		auditDeliveries: runtimeStorage.auditDeliveries,
		deliveryRuntime,
		links: {
			deliveryRuntime: '/delivery-runtime'
		},
		store: runtimeStorage.traces,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);
```

## Simulation Suite Path

Use `createVoiceSimulationSuiteRoutes(...)` when you want one pre-production proof surface for the things that usually live in separate dashboards or scripts:

```ts
import {
	createVoiceSimulationSuiteRoutes,
	createVoiceFileRuntimeStorage
} from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({
	directory: '.voice-runtime/support'
});

app.use(
	createVoiceSimulationSuiteRoutes({
		htmlPath: '/voice/simulations',
		path: '/api/voice/simulations',
		store: runtime.traces,
		scenarios: workflowScenarios,
		fixtureStore: scenarioFixtureStore,
		tools: toolContracts,
		outcomes: {
			contracts: outcomeContracts,
			events: runtime.events,
			reviews: runtime.reviews,
			sessions: runtime.session,
			tasks: runtime.tasks
		}
	})
);
```

The suite rolls up session quality, scenario evals, fixture simulations, tool contracts, and outcome contracts into one pass/fail report. It is the code-owned equivalent of "test this voice flow before production" without requiring a hosted voice-agent dashboard.

## Self-Hosted Campaigns

Use `createVoiceCampaignRoutes(...)` when you need Retell/Bland-style outbound campaign primitives without giving a hosted dialer ownership of recipients, attempts, outcomes, or readiness proof.

```ts
import {
	createVoiceCampaignRoutes,
	createVoiceProductionReadinessRoutes,
	createVoiceReadinessProfile,
	createVoiceSQLiteCampaignStore,
	runVoiceCampaignReadinessProof
} from '@absolutejs/voice';

const campaigns = createVoiceSQLiteCampaignStore({
	path: '.voice-runtime/campaigns.sqlite'
});

app.use(
	createVoiceCampaignRoutes({
		htmlPath: '/voice/campaigns',
		path: '/api/voice/campaigns',
		store: campaigns,
		title: 'Outbound Campaigns'
	})
);
```

The campaign runtime gives you explicit primitives instead of a campaign app kit:

- `importVoiceCampaignRecipients(...)`: validates CSV/JSON rows, phone numbers, consent, duplicates, variables, and metadata.
- `VoiceCampaignRuntime.importRecipients(...)`: persists accepted recipients and returns rejected-row evidence.
- `tick(...)`: enforces campaign status, max concurrency, attempt windows, quiet hours, rolling rate limits, retry backoff, and `maxAttempts`.
- `pause(...)`, `resume(...)`, `cancel(...)`: operator-safe campaign controls.
- `applyVoiceCampaignTelephonyOutcome(...)`: maps Twilio/Telnyx/Plivo webhook decisions back into campaign attempts.
- `buildVoiceCampaignObservabilityReport(...)`: queue depth, active attempts, leases, attempt rates, failures, and stuck work.

Import recipients through the route API:

```ts
await fetch('/api/voice/campaigns/campaign-1/recipients/import', {
	body: JSON.stringify({
		csv: `id,name,phone,consent,segment
recipient-1,Ada,+15550001001,yes,trial
recipient-2,Grace,+15550001002,true,enterprise`,
		requireConsent: true,
		variableColumns: ['segment']
	}),
	headers: {
		'content-type': 'application/json'
	},
	method: 'POST'
});
```

Create campaigns with scheduling controls:

```ts
await runtime.create({
	maxAttempts: 3,
	maxConcurrentAttempts: 10,
	name: 'Renewal outreach',
	schedule: {
		attemptWindow: { startHour: 9, endHour: 17 },
		quietHours: { startHour: 12, endHour: 13 },
		rateLimit: { maxAttempts: 60, windowMs: 60_000 },
		retryPolicy: { backoffMs: [5 * 60_000, 30 * 60_000] }
	}
});
```

Certify the campaign path without live carrier traffic:

```ts
const campaignReadiness = await runVoiceCampaignReadinessProof({
	store: campaigns
});

if (!campaignReadiness.ok) {
	throw new Error(
		campaignReadiness.checks
			.filter((check) => check.status !== 'pass')
			.map((check) => check.name)
			.join('\n')
	);
}
```

Pass that proof into production readiness so campaign regressions block deploys:

```ts
app.use(
	createVoiceProductionReadinessRoutes({
		...createVoiceReadinessProfile('phone-agent', {
			campaignReadiness: () =>
				runVoiceCampaignReadinessProof({
					store: campaigns
				}),
			explain: true
		}),
		store: runtime.traces
	})
);
```

For carrier-specific outbound dialing, use `createVoiceTwilioCampaignDialer(...)`, `createVoiceTelnyxCampaignDialer(...)`, or `createVoicePlivoCampaignDialer(...)` as the campaign `dialer`. `runVoiceCampaignDialerProof(...)` dry-runs those provider requests with intercepted fetch calls and synthetic webhook outcomes, so you can prove metadata and outcome application before a real campaign sends traffic.

## Phone Voice Agent In 20 Minutes

Use `createVoicePhoneAgent(...)` when the agent needs to answer or place calls through your own Twilio, Telnyx, or Plivo account. This is the self-hosted alternative to a hosted phone-agent dashboard: your app owns the carrier routes, stream URLs, webhooks, traces, readiness checks, and lifecycle outcomes.

```ts
import {
	createVoicePhoneAgent,
	createVoiceTelephonyOutcomePolicy,
	runVoicePhoneAgentProductionSmokeContract
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const outcomePolicy = createVoiceTelephonyOutcomePolicy({
	transferTarget: '+15551234567'
});

app
	.use(
		createVoicePhoneAgent({
			setup: {
				path: '/api/voice/phone/setup',
				title: 'Support Phone Agent'
			},
			matrix: {
				path: '/api/carriers',
				title: 'AbsoluteJS Voice Carrier Matrix'
			},
			productionSmoke: {
				maxAgeMs: 24 * 60 * 60 * 1000,
				required: [
					'carrier-contract',
					'media-started',
					'transcript',
					'assistant-response',
					'lifecycle-outcome',
					'no-session-error',
					'fresh-trace'
				],
				store: runtime.traces
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

The wrapper mounts selected carrier routes plus two proof surfaces:

- `/api/voice/phone/setup`: one setup report with carrier URLs, smoke links, lifecycle stages, and readiness.
- `/api/voice/phone/setup?format=html`: copy/paste setup page for carrier dashboards.
- `/api/carriers`: carrier matrix JSON for Twilio, Telnyx, and Plivo.
- `/api/carriers?format=html`: side-by-side carrier readiness matrix.
- `/api/voice/phone/smoke-contract?sessionId=...`: trace-backed production smoke contract.
- `/voice/phone/smoke-contract?sessionId=...`: HTML production smoke contract.

The setup JSON includes `setupInstructions`, so your own admin UI can render copy-ready carrier fields without scraping HTML:

```ts
const setup = await fetch('/api/voice/phone/setup').then((response) =>
	response.json()
);

for (const carrier of setup.setupInstructions) {
	console.log(carrier.carrierName, carrier.status);
	console.log(carrier.steps.join('\n'));
}
```

Each instruction includes:

- `answerLabel`: `TwiML URL`, `TeXML URL`, or `Answer URL`.
- `answerUrl`: the URL to paste into the carrier's inbound voice/answer field.
- `webhookUrl`: the status callback or webhook URL.
- `streamUrl`: the `wss://` media stream URL the carrier must reach.
- `setupPath` and `smokePath`: package-mounted proof pages for that carrier.
- `steps`: ordered copy/paste guidance for the carrier dashboard.
- `issues`: contract errors or warnings from the carrier matrix.

The setup page renders the same instructions and tells you exactly what to copy into the carrier dashboard:

- Twilio: set the phone number voice webhook/TwiML URL to the reported TwiML URL, set the status callback to the reported webhook URL, and allow the reported `wss://` media stream.
- Telnyx: set the connection TeXML URL to the reported TeXML URL, set the status webhook to the reported webhook URL, and allow the reported `wss://` media stream.
- Plivo: set the answer URL to the reported answer URL, set the status callback to the reported webhook URL, and allow the reported `wss://` media stream.

Each configured carrier can also expose its own setup and smoke pages, for example:

- `/api/voice/twilio/setup?format=html`
- `/api/voice/twilio/smoke?format=html`
- `/api/voice/telnyx/setup?format=html`
- `/api/voice/telnyx/smoke?format=html`
- `/api/voice/plivo/setup?format=html`
- `/api/voice/plivo/smoke?format=html`

The phone-agent report normalizes the lifecycle schema across carriers:

- `ringing`
- `answered`
- `media-started`
- `transcript`
- `assistant-response`
- `transfer`
- `voicemail`
- `no-answer`
- `completed`
- `failed`

That is the important Vapi/Retell/Bland gap this primitive closes: a team can mount one phone-agent entrypoint, bring its own carrier account, verify readiness before live calls, and keep call traces and lifecycle outcomes inside its own AbsoluteJS app. Telnyx and Plivo use the same wrapper with `{ provider: 'telnyx', options: ... }` or `{ provider: 'plivo', options: ... }`. The lower-level `createTwilioVoiceRoutes(...)`, `createTelnyxVoiceRoutes(...)`, and `createPlivoVoiceRoutes(...)` helpers remain available when you need carrier-specific control.

After running a real smoke call, certify the phone-agent path from traces:

```ts
const smoke = await runVoicePhoneAgentProductionSmokeContract({
	maxAgeMs: 24 * 60 * 60 * 1000,
	required: [
		'media-started',
		'transcript',
		'assistant-response',
		'lifecycle-outcome',
		'no-session-error',
		'fresh-trace'
	],
	sessionId: 'phone-smoke-session',
	store: runtime.traces
});

if (!smoke.pass) {
	throw new Error(smoke.issues.map((issue) => issue.message).join('\n'));
}
```

Pass those reports into production readiness through `phoneAgentSmokes`. This makes deployment fail when the carrier setup exists but the actual phone-agent call path did not produce media start, transcript, assistant response, terminal lifecycle outcome, and clean trace evidence.

When `productionSmoke` is enabled on `createVoicePhoneAgent(...)`, the wrapper mounts `/api/voice/phone/smoke-contract?sessionId=...` for JSON and `/voice/phone/smoke-contract?sessionId=...` for HTML. It also derives carrier contract evidence from the existing carrier matrix unless you provide a custom `getContract`.

## Ops Status Hooks And Widgets

Use `createVoiceOpsStatusRoutes(...)` when you want a small status endpoint for demos, admin pages, and framework widgets. It is intentionally not a route bundle: mount quality gates, eval routes, provider health, session replay, phone-agent smoke proof, handoff health, and diagnostics explicitly when your app needs them.

```ts
import {
	createVoiceDemoReadyRoutes,
	createVoiceFileRuntimeStorage,
	createVoiceOpsStatusRoutes,
	summarizeVoiceOpsStatus
} from '@absolutejs/voice';

const runtime = createVoiceFileRuntimeStorage({ directory: '.voice-runtime/support' });

app.use(
	createVoiceOpsStatusRoutes({
		store: runtime.traces,
		llmProviders: ['openai', 'anthropic', 'gemini'],
		sttProviders: ['deepgram', 'assemblyai']
	})
);
```

The status endpoint is intentionally small enough for customer-facing demos. It can report fixture-backed workflow readiness while leaving deeper live quality/session failures visible on the proof routes you mount separately.

For a single demo page that rolls up ops status, production readiness, phone setup, and phone smoke proof, mount `createVoiceDemoReadyRoutes(...)` with the same reports you already expose elsewhere:

```ts
app.use(
	createVoiceDemoReadyRoutes({
		opsStatus: {
			href: '/api/voice/ops-status',
			load: () => summarizeVoiceOpsStatus(opsStatusOptions)
		},
		phoneSetup: {
			href: '/api/voice/phone/setup?format=html',
			load: () => phoneAgentSetupReport
		},
		phoneSmoke: {
			href: '/voice/phone/smoke-contract',
			load: () => phoneSmokeReport
		},
		productionReadiness: {
			href: '/production-readiness',
			load: () => productionReadinessReport
		}
	})
);
```

```ts
app.use(
	createVoiceOpsStatusRoutes({
		include: { quality: false, sessions: false },
		preferFixtureWorkflows: true,
		store: runtime.traces
	})
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

	const status = createVoiceOpsStatus('/api/voice/ops-status', { intervalMs: 5000 });
	let html = '';
	onMount(() => status.subscribe(() => (html = status.getHTML())));
	onDestroy(() => status.close());
</script>

{@html html}
```

### Angular Status Widget

```ts
import { VoiceOpsStatusService } from '@absolutejs/voice/angular';

status = inject(VoiceOpsStatusService).connect('/api/voice/ops-status', {
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

	mountVoiceOpsStatus(document.querySelector('#voice-ops-status'), '/api/voice/ops-status', {
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

## Delivery Runtime Widgets

After mounting `createVoiceDeliveryRuntimeRoutes(...)`, apps can expose audit and trace worker health through the same framework-native primitives:

```tsx
import { VoiceDeliveryRuntime } from '@absolutejs/voice/react';

export function DeliveryWorkers() {
	return <VoiceDeliveryRuntime intervalMs={5000} />;
}
```

The widget includes operator actions by default: `Tick workers` drains pending/failed deliveries, and `Requeue dead letters` moves reviewed dead-lettered audit/trace deliveries back into the live queues. Pass `includeActions={false}` when you only want a read-only status card.

```ts
import { VoiceDeliveryRuntime } from '@absolutejs/voice/vue';
import { createVoiceDeliveryRuntime } from '@absolutejs/voice/svelte';
import { VoiceDeliveryRuntimeService } from '@absolutejs/voice/angular';
```

For HTML or HTMX pages:

```html
<absolute-voice-delivery-runtime interval-ms="5000"></absolute-voice-delivery-runtime>
<script type="module">
	import { defineVoiceDeliveryRuntimeElement } from '@absolutejs/voice/client';
	defineVoiceDeliveryRuntimeElement();
</script>
```

## Voice Ops Action Center

Use `VoiceOpsActionCenter` when you want one primitive operator panel for production proofs and recovery actions without building a dashboard. The default action builder can include production readiness refresh, delivery worker ticks, dead-letter requeue, turn-latency proof, and provider failover simulation.

```tsx
import { VoiceOpsActionCenter } from '@absolutejs/voice/react';
import { createVoiceOpsActionCenterActions } from '@absolutejs/voice/client';

export function OperatorPanel() {
	return (
		<VoiceOpsActionCenter
			actions={createVoiceOpsActionCenterActions({
				providers: ['deepgram', 'assemblyai']
			})}
		/>
	);
}
```

Mount `createVoiceOpsActionAuditRoutes(...)` to make every action-center click auditable. The client posts successful and failed action results to `/api/voice/ops-actions/audit` by default, and the route records both `operator.action` audit events and `operator.action` trace events.

```ts
import { createVoiceOpsActionAuditRoutes } from '@absolutejs/voice';

app.use(
	createVoiceOpsActionAuditRoutes({
		audit: runtimeStorage.audit,
		trace: runtimeStorage.traces
	})
);
```

The same route exposes `GET /api/voice/ops-actions/history` and `/voice/ops-actions` so apps can show recent operator actions beside the action center. For HTML or HTMX pages, use `mountVoiceOpsActionHistory(...)` from `@absolutejs/voice/client`.

For HTML or HTMX pages:

```html
<div id="voice-ops-actions"></div>
<script type="module">
	import {
		createVoiceOpsActionCenterActions,
		mountVoiceOpsActionCenter
	} from '@absolutejs/voice/client';

	mountVoiceOpsActionCenter(document.querySelector('#voice-ops-actions'), {
		actions: createVoiceOpsActionCenterActions({
			providers: ['deepgram']
		})
	});
</script>
```

## Live Operator Workflows

Use live-ops primitives when an operator needs to intervene during an active session without taking voice orchestration out of your app. The supported actions are:

- `pause-assistant`: keep committing caller turns, but skip assistant generation.
- `resume-assistant`: let automation continue.
- `operator-takeover`: keep the session open while a human handles the caller.
- `inject-instruction`: add an operator instruction to the next assistant turn.
- `force-handoff`: mark the session for a specific handoff target.
- `escalate`, `assign`, `tag`, and `create-task`: record operational intent and make it auditable.

Mount the live-ops control routes beside your voice route:

```ts
import {
	createVoiceLiveOpsRoutes,
	createVoiceMemoryLiveOpsControlStore,
	voice
} from '@absolutejs/voice';
import { deepgram } from '@absolutejs/voice-deepgram';

const liveOps = createVoiceMemoryLiveOpsControlStore();

app
	.use(
		createVoiceLiveOpsRoutes({
			audit: runtimeStorage.audit,
			store: liveOps,
			trace: runtimeStorage.traces
		})
	)
	.use(
		voice({
			path: '/voice',
			liveOps: {
				getControl: (sessionId) => liveOps.get(sessionId)
			},
			session: runtimeStorage.session,
			stt: deepgram({ apiKey: process.env.DEEPGRAM_API_KEY! }),
			async onTurn({ turn }) {
				return { assistantText: `I heard: ${turn.text}` };
			},
			onComplete: async () => {}
		})
	);
```

The default route accepts `POST /api/voice/live-ops/action`:

```ts
await fetch('/api/voice/live-ops/action', {
	body: JSON.stringify({
		action: 'pause-assistant',
		assignee: 'operator-123',
		detail: 'Caller is upset; pause automation while support reviews.',
		sessionId: 'session-123',
		tag: 'priority-support'
	}),
	headers: { 'content-type': 'application/json' },
	method: 'POST'
});
```

Every action updates the control store and can write both `operator.action` audit events and `operator.action` trace events. The voice runtime checks the control state before assistant generation. When `assistantPaused` or `operatorTakeover` is active, it commits the user transcript, records a skipped-turn trace, and does not call the assistant. When `injectedInstruction` is present, the next assistant turn receives that instruction.

The safe operator runbook is:

1. Open the session's operations record or trace timeline before intervening.
2. Use `pause-assistant` when the bot should stop responding but the transcript should continue.
3. Use `inject-instruction` when the bot should continue with human guidance, such as "apologize and offer transfer."
4. Use `operator-takeover` when a human is now handling the caller and automation must stay silent.
5. Use `force-handoff` or `escalate` when the session needs a specialist, supervisor, or external queue.
6. Use `resume-assistant` only after the operator has verified the session state and any handoff context.
7. Review `/api/voice/live-ops/control/:sessionId`, `/voice-operations/:sessionId`, `/api/voice/ops-actions/history`, or `/audit` when you need proof of who intervened and why.

Framework and HTML clients can run the same actions without a custom dashboard:

```tsx
import { useVoiceLiveOps } from '@absolutejs/voice/react';

export function LiveOperatorPanel({ sessionId }: { sessionId: string }) {
	const liveOps = useVoiceLiveOps();

	return (
		<button
			onClick={() =>
				liveOps.run({
					action: 'operator-takeover',
					assignee: 'operator-123',
					detail: 'Human support took over the call.',
					sessionId,
					tag: 'human-takeover'
				})
			}
		>
			Take over
		</button>
	);
}
```

For HTML or HTMX pages:

```html
<absolute-voice-live-ops session-id="session-123"></absolute-voice-live-ops>
<script type="module">
	import { defineVoiceLiveOpsElement } from '@absolutejs/voice/client';
	defineVoiceLiveOpsElement();
</script>
```

Live-ops is intentionally a primitive layer: the package records controls, audit evidence, and trace evidence, while your app decides which operators are allowed to run actions and how those controls appear in the product UI.

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
	agents: [supportAgent, billingAgent],
	contextPolicy: ({ summaryMessage, turn }) => ({
		messages: [
			summaryMessage,
			{
				content: turn.text,
				role: 'user'
			}
		],
		metadata: {
			contextPolicy: 'handoff-summary-and-current-turn'
		},
		system: 'Use only the handoff summary and current caller turn.'
	}),
	handoffPolicy: ({ handoff }) => {
		if (handoff.targetAgentId === 'billing') {
			return {
				summary: 'Route verified billing requests to the billing specialist.',
				metadata: { queue: 'billing' }
			};
		}

		return {
			allow: false,
			reason: `No approved route for ${handoff.targetAgentId}.`,
			escalate: { reason: 'unsupported-specialist' }
		};
	}
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

For production call centers, pass `handoffPolicy` to keep routing code-owned instead of dashboard-owned. The policy can allow a handoff, reroute it to a different specialist, merge handoff metadata, summarize the reason for the target agent, or block the handoff and return an escalation. Squad traces mark each handoff as `allowed`, `blocked`, `unknown-target`, or `max-exceeded`, so support teams can audit why a caller moved between specialists.

Pass `contextPolicy` when a specialist should receive a controlled context window. The default behavior preserves the accumulated conversation plus a system handoff summary. A context policy can trim that to a handoff summary and current turn, add a specialist-specific system prompt, or attach metadata that appears in the returned squad state. This is the code-owned equivalent of Vapi Squads context controls: the app decides what each specialist sees, and `agent.context` traces show whether default or custom context was applied.

Each specialist owns its own `tools`, so tool permissions stay explicit per agent. For example, support can have `lookup_order`, billing can have `refund_invoice`, and scheduling can have `book_appointment`. The squad only routes; it does not give every specialist every tool by default.

Make the current specialist visible in your UI by mounting trace timelines and using the squad status primitives. They derive current specialist state from `agent.handoff`, `agent.context`, `agent.model`, and `agent.result` traces, so the UI stays tied to the same proof source used by readiness and operations records.

```tsx
import { VoiceAgentSquadStatus } from '@absolutejs/voice/react';

export function SpecialistBadge({ sessionId }: { sessionId: string }) {
	return (
		<VoiceAgentSquadStatus
			path="/api/voice-traces"
			sessionId={sessionId}
			title="Current specialist"
		/>
	);
}
```

Framework equivalents are available without a dashboard:

```ts
import { useVoiceAgentSquadStatus } from '@absolutejs/voice/vue';
import { createVoiceAgentSquadStatus } from '@absolutejs/voice/svelte';
import { VoiceAgentSquadStatusService } from '@absolutejs/voice/angular';
```

For HTML or HTMX pages:

```html
<absolute-voice-agent-squad-status
	path="/api/voice-traces"
	session-id="session-123"
	title="Current specialist"
></absolute-voice-agent-squad-status>
<script type="module">
	import { defineVoiceAgentSquadStatusElement } from '@absolutejs/voice/client';
	defineVoiceAgentSquadStatusElement();
</script>
```

Use `runVoiceAgentSquadContract(...)` in tests or readiness checks when you need proof that a specialist graph still routes correctly:

```ts
import {
	createVoiceMemoryTraceEventStore,
	runVoiceAgentSquadContract
} from '@absolutejs/voice';

const trace = createVoiceMemoryTraceEventStore();
const frontDesk = createVoiceAgentSquad({
	id: 'front-desk',
	defaultAgentId: 'support',
	agents: [supportAgent, billingAgent],
	trace
});

const report = await runVoiceAgentSquadContract({
	context: {},
	squad: frontDesk,
	trace,
	contract: {
		id: 'billing-route',
		scenarioId: 'billing-route',
		turns: [
			{
				text: 'I have a billing question.',
				expect: {
					finalAgentId: 'billing',
					outcome: 'assistant',
					assistantIncludes: ['billing'],
					handoffs: [
						{
							fromAgentId: 'support',
							targetAgentId: 'billing',
							status: 'allowed'
						}
					]
				}
			}
		]
	}
});

if (!report.pass) {
	throw new Error(report.issues.map((issue) => issue.message).join('\n'));
}
```

## Traces And Replay

Use trace stores when you want every call to be inspectable outside a hosted platform. Trace events are append-only records for model passes, tool calls, handoffs, agent results, call lifecycle, turn timing, errors, and cost telemetry.

```ts
import {
	buildVoiceTraceReplay,
	buildVoiceAuditExport,
	createVoiceAuditHTTPSink,
	createVoiceAuditLogger,
	createVoiceAuditSinkDeliveryWorker,
	createVoiceAuditSinkStore,
	createVoiceAuditTrailRoutes,
	createVoiceAgent,
	createVoiceFileRuntimeStorage,
	createVoiceRedisTaskLeaseCoordinator,
	createVoiceTraceDeliveryRoutes,
	createVoiceTraceHTTPSink,
	createVoiceTraceSinkStore,
	createVoiceTraceSinkDeliveryWorker,
	buildVoiceDataRetentionPlan,
	exportVoiceTrace,
	applyVoiceDataRetentionPolicy,
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
const auditStore = createVoiceAuditSinkStore({
	store: runtimeStorage.audit,
	deliveryQueue: runtimeStorage.auditDeliveries,
	sinks: [
		createVoiceAuditHTTPSink({
			id: 'security-warehouse',
			signingSecret: process.env.VOICE_AUDIT_SINK_SECRET,
			url: process.env.VOICE_AUDIT_SINK_URL!
		})
	]
});
const audit = createVoiceAuditLogger(auditStore);
const auditSinkWorker = createVoiceAuditSinkDeliveryWorker({
	deliveries: runtimeStorage.auditDeliveries,
	leases: redisLeases,
	sinks: [
		createVoiceAuditHTTPSink({
			id: 'security-warehouse',
			signingSecret: process.env.VOICE_AUDIT_SINK_SECRET,
			url: process.env.VOICE_AUDIT_SINK_URL!
		})
	],
	workerId: 'audit-sink-worker'
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
	audit,
	auditProvider: 'openai',
	auditModel: 'gpt-4.1',
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
app.use(
	createVoiceAuditTrailRoutes({
		store: runtimeStorage.audit
	})
);
app.use(
	createVoiceTraceDeliveryRoutes({
		store: runtimeStorage.traceDeliveries,
		worker: traceSinkWorker
	})
);

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

await audit.operatorAction({
	action: 'review.approve',
	actor: { id: 'operator-123', kind: 'operator' },
	resource: { id: 'review-123', type: 'review' }
});
```

`createVoiceMemoryTraceEventStore(...)`, `createVoiceFileTraceEventStore(...)`, `createVoiceSQLiteTraceEventStore(...)`, and `createVoicePostgresTraceEventStore(...)` all implement the same `VoiceTraceEventStore` contract. File, SQLite, and Postgres runtime storage expose `runtimeStorage.traces` and `runtimeStorage.traceDeliveries` alongside sessions, reviews, tasks, events, and external object mappings. Passing `trace` to `voice(...)` records session lifecycle, transcript, committed-turn, assistant, cost, and error events; passing it to agents records model passes, tools, results, and handoffs.

For self-hosted QA and support workflows, use `summarizeVoiceTrace(...)`, `evaluateVoiceTrace(...)`, `renderVoiceTraceMarkdown(...)`, `renderVoiceTraceHTML(...)`, or `buildVoiceTraceReplay(...)`. They turn raw trace events into portable artifacts you can attach to tickets, inspect locally, or fail in CI when a call has missing transcripts, missing turns, tool errors, session errors, or excessive handoffs.

For observability pipelines, wrap any trace store with `createVoiceTraceSinkStore(...)` and pass sinks such as `createVoiceTraceHTTPSink(...)`. The wrapper still writes to your normal file, SQLite, or Postgres store, then fans out appended events to your warehouse, logs, S3 bridge, or analytics endpoint. Use `awaitDelivery: true` only when you want trace delivery to block append completion. For durable delivery, pass `deliveryQueue` and run `createVoiceTraceSinkDeliveryWorker(...)` or `createVoiceTraceSinkDeliveryWorkerLoop(...)`; the worker uses the same Redis lease/idempotency primitives as ops workers and supports retries plus dead-letter stores. Mount `createVoiceTraceDeliveryRoutes({ store: runtimeStorage.traceDeliveries, worker })` to expose `/traces/deliveries`, `/api/voice-trace-deliveries`, and an explicit `POST /api/voice-trace-deliveries/drain` retry path.

When traces may leave your private runtime, pass `redact: true` or a redaction config to `exportVoiceTrace(...)`, `renderVoiceTraceMarkdown(...)`, `renderVoiceTraceHTML(...)`, or `buildVoiceTraceReplay(...)`. The built-in redactor scrubs common email addresses, phone numbers, and sensitive keys like `token`, `secret`, `password`, `apiKey`, `authorization`, `phone`, and `email`; you can pass custom keys or replacement text for stricter policies.

For retention jobs, `pruneVoiceTraceEvents(...)` works against any trace store. Use `dryRun: true` before deleting, filter by session, trace, scenario, turn, or event type, cap each run with `limit`, or keep only the newest N matching events with `keepNewest`.

For whole-runtime data control, use `buildVoiceDataRetentionPlan(...)` first and then `applyVoiceDataRetentionPolicy(...)` when the deletion set is correct. The policy works across stores exposed by file, SQLite, or Postgres runtime storage, including sessions, traces, trace deliveries, audit deliveries, reviews, ops tasks, integration events, and campaigns. A cutoff or per-scope `keepNewest` selector is required before anything is deleted, so an empty policy reports skipped scopes instead of wiping data.

```ts
const plan = await buildVoiceDataRetentionPlan({
	before: Date.now() - 30 * 24 * 60 * 60 * 1000,
	...runtimeStorage
});

console.log(plan.scopes);

await applyVoiceDataRetentionPolicy({
	audit: runtimeStorage.audit,
	before: Date.now() - 30 * 24 * 60 * 60 * 1000,
	...runtimeStorage
});
```

For a compliance-facing control surface, mount `createVoiceDataControlRoutes(...)`. It packages the same primitives into a self-hosted report for customer-owned storage, retention dry-runs, guarded deletion, redacted audit export, zero-retention mode, and provider-key handling.

```ts
import {
	createVoiceDataControlRoutes,
	createVoiceZeroRetentionPolicy,
	voiceComplianceRedactionDefaults
} from '@absolutejs/voice';

app.use(
	createVoiceDataControlRoutes({
		...runtimeStorage,
		audit: runtimeStorage.audit,
		auditDeliveries: runtimeStorage.auditDeliveries,
		path: '/data-control',
		redact: voiceComplianceRedactionDefaults,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);

const zeroRetentionPlan = await buildVoiceDataRetentionPlan(
	createVoiceZeroRetentionPolicy({
		...runtimeStorage,
		audit: runtimeStorage.audit,
		auditDeliveries: runtimeStorage.auditDeliveries,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);
```

Mounted routes:

- `GET /data-control`: HTML compliance/data-control report.
- `GET /data-control.json`: JSON report with redaction, storage, retention plan, audit export, and provider-key recommendations.
- `GET /data-control.md`: Markdown report for release/security reviews.
- `POST /data-control/retention/plan`: dry-run deletion proof from a JSON policy body.
- `POST /data-control/retention/apply`: applies retention only when the body includes `confirm: "apply-retention-policy"`.
- `GET /data-control/audit.json`, `/data-control/audit.md`, `/data-control/audit.html`: redacted audit exports.

`createVoiceZeroRetentionPolicy(...)` intentionally defaults to `dryRun: true`; callers must explicitly apply the generated policy after reviewing the deletion proof. This gives compliance-sensitive deployments a concrete zero-retention recipe without making accidental deletion easy.

### Compliance Recipes

These are recipes, not compliance certifications. AbsoluteJS Voice gives you the self-hosted controls and proof surfaces; your legal/security team still owns the actual HIPAA, SOC 2, GDPR, or customer-contract process.

Zero-retention sensitive call:

```ts
const policy = createVoiceZeroRetentionPolicy({
	...runtimeStorage,
	audit: runtimeStorage.audit,
	auditDeliveries: runtimeStorage.auditDeliveries,
	traceDeliveries: runtimeStorage.traceDeliveries
});

const dryRun = await buildVoiceDataRetentionPlan(policy);
if (dryRun.deletedCount > 0) {
	await applyVoiceDataRetentionPolicy({
		...policy,
		dryRun: false
	});
}
```

This removes sessions, traces, reviews, tasks, integration events, campaigns, incident bundles, and delivery queues that match the policy selectors. The generated policy starts as a dry run so a zero-retention mode cannot accidentally wipe data without explicit application.

Redacted support export:

```ts
const auditExport = await exportVoiceAuditTrail({
	redact: voiceComplianceRedactionDefaults,
	store: runtimeStorage.audit
});
const auditMarkdown = renderVoiceAuditMarkdown(auditExport.events);

const traceMarkdown = renderVoiceTraceMarkdown(events, {
	redact: voiceComplianceRedactionDefaults
});
```

Use this for support tickets, customer escalations, incident reviews, or vendor handoffs where transcripts, tool payloads, provider metadata, or audit events may contain personal data.

Customer-owned storage:

```ts
const runtimeStorage = createVoicePostgresRuntimeStorage({
	connectionString: process.env.DATABASE_URL!,
	schemaName: 'voice_ops',
	tablePrefix: 'support'
});

app.use(
	createVoiceDataControlRoutes({
		...runtimeStorage,
		audit: runtimeStorage.audit,
		auditDeliveries: runtimeStorage.auditDeliveries,
		redact: voiceComplianceRedactionDefaults,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);
```

Use file storage for local demos, SQLite for small self-hosted installs, Postgres for production app-owned records, and S3 delivery for exported audit/trace evidence. The important point is that sessions, traces, reviews, tasks, campaigns, audit, and delivery queues remain in infrastructure the app owner controls.

Deploy gate for compliance evidence:

```ts
app.use(
	createVoiceProductionReadinessRoutes({
		audit: {
			require: [
				{ type: 'provider.call' },
				{ type: 'operator.action' },
				{ type: 'retention.policy', maxAgeMs: 7 * 24 * 60 * 60 * 1000 }
			],
			store: runtimeStorage.audit
		},
		auditDeliveries: runtimeStorage.auditDeliveries,
		traceDeliveries: runtimeStorage.traceDeliveries,
		store: runtimeStorage.traces
	})
);
```

This makes provider-call audit evidence, operator interventions, recent retention-policy proof, and export-queue health part of release readiness instead of a manual dashboard check.

Use `createVoiceAuditLogger(...)` when you need append-only compliance evidence outside call traces. The logger records provider calls, tool calls, handoffs, retention runs, and operator actions into `runtimeStorage.audit`, so self-hosted teams can prove who changed what, which provider ran, which tool fired, and what data-control policy deleted.

Pass `audit` directly to `createVoiceAgent(...)` to record model calls as provider-call audit events and tool executions as tool-call audit events. Pass it to `createVoiceAgentSquad(...)` to record squad handoffs automatically. Use `auditProvider` and `auditModel` on agents when you want readiness and compliance reports to show the actual model provider instead of the agent id.

For compliance pipelines, wrap any audit store with `createVoiceAuditSinkStore(...)` and pass sinks such as `createVoiceAuditHTTPSink(...)`. Audit sinks redact by default, support HMAC signing, retries, event-type filters, optional blocking delivery, durable delivery queues through `runtimeStorage.auditDeliveries`, and background workers through `createVoiceAuditSinkDeliveryWorker(...)` or `createVoiceAuditSinkDeliveryWorkerLoop(...)`. File, SQLite, and Postgres runtime storage all expose `auditDeliveries`, so teams can ship evidence to a SIEM, warehouse, or internal security service without a hosted dashboard. Mount `createVoiceAuditDeliveryRoutes({ store: runtimeStorage.auditDeliveries, worker })` to expose `/audit/deliveries`, `/api/voice-audit-deliveries`, and an explicit `POST /api/voice-audit-deliveries/drain` retry path.

Pass `audit: runtimeStorage.audit` into production readiness when audit coverage should block deploys. By default readiness requires provider-call, retention-policy, and operator-action audit evidence; retention-policy evidence must be from the last 7 days so a stale one-time audit event does not certify an active retention job. Override required event types or freshness with `audit: { store: runtimeStorage.audit, require: [{ type: 'retention.policy', maxAgeMs: ... }] }` when a deployment has different compliance gates. Pass `auditDeliveries: runtimeStorage.auditDeliveries` and `traceDeliveries: runtimeStorage.traceDeliveries` when sink export health should also block deploys; failed or dead-lettered deliveries fail readiness, pending deliveries warn, and pending deliveries older than the configured fail window fail readiness.

Mount `createVoiceAuditTrailRoutes(...)` to expose `/api/voice-audit` and `/audit` over the same store. File, SQLite, and Postgres runtime storage all expose `runtimeStorage.audit`. The JSON and HTML surfaces support filters like `type`, `outcome`, `actorId`, `resourceType`, `resourceId`, `sessionId`, `traceId`, and `limit`, so operators can search audit evidence without writing a custom viewer first.

Use `exportVoiceAuditTrail(...)` or `buildVoiceAuditExport(...)` when audit evidence needs to leave the app. Pass `redact: true` to scrub sensitive keys plus common email and phone patterns from payloads and metadata before generating JSON, Markdown, or HTML. Audit trail routes also expose redacted exports at `/api/voice-audit/export`, `/api/voice-audit/export?format=markdown`, `/api/voice-audit/export?format=html`, and `/audit/export`; export routes redact by default unless `redact=false` is passed.

## Operations Records And Recovery

Use operations records as the default support/debug entrypoint. A hosted platform would send an operator to a call log; AbsoluteJS Voice gives the same workflow as a code-owned route:

```ts
app.use(
	createVoiceOperationsRecordRoutes({
		audit: runtimeStorage.audit,
		htmlPath: '/voice-operations/:sessionId',
		path: '/api/voice-operations/:sessionId',
		store: runtimeStorage.traces
	})
);
```

`createVoiceOperationsRecordRoutes(...)` links the call/session timeline, transcript, replay, provider decisions, tools, handoffs, guardrail decisions, audit, reviews, ops tasks, integration events, and sink delivery attempts into one debuggable object. Provider decisions include both older provider-routing events and explicit `provider.decision` traces, so the call log can show the surface, selected provider, fallback provider, recovery status, fallback/degradation counts, and human-readable reason for each runtime choice. Use `/voice-operations/:sessionId` as the first place to investigate failed calls, blocked assistant output, blocked tool payloads, provider failures, handoff failures, slow turns, and campaign attempts. The same mount also exposes incident handoff Markdown at `/voice-operations/:sessionId/incident.md` and `/api/voice-operations/:sessionId/incident.md` for support tooling, including provider-decision recovery summaries and an `assistant.guardrail` blocked-stage summary when those trace events exist.

Use `evaluateVoiceOperationsRecordProviderRecovery(...)` or `assertVoiceOperationsRecordProviderRecovery(...)` when proof packs should fail unless the operation record contains concrete provider recovery evidence:

```ts
assertVoiceOperationsRecordProviderRecovery(record, {
	recoveryStatus: 'degraded',
	minFallbacks: 1,
	minDegraded: 1,
	requiredStatuses: ['fallback', 'degraded'],
	requiredSurfaces: ['live-call'],
	requiredReasonIncludes: ['latency budget']
});
```

Use `evaluateVoiceOperationsRecordGuardrails(...)` when a proof pack or deploy gate needs JSON evidence that guardrails actually ran, blocked the expected stages, and produced named proofs/rule IDs. Use `assertVoiceOperationsRecordGuardrails(...)` in tests or smoke scripts when missing guardrail evidence should fail fast:

```ts
const report = assertVoiceOperationsRecordGuardrails(record, {
	minBlocked: 1,
	proofs: ['live-guardrails-runtime'],
	ruleIds: ['support.no-medical-advice'],
	stages: ['assistant-output', 'tool-input']
});
```

Most proof surfaces can link to the same record by passing an operations-record URL template such as `/voice-operations/:sessionId`. Use that template anywhere a report emits session-level failures: production readiness, ops recovery, trace timelines, session lists, reviews, campaign attempts, eval reports, simulation-suite actions, tool-contract cases, and outcome-contract matched sessions. The goal is that no operator has to guess which trace, review, task, or delivery queue belongs to the failing call.

If a customer asks for "the call log," send the operations-record URL. If engineering needs reproducible context, send the incident Markdown URL. If a deploy gate fails, start at readiness or ops recovery and follow the linked operations record instead of searching storage manually.

Mount `createVoiceOpsRecoveryRoutes(...)` beside it when operators need one deploy-checkable recovery signal:

```ts
app.use(
	createVoiceOpsRecoveryRoutes({
		auditDeliveries: runtimeStorage.auditDeliveries,
		handoffDeliveries,
		links: {
			operationsRecords: '/voice-operations/:sessionId',
			traceDeliveries: '/traces/deliveries'
		},
		traceDeliveries: runtimeStorage.traceDeliveries,
		traces: runtimeStorage.traces
	})
);
```

The recovery report summarizes recovered provider fallback, unresolved provider failures, audit/trace delivery backlog, handoff delivery backlog, operator interventions, failed sessions, and latency SLO issues. When `operationsRecords` is configured, provider and latency recovery issues link directly to the impacted operations record instead of a generic dashboard.

Pass the same report into production readiness to make recovery issues a deploy gate:

```ts
const opsRecovery = await buildVoiceOpsRecoveryReport({
	links: { operationsRecords: '/voice-operations/:sessionId' },
	traces: runtimeStorage.traces
});

app.use(
	createVoiceProductionReadinessRoutes({
		links: {
			operationsRecords: '/voice-operations/:sessionId',
			opsRecovery: '/ops-recovery'
		},
		opsRecovery,
		store: runtimeStorage.traces
	})
);
```

Readiness emits the stable `voice.readiness.ops_recovery` gate code when unresolved recovery issues remain.

## Customer-Owned Observability Export

Use observability exports when a buyer wants the hosted-dashboard evidence graph, but inside their own storage, warehouse, SIEM, incident flow, or release notes. The export manifest links traces, audits, operations records, delivery queues, provider SLOs, readiness reports, screenshots, and proof-pack artifacts without making AbsoluteJS Voice the dashboard.

Every export manifest and artifact index includes a stable schema contract:

```ts
import {
	assertVoiceObservabilityExportSchema,
	validateVoiceObservabilityExportRecord,
	voiceObservabilityExportSchemaId,
	voiceObservabilityExportSchemaVersion
} from '@absolutejs/voice';

assertVoiceObservabilityExportSchema(exportReport);
const validation = validateVoiceObservabilityExportRecord(exportReport);
if (!validation.ok) {
	throw new Error(validation.issues.map((issue) => issue.message).join('\n'));
}
console.log(voiceObservabilityExportSchemaId, voiceObservabilityExportSchemaVersion);
```

Use `validateVoiceObservabilityExportRecord(...)` or `assertVoiceObservabilityExportRecord(...)` when reading customer-owned records back from SQLite, Postgres, S3, a webhook collector, a warehouse, or a SIEM. The validator accepts manifests, artifact indexes, delivery reports, delivery receipts, delivery histories, and database payload records, then checks the stable schema id/version plus the minimum shape required for safe ingestion.

Use `evaluateVoicePlatformCoverage(...)` or `assertVoicePlatformCoverage(...)` when the product needs a structured "Vapi replacement surface coverage" gate. The assertion checks required buyer surfaces, evidence artifact names, total surface count, and failed-surface count:

```ts
const coverage = buildVoicePlatformCoverageSummary({
	coverage: latestProofPack.vapiCoverage,
	runId: latestProofPack.runId
});

assertVoicePlatformCoverage(coverage, {
	minSurfaces: 12,
	requiredEvidence: ['productionReadiness', 'operationsRecord', 'providerSlo'],
	requiredSurfaces: ['Web voice assistant', 'Call logs and incident handoff']
});
```

Use `replayVoiceObservabilityExport(...)` when you need to prove an already-delivered evidence bundle is still usable:

```ts
import { replayVoiceObservabilityExport } from '@absolutejs/voice';

const replay = await replayVoiceObservabilityExport({
	kind: 'sqlite',
	path: '.voice-runtime/observability-exports.sqlite',
	runId: '2026-04-29T17-20-51.032Z',
	tableName: 'voice_observability_exports'
});

if (replay.status !== 'pass') {
	console.error(replay.issues);
}
```

Replay sources support supplied records plus file, S3, SQLite, and Postgres delivery targets. The replay report re-validates the manifest/index/database payload, counts artifacts and delivery destinations, flags failed artifacts or destinations, and gives a readiness-style `pass`, `warn`, or `fail` result for customer-owned evidence pipelines.

```ts
import {
	buildVoiceObservabilityExport,
	createVoiceFileObservabilityExportDeliveryReceiptStore,
	createVoiceObservabilityExportRoutes,
	createVoiceObservabilityExportReplayRoutes
} from '@absolutejs/voice';

const observabilityReceipts =
	createVoiceFileObservabilityExportDeliveryReceiptStore({
		directory: '.voice-runtime/observability-export-receipts'
	});

app.use(
	createVoiceObservabilityExportRoutes({
		artifactIntegrity: {
			maxAgeMs: 15 * 60 * 1000
		},
		deliveryDestinations: [
			{
				directory: '.voice-runtime/observability-exports',
				kind: 'file',
				label: 'Local customer-owned observability archive'
			},
			{
				bucket: process.env.VOICE_OBSERVABILITY_EXPORT_S3_BUCKET,
				keyPrefix: 'voice/observability-exports',
				kind: 's3',
				label: 'S3 customer-owned observability archive'
			},
			{
				kind: 'sqlite',
				path: '.voice-runtime/observability-exports.sqlite',
				tableName: 'voice_observability_exports',
				label: 'SQLite customer-owned observability warehouse'
			},
			{
				connectionString: process.env.VOICE_OBSERVABILITY_EXPORT_POSTGRES_URL,
				kind: 'postgres',
				schemaName: 'voice',
				tableName: 'observability_exports',
				label: 'Postgres customer-owned observability warehouse'
			}
		],
		deliveryReceipts: observabilityReceipts,
		artifacts: [
			{
				id: 'latest-proof-pack',
				kind: 'proof-pack',
				label: 'Latest proof pack',
				path: '.voice-runtime/proof-pack/latest.md',
				required: true
			}
		],
		audit: runtimeStorage.audit,
		auditDeliveries: runtimeStorage.auditDeliveries,
		links: {
			operationsRecord: (sessionId) => `/voice-operations/${sessionId}`
		},
		redact: true,
		store: runtimeStorage.traces,
		traceDeliveries: runtimeStorage.traceDeliveries
	})
);

app.use(
	createVoiceObservabilityExportReplayRoutes({
		source: async () => ({
			kind: 'sqlite',
			path: '.voice-runtime/observability-exports.sqlite',
			runId: 'latest-proof-pack',
			tableName: 'voice_observability_exports'
		})
	})
);

const exportReport = await buildVoiceObservabilityExport({
	artifactIntegrity: {
		maxAgeMs: 15 * 60 * 1000
	},
	audit: runtimeStorage.audit,
	auditDeliveries: runtimeStorage.auditDeliveries,
	links: {
		operationsRecord: (sessionId) => `/voice-operations/${sessionId}`
	},
	redact: true,
	store: runtimeStorage.traces,
	traceDeliveries: runtimeStorage.traceDeliveries
});
```

The route helper exposes JSON at `/api/voice/observability-export`, an artifact index at `/api/voice/observability-export/artifacts`, per-artifact downloads at `/api/voice/observability-export/artifacts/:artifactId`, delivery at `POST /api/voice/observability-export/deliveries`, delivery history at `GET /api/voice/observability-export/deliveries`, Markdown at `/voice/observability-export.md`, and HTML at `/voice/observability-export`. `createVoiceObservabilityExportReplayRoutes(...)` adds JSON replay proof at `/api/voice/observability-export/replay` and a readable replay proof page at `/voice/observability-export/replay`. Path-backed artifacts are hashed with SHA-256 by default, include byte size and freshness metadata, and can fail the export when required evidence is missing or stale. File delivery writes `manifest.json`, `artifact-index.json`, and artifact files into a customer-owned archive directory; webhook delivery posts the manifest and artifact index to a buyer-owned collector, SIEM bridge, or warehouse endpoint; S3 delivery writes the same manifest, index, and artifact files through Bun's native S3 client; SQLite and Postgres delivery persist the schema id/version, manifest, artifact index, checksum metadata, status, run id, and timestamps into buyer-owned database tables. Delivery receipt stores persist run id, destinations, status, schema, and target history so operators can prove exports have been continuously healthy. Failed trace/audit deliveries fail the export report, pending deliveries warn, and every trace/audit envelope includes the linked operations-record URL when one is configured. This is the primitive to use when customers ask how voice evidence leaves the app without going through a hosted vendor dashboard.

Pass the same report into production readiness when export health should block deploys:

```ts
const observabilityExportDeliveryReceipts =
	createVoiceFileObservabilityExportDeliveryReceiptStore({
		directory: '.voice-runtime/observability-export-receipts'
	});

app.use(
	createVoiceProductionReadinessRoutes({
		links: {
			observabilityExport: '/voice/observability-export',
			observabilityExportDeliveries:
				'/api/voice/observability-export/deliveries'
		},
		observabilityExport: exportReport,
		observabilityExportDeliveryHistory: {
			failOnMissing: true,
			failOnStale: true,
			maxAgeMs: 60 * 60 * 1000,
			store: observabilityExportDeliveryReceipts
		},
		observabilityExportReplay: {
			kind: 'sqlite',
			path: '.voice-runtime/observability-exports.sqlite',
			runId: 'latest-proof-pack',
			tableName: 'voice_observability_exports'
		},
		store: runtimeStorage.traces
	})
);
```

Readiness adds `Observability export`, `Observability export delivery`, and `Observability export replay` checks. Failed export manifests fail the deploy gate, delivery receipt history can fail or warn when no successful delivery exists or the latest success is older than your configured freshness window, and replay health can fail the gate when customer-owned evidence cannot be read back cleanly from file, S3, SQLite, or Postgres.

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

## Realtime Adapter Packages

Use realtime adapter packages when you want direct speech-to-speech output paths for live smoke tests, duplex benchmarks, or custom realtime orchestration. Core owns the `RealtimeAdapter` contract and `voice({ realtime })` orchestration path; provider protocol code lives in adapter packages such as `@absolutejs/voice-openai` and `@absolutejs/voice-gemini`.

```ts
import { voice } from '@absolutejs/voice';
import { openai } from '@absolutejs/voice-openai';
import { runTTSAdapterFixture } from '@absolutejs/voice/testing';

const realtime = openai({
	apiKey: process.env.OPENAI_API_KEY!,
	instructions: 'Answer in one concise sentence.',
	model: 'gpt-realtime',
	voice: 'marin'
});

app.use(
	voice({
		path: '/voice',
		realtime,
		realtimeInputFormat: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 24000
		},
		session,
		onTurn: async ({ turn }) => ({
			assistantText: `You said: ${turn.text}`
		}),
		onComplete: async () => {}
	})
);

const report = await runTTSAdapterFixture(
	realtime,
	{
		id: 'openai-realtime-smoke',
		text: 'Say exactly: AbsoluteJS realtime is online.',
		title: 'OpenAI Realtime smoke'
	},
	{
		realtimeFormat: {
			channels: 1,
			container: 'raw',
			encoding: 'pcm_s16le',
			sampleRateHz: 24000
		}
	}
);
```

For server-to-server use, realtime adapters open provider-specific streaming connections, send session configuration, stream text or PCM input, and emit normalized transcript/audio/error/close events. OpenAI Realtime uses raw 24kHz mono `pcm_s16le` audio. The main `voice(...)` route can run in cascaded mode with `stt` plus optional `tts`, or direct realtime mode with `realtime`. Browser demos should make sure the captured PCM format matches `realtimeInputFormat` or resample before sending audio.

Use `createVoiceRealtimeProviderContractMatrixPreset(...)` to prove which realtime providers are production-ready. Native media-pipeline primitives such as `VoiceMediaFrame` and `buildVoiceMediaPipelineCalibrationReport(...)` are the path for advanced pipeline behavior in AbsoluteJS apps.

```ts
import {
	createVoiceRealtimeProviderContractMatrixPreset,
	createVoiceRealtimeProviderContractRoutes
} from '@absolutejs/voice';

app.use(
	createVoiceRealtimeProviderContractRoutes({
		matrix: createVoiceRealtimeProviderContractMatrixPreset({
			env: process.env,
			fallbackProviders: {
				'gemini-live': ['openai-realtime'],
				'openai-realtime': ['gemini-live']
			},
			latencyBudgets: {
				'gemini-live': 900,
				'openai-realtime': 800
			},
			selected: 'openai-realtime'
		})
	})
);
```

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

Use `createVoiceProviderOrchestrationProfile(...)` when one app has multiple provider surfaces with different tradeoffs. This is the Vapi-style "choose providers without glue" layer, but still code-owned: a live call can prefer low latency with a circuit breaker, while a background summary can prefer lower cost and stricter budget caps.

```ts
import {
	createVoiceProviderOrchestrationProfile,
	createVoiceProviderRouter
} from '@absolutejs/voice';

const providerProfile = createVoiceProviderOrchestrationProfile({
	id: 'support-agent-providers',
	defaultSurface: 'live-call',
	surfaces: {
		'live-call': {
			policy: 'latency-first',
			fallback: ['openai', 'anthropic', 'gemini'],
			maxLatencyMs: 900,
			providerHealth: {
				failureThreshold: 1,
				cooldownMs: 30_000,
				rateLimitCooldownMs: 120_000
			},
			providerProfiles: {
				openai: { cost: 6, latencyMs: 650, quality: 0.92, timeoutMs: 3500 },
				anthropic: { cost: 7, latencyMs: 850, quality: 0.95, timeoutMs: 4500 },
				gemini: { cost: 2, latencyMs: 700, quality: 0.86, timeoutMs: 3500 }
			}
		},
		'background-summary': {
			policy: 'cost-cap',
			fallback: ['gemini', 'openai'],
			maxCost: 3,
			minQuality: 0.82,
			providerProfiles: {
				openai: { cost: 6, latencyMs: 650, quality: 0.92 },
				gemini: { cost: 2, latencyMs: 700, quality: 0.86 }
			}
		}
	}
});

const liveModel = createVoiceProviderRouter({
	providers,
	orchestrationProfile: providerProfile,
	orchestrationSurface: 'live-call'
});

const summaryModel = createVoiceProviderRouter({
	providers,
	orchestrationProfile: providerProfile,
	orchestrationSurface: 'background-summary'
});
```

Mount `createVoiceProviderOrchestrationRoutes(...)` and pass the report into production readiness when provider policy should be deploy-gated. This proves that required surfaces have enough providers, explicit fallback order, circuit-breaker settings, timeout budgets, and cost/latency/quality bounds.

```ts
import {
	buildVoiceProviderOrchestrationReport,
	createVoiceProviderOrchestrationRoutes,
	createVoiceProductionReadinessRoutes
} from '@absolutejs/voice';

const providerOrchestration = () =>
	buildVoiceProviderOrchestrationReport({
		profile: providerProfile,
		requirements: {
			'live-call': {
				minProviders: 2,
				requireBudgetPolicy: true,
				requireCircuitBreaker: true,
				requireFallback: true,
				requireTimeoutBudget: true
			}
		}
	});

app
	.use(
		createVoiceProviderOrchestrationRoutes({
			profile: providerProfile,
			requirements: {
				'live-call': {
					minProviders: 2,
					requireBudgetPolicy: true,
					requireCircuitBreaker: true,
					requireFallback: true,
					requireTimeoutBudget: true
				}
			}
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			store: runtime.traces,
			providerOrchestration,
			links: {
				providerOrchestration: '/voice/provider-orchestration'
			}
		})
	);
```

Budget filters are strict. If you pass `maxCost`, `maxLatencyMs`, or `minQuality`, providers outside those limits are removed before ranking, even if they were selected by the request.

```ts
const policy = resolveVoiceProviderRoutingPolicyPreset('cost-cap', {
	maxCost: 3,
	minQuality: 0.82
});
```

Use `runVoiceProviderRoutingContract(...)` when provider fallback needs to be certified before production. The contract reads provider routing trace events and verifies the expected selected provider, fallback provider, status, and kind in order.

```ts
import { runVoiceProviderRoutingContract } from '@absolutejs/voice';

const report = await runVoiceProviderRoutingContract({
	store: runtime.traces,
	contract: {
		id: 'openai-to-anthropic-fallback',
		expect: [
			{
				kind: 'llm',
				provider: 'openai',
				selectedProvider: 'openai',
				fallbackProvider: 'anthropic',
				status: 'error'
			},
			{
				kind: 'llm',
				provider: 'anthropic',
				selectedProvider: 'openai',
				status: 'fallback'
			}
		]
	}
});

if (!report.pass) {
	throw new Error(report.issues.map((issue) => issue.message).join('\n'));
}
```

Pass provider routing contract reports into production readiness through `providerRoutingContracts`. Readiness fails when a fallback contract fails, so model-routing regressions become deploy blockers instead of dashboard-only surprises.

Use `createVoiceProviderSloRoutes(...)` when provider speed needs to be release evidence instead of a dashboard claim. The report reads the same provider routing trace events and checks LLM, STT, and TTS latency, p95 latency, timeout rate, fallback rate, and unresolved provider error rate.

```ts
import {
	createVoiceProviderSloRoutes,
	createVoiceProductionReadinessRoutes
} from '@absolutejs/voice';

const providerSlo = {
	requiredKinds: ['llm', 'stt', 'tts'],
	thresholds: {
		llm: { maxAverageElapsedMs: 2500, maxP95ElapsedMs: 4500 },
		stt: { maxAverageElapsedMs: 800, maxP95ElapsedMs: 1500 },
		tts: { maxAverageElapsedMs: 1200, maxP95ElapsedMs: 2200 }
	}
} as const;

app
	.use(
		createVoiceProviderSloRoutes({
			store: runtime.traces,
			...providerSlo
		})
	)
	.use(
		createVoiceProductionReadinessRoutes({
			store: runtime.traces,
			providerSlo,
			links: {
				providerSlo: '/voice/provider-slos'
			}
		})
	);
```

The provider SLO routes expose JSON at `/api/voice/provider-slos`, HTML at `/voice/provider-slos`, and Markdown at `/voice/provider-slos.md`. Readiness adds a `Provider SLO gates` check when `providerSlo` is configured; failing latency, timeout, fallback, or unresolved-error budgets close the deploy gate.

Use `evaluateVoiceProviderSloEvidence(...)` or `assertVoiceProviderSloEvidence(...)` when a proof pack needs to verify the JSON directly instead of scraping rendered HTML. The assertion can require LLM/STT/TTS evidence, latency samples, fallback events, named providers, and per-kind latency ceilings:

```ts
const providerReport = await buildVoiceProviderSloReport({
	requiredKinds: ['llm', 'stt', 'tts'],
	store: runtime.traces
});

assertVoiceProviderSloEvidence(providerReport, {
	fallbackKinds: ['llm'],
	maxP95ElapsedMs: { llm: 4500, stt: 1500, tts: 2200 },
	maxStatus: 'pass',
	minFallbacks: 1,
	minLatencySamples: 3,
	requiredKinds: ['llm', 'stt', 'tts'],
	requiredProviders: ['openai', 'anthropic', 'deepgram']
});
```

Use `createVoiceProviderDecisionTraceEvent(...)` and `createVoiceProviderDecisionTraceRoutes(...)` when you need runtime proof for why a provider won, failed, was skipped, or recovered by fallback. This is the per-call decision trail behind provider orchestration: it can read explicit `provider.decision` trace events or normalize existing provider routing events.

```ts
import {
	createVoiceProviderDecisionTraceEvent,
	createVoiceProviderDecisionTraceRoutes
} from '@absolutejs/voice';

await traces.append(
	createVoiceProviderDecisionTraceEvent({
		provider: 'deepgram',
		selectedProvider: 'assemblyai',
		fallbackProvider: 'assemblyai',
		status: 'fallback',
		surface: 'live-stt',
		reason: 'Deepgram timed out, AssemblyAI recovered the live STT turn.'
	})
);

app.use(
	createVoiceProviderDecisionTraceRoutes({
		store: traces,
		requiredSurfaces: ['live-call', 'live-stt', 'telephony-tts']
	})
);
```

The routes expose JSON at `/api/voice/provider-decisions`, HTML at `/voice/provider-decisions`, and Markdown at `/voice/provider-decisions.md`. Use this next to provider SLOs when a customer asks not just "is fallback working?" but "why did the system choose this provider for this call?". For proof packs, gate fallback and degradation directly with `minFallbacks`, `minDegraded`, `requiredStatuses`, `requiredFallbackProviders`, and `requiredReasonIncludes` so deploy evidence fails when fallback behavior is missing or unexplained.

Use `createVoiceProviderContractMatrixPreset(...)` when you want readiness proof for the whole provider stack without hand-writing every LLM, STT, and TTS contract row. The preset stays primitive: you still own provider lists, selected providers, latency budgets, env, capabilities, and route mounting.

```ts
import {
	buildVoiceProviderContractMatrix,
	createVoiceProviderContractMatrixPreset,
	createVoiceProviderContractMatrixRoutes
} from '@absolutejs/voice';

const providerContracts = () =>
	createVoiceProviderContractMatrixPreset('phone-agent', {
		env: process.env,
		providers: {
			llm: ['openai', 'anthropic', 'gemini'],
			stt: ['deepgram', 'assemblyai'],
			tts: ['openai', 'emergency']
		},
		selected: {
			llm: 'openai',
			stt: 'deepgram',
			tts: 'openai'
		},
		latencyBudgets: {
			openai: 900,
			deepgram: 250,
			assemblyai: 900,
			emergency: 80
		},
		remediationHref: '/provider-contracts'
	});

const app = createVoiceProviderContractMatrixRoutes({
	htmlPath: '/provider-contracts',
	path: '/api/provider-contracts',
	load: () => buildVoiceProviderContractMatrix(providerContracts())
});
```

The preset maps common provider names to env checks, streaming defaults, fallback rows, and profile-required capabilities. Override `configured`, `capabilities`, `fallbackProviders`, or `streaming` whenever your deployment uses custom adapters or local fallbacks.

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

For browser/client proof, use `runVoiceReconnectContract(...)` or mount `createVoiceReconnectContractRoutes(...)` with captured reconnect snapshots. The contract verifies that a reconnect was observed, the stream resumed before exhaustion, and replayed state did not duplicate committed turn IDs.

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

### Browser Media Proof

If your app owns a browser `RTCPeerConnection`, pass it through `browserMedia` so AbsoluteJS can persist real `RTCPeerConnection.getStats()` evidence and feed production readiness. The default WebSocket microphone flow does not require this; this is for WebRTC voice surfaces where browser transport quality matters.

Server route setup:

```ts
import {
	createVoiceBrowserMediaRoutes,
	createVoiceProductionReadinessRoutes,
	getLatestVoiceBrowserMediaReport
} from '@absolutejs/voice';

app
	.use(createVoiceBrowserMediaRoutes({ store: runtime.traces }))
	.use(
		createVoiceProductionReadinessRoutes({
			browserMedia: () =>
				getLatestVoiceBrowserMediaReport({ store: runtime.traces }),
			links: {
				browserMedia: '/voice/browser-media'
			}
		})
	);
```

Shared stream options:

```ts
const browserMedia = {
	continuity: {
		maxGapMs: 7000,
		maxInboundPacketStallMs: 7000,
		maxOutboundPacketStallMs: 7000,
		requireInboundAudio: true,
		requireOutboundAudio: true
	},
	getPeerConnection: () => peerConnection,
	maxJitterMs: 30,
	maxPacketLossRatio: 0.02,
	maxRoundTripTimeMs: 250,
	requireConnectedCandidatePair: true,
	requireLiveAudioTrack: true
};
```

React:

```tsx
import { useRef } from 'react';
import { useVoiceStream } from '@absolutejs/voice/react';

export function WebRTCVoice() {
	const peerConnection = useRef<RTCPeerConnection | null>(null);
	const voice = useVoiceStream('/voice/support', {
		browserMedia: {
			...browserMedia,
			getPeerConnection: () => peerConnection.current
		}
	});

	return <button onClick={() => voice.close()}>End call</button>;
}
```

Vue:

```ts
import { shallowRef } from 'vue';
import { useVoiceStream } from '@absolutejs/voice/vue';

const peerConnection = shallowRef<RTCPeerConnection | null>(null);
const voice = useVoiceStream('/voice/support', {
	browserMedia: {
		...browserMedia,
		getPeerConnection: () => peerConnection.value
	}
});
```

Svelte:

```ts
import { createVoiceStream } from '@absolutejs/voice/svelte';

let peerConnection: RTCPeerConnection | null = null;
const voice = createVoiceStream('/voice/support', {
	browserMedia: {
		...browserMedia,
		getPeerConnection: () => peerConnection
	}
});
```

Angular:

```ts
import { Component, inject } from '@angular/core';
import { VoiceStreamService } from '@absolutejs/voice/angular';

@Component({
	selector: 'app-webrtc-voice',
	template: `<button type="button" (click)="stream.close()">End call</button>`
})
export class WebRTCVoiceComponent {
	private readonly voice = inject(VoiceStreamService);
	private peerConnection: RTCPeerConnection | null = null;

	readonly stream = this.voice.connect('/voice/support', {
		browserMedia: {
			...browserMedia,
			getPeerConnection: () => this.peerConnection
		}
	});
}
```

HTMX/plain browser:

```ts
import { createVoiceController } from '@absolutejs/voice/client';

const voice = createVoiceController('/voice/support', {
	browserMedia
});

voice.bindHTMX({ element: '#voice-htmx-sync' });
```
