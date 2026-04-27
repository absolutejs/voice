# AbsoluteJS Voice Market Plan

Last researched: April 27, 2026

## North Star

Make `@absolutejs/voice` the default voice layer for teams that run their own AbsoluteJS server and want production-grade voice agents without handing orchestration, traces, customer data, or per-minute platform margin to a hosted voice platform.

We are not trying to become hosted Vapi. We win by being the best self-hosted voice primitive layer: installable, framework-native, observable, provider-neutral, and production-certifiable inside the app a team already owns.

## Market Thesis

The market is splitting into three categories:

- Hosted voice-agent platforms: Vapi, Retell, Bland. They win on speed to launch, dashboards, phone-number provisioning, batch calls, and managed orchestration.
- Realtime infrastructure/frameworks: LiveKit Agents and Pipecat. They win on low-level media control, open frameworks, SIP/media infrastructure, and extensibility.
- Model/provider primitives: OpenAI Realtime, Deepgram Flux, ElevenLabs, AssemblyAI, and similar vendors. They win on model capability, but developers still need orchestration, persistence, routing, testing, and framework UX.

AbsoluteJS Voice should own the fourth lane: self-hosted production voice app primitives for full-stack web teams. That means the package should feel lower-level and less opinionated than Retell/Bland, but more complete and web-app-native than stitching together LiveKit/Pipecat/model APIs manually.

## Competitor Baseline

### Vapi

What Vapi is strong at:

- Developer-first hosted platform for voice agents that make and receive phone calls.
- Assistants and Squads for single-agent and multi-assistant orchestration.
- Phone and web call surfaces, tool integration, provider choice across STT/LLM/TTS, and hosted infrastructure.
- Public positioning around real-time conversations and sub-600ms response times.
- Current product updates include monitoring, issue detection, compliance modes, consolidated logs, and broad model/provider support.

What Vapi implies customers want:

- A quick API path from idea to phone/web voice agent.
- Multi-provider choice without writing adapter glue.
- Strong call observability, logs, and debugging.
- Agent handoff/composition primitives.
- Phone calls as a first-class surface, not an afterthought.

Our wedge against Vapi:

- Self-hosted orchestration, traces, and storage.
- No mandatory hosted voice platform fee.
- Deeper AbsoluteJS framework integration.
- First-class package primitives developers can inspect, extend, test, and own.
- Production-readiness and evals that run inside the customer's app.

### Retell AI

What Retell is strong at:

- Turnkey AI phone-agent platform for build, test, deploy, and monitor workflows.
- Strong call-center framing: inbound/outbound phone calls, SIP/custom telephony, webhooks, call analysis, simulation testing, batch calls, and templates.
- Usage-based pricing with advertised pay-as-you-go voice-agent minutes and included concurrency on self-serve plans.
- Enterprise positioning around HIPAA, SOC 2, GDPR, support, and dedicated infrastructure.

What Retell implies customers want:

- A dashboard-led workflow for non-framework teams.
- Batch outbound campaigns and call-center operations.
- Simulation testing before production.
- Compliance and enterprise procurement proof.

Our wedge against Retell:

- Less hosted lock-in and more app-level control.
- Framework-native voice UX instead of a platform-only call-center surface.
- Lower opinionation: primitives compose into a team's own product, not only a Retell-shaped workflow.

### Bland AI

What Bland is strong at:

- Enterprise AI phone calls, batch calls, conversational pathways, guardrails, voice cloning/voice controls, webhooks, post-call workflows, monitoring, and regression testing surfaces.
- Pricing and plan tiers built around connected minutes, transfer time, call caps, concurrency, and voice clones.
- Strong no-code/low-code builder story with pathways and guardrails.

What Bland implies customers want:

- Visual workflow control.
- Campaign scale.
- Guardrails and compliance monitoring.
- Easy webhook/action nodes.
- Post-call extraction and analytics.

Our wedge against Bland:

- Code-owned primitives instead of a builder-owned workflow.
- The app owns the data model, storage, and UI.
- Better fit for developers who want voice as part of a full-stack product rather than a separate call automation platform.

### LiveKit Agents

What LiveKit is strong at:

- Open-source agents framework plus production media infrastructure.
- SIP telephony, inbound/outbound calling, DTMF, SIP REFER, phone numbers, rooms, dispatch, and agent workers.
- TypeScript/Python agent support and a strong realtime media foundation.
- Built-in voice-agent observability, model plugins, turn detection, noise cancellation, and production deployment story.

What LiveKit implies customers want:

- Serious realtime media infrastructure.
- SIP/PSTN control.
- Deployment and scaling story for agents.
- Open framework credibility.

Our wedge against LiveKit:

- AbsoluteJS-specific full-stack integration.
- More app/business workflow primitives out of the box: sessions, reviews, tasks, handoffs, evals, readiness gates, and framework widgets.
- We should interoperate with LiveKit where it is the media layer instead of pretending to replace its entire media network.

### Pipecat

What Pipecat is strong at:

- Open-source Python framework for voice and multimodal agents.
- Pipeline orchestration across transports, STT, LLM, TTS, audio processing, and multimodal services.
- Broad provider integration story and claimed natural round-trip interaction targets around 500-800ms.
- Good fit for teams that want programmable voice pipelines and can run Python services.

What Pipecat implies customers want:

- Provider-neutral orchestration.
- Low-latency pipeline control.
- Extensibility across transports and models.
- Self-hosting optionality.

Our wedge against Pipecat:

- TypeScript/Bun/AbsoluteJS-native.
- Framework parity and app UI primitives.
- Business workflow/readiness/eval primitives bundled with the voice layer.

### OpenAI Realtime And Deepgram Flux

What provider primitives are strong at:

- OpenAI Realtime gives direct speech-to-speech and Realtime API building blocks, including production voice-agent features, tool use, multimodal input, and SIP support.
- Deepgram Flux focuses on model-integrated end-of-turn detection, configurable turn taking, low-latency EOU, eager events, interruptions, and transcript quality.

What they imply customers want:

- Native low-latency model capability.
- Better turn detection and interruption behavior.
- Less hand-rolled STT/LLM/TTS chaining when a direct realtime model is appropriate.

Our wedge:

- Treat providers as swappable execution engines, not the app architecture.
- Normalize traces, routing, fallbacks, evals, framework hooks, storage, handoffs, and production readiness around them.

## Where AbsoluteJS Voice Already Exceeds

We already have a real self-hosted primitive advantage in areas hosted platforms do not expose as code-owned package surfaces:

- Framework parity: React, Vue, Svelte, Angular, HTML, HTMX, and plain client primitives.
- App Kit: self-hosted ops console/status surfaces instead of a vendor dashboard dependency.
- Observability: trace events, trace timelines, diagnostics, trace sinks, delivery workers, redaction, and live browser latency traces.
- Readiness: production-readiness gates, provider health, provider capabilities, turn latency, turn quality, live latency, carrier matrix, handoff health, and app status.
- Evaluation: eval routes, scenario fixtures, baseline comparison, markdown/json benchmark outputs, fixture workflows, and scenario workflow contracts.
- Core workflow primitives: assistants, tools, tool contracts, workflow contracts, outcome contracts, ops tasks, reviews, handoffs, webhooks, and integration events.
- Provider neutrality: OpenAI, Anthropic, Gemini model adapters, STT routing, TTS routing, Deepgram and AssemblyAI STT adapters, OpenAI TTS primitive, and provider simulation controls.
- Storage and operations: file, SQLite, Postgres, Redis queue/idempotency/leases, S3 review storage, task workers, webhook workers, trace sink workers, and runtime storage helpers.
- Telephony primitives: Twilio, Telnyx, and Plivo routes/bridges, webhook verification, carrier matrix, telephony outcomes, response shaping, and handoff adapters.
- Domain adaptation: phrase hints, lexicons, deterministic correction, risk-tiered corrections, jargon benchmarks, and routing correction helpers.
- Proof surfaces: synthetic turn latency proof, live browser latency proof, persisted live latency events, and p50/p95 live latency trend routes.

This is a strong package surface. The issue is not lack of primitives. The issue is product cohesion, docs, proof, and a few missing high-value primitives that hosted platforms make obvious.

## Where We Still Lack

The biggest gaps versus Vapi/Retell/Bland are not raw code count. They are product completeness and obviousness:

- Fastest first success: hosted competitors can get a user to a phone-call agent quickly through a dashboard. Our install path needs a sharper "10 minutes to local web voice agent, 20 minutes to phone call" story.
- Phone-number and SIP setup: we have carrier primitives, but not a guided provisioning/setup flow comparable to hosted platforms.
- Batch outbound campaigns: Retell and Bland make batch calls obvious. We need primitives for campaign queues, rate limits, CSV/import mapping, call attempts, retries, and outcomes.
- Agent composition: Vapi Squads is a clear primitive. We have assistants/tools/handoffs, but need a first-class multi-agent/specialist transfer story.
- Visual/declared workflow story: Bland pathways and Retell flow agents are easy to understand. We should not ship a heavy builder, but we need code-first flow primitives and diagrams/docs.
- Simulation testing UX: we have evals/fixtures/contracts, but need a clearer "simulate this call flow before production" API and demo.
- Compliance proof: we have self-hosting and redaction primitives, but need explicit HIPAA/ZDR/data retention recipes and controls.
- Realtime/S2S provider integration: OpenAI Realtime and similar direct audio models should be first-class provider options, not just something users wire separately.
- Latency proof depth: we now have live p50/p95, but need provider-stage timing, SLO budgets, and release-gated latency regressions.
- Docs and examples: the package has many primitives, but buyers need opinionated paths by use case.
- Market-facing proof: we need benchmark artifacts and demo pages that show why a developer would choose this over Vapi-style hosted orchestration.

## Product Strategy

The winning position is:

`@absolutejs/voice` is the self-hosted voice operations layer for AbsoluteJS: voice sessions, provider routing, telephony, tools, traces, evals, handoffs, storage, and framework UI primitives in one package.

What we should avoid:

- Becoming a no-code builder.
- Shipping opinionated industry kits that narrow the core package.
- Chasing hosted phone-number infrastructure.
- Making unsupported claims about competitor accuracy or latency without saved artifacts.

What we should lean into:

- Primitives over platforms.
- Provider portability.
- Local ownership of customer data.
- Proof over marketing claims.
- Framework parity.
- Telephony and browser as equal first-class surfaces.
- Evals/readiness as a core feature, not a side script.

## Takeover Plan

### Phase 1: Make The Existing Power Obvious

Goal: convert the current large primitive surface into a clear product story.

Deliverables:

- Rewrite README around five installable paths:
  - browser voice agent
  - phone voice agent
  - production readiness/app kit
  - provider routing/fallbacks
  - evals/simulation
- Add a "Why not Vapi?" section focused on self-hosting, no platform fee, data ownership, code-owned primitives, and framework parity.
- Add a capabilities matrix for browser, telephony, providers, observability, evals, handoff, storage, and frameworks.
- Add a single `createVoiceProductionApp(...)` or documented recipe that wires the common primitives without hiding the lower-level APIs.
- Make `/live-latency`, `/turn-latency`, `/traces`, `/quality`, `/production-readiness`, and `/app-kit/status` part of the default recommended demo path.

Acceptance criteria:

- A new developer can identify the best starting path in under 60 seconds.
- The example app shows proof surfaces without hunting through routes.
- Docs make the self-hosted wedge explicit.

### Phase 2: First-Class Phone Agent Primitive

Goal: make "phone agent" feel as first-class as browser voice.

Deliverables:

- `createVoicePhoneAgent(...)` wrapper around carrier routes, telephony outcome policy, session correlation, handoff, trace, and review recording.
- Setup reports for Twilio, Telnyx, and Plivo that explain missing env/config with copy-pasteable next actions.
- Carrier smoke test runner that verifies webhook signing, media route shape, stream URL, and outcome mapping.
- Call lifecycle trace schema normalized across carriers:
  - ringing
  - answered
  - media-started
  - transcript
  - assistant-response
  - transfer
  - voicemail
  - no-answer
  - completed
  - failed
- Telephony docs for inbound, outbound, transfer, voicemail, no-answer, and human handoff.

Acceptance criteria:

- One primitive can mount a production-shaped phone agent.
- Carrier readiness explains exactly what is wrong before a live call.
- Phone traces are as easy to inspect as browser traces.

### Phase 3: Campaign And Batch Call Primitives

Goal: close the Retell/Bland outbound campaign gap without becoming a hosted dialer.

Deliverables:

- `createVoiceCampaign(...)` for batches, recipients, dynamic variables, attempt state, retries, rate limits, and outcomes.
- Storage interfaces for campaign, recipient, attempt, and result records.
- CSV/JSON import helper with validation and safe variable mapping.
- Campaign routes:
  - list campaigns
  - create campaign
  - enqueue recipients
  - pause/resume/cancel
  - inspect attempt outcomes
- Worker primitive for outbound attempt scheduling using existing Redis/task leases.
- Campaign eval fixture support to simulate attempts without dialing.

Acceptance criteria:

- AbsoluteJS can run a self-hosted outbound campaign through its own telephony provider.
- Campaign results write to reviews/tasks/integration events.
- No hosted platform is required for batch-call orchestration.

### Phase 4: Multi-Agent And Handoff Composition

Goal: answer Vapi Squads with code-owned agent composition.

Deliverables:

- `createVoiceAgentSquad(...)` should be documented and hardened as the main specialist orchestration primitive.
- Add policy-driven transfer between specialists:
  - preserve context
  - summarize handoff
  - emit handoff trace
  - optionally transfer to human/carrier
- Add squad contract tests for expected transfer behavior.
- Add framework-visible current-agent/specialist state.
- Add demo flow with intake -> support specialist -> scheduling specialist -> human handoff fallback.

Acceptance criteria:

- Multi-agent transfer is a documented first-class primitive.
- Trace timeline shows why and when the agent changed.
- Handoff summaries are testable and persisted.

### Phase 5: Realtime And Duplex Provider Layer

Goal: make modern speech-to-speech and full duplex models first-class while keeping cascaded STT/LLM/TTS paths.

Deliverables:

- Realtime adapter contract for direct audio-in/audio-out providers.
- OpenAI Realtime adapter path.
- Deepgram Flux turn-taking path documented as the lead cascaded STT route.
- Unified interruption events across cascaded and realtime modes.
- Client playback/listening state that works consistently across frameworks.
- Barge-in SLOs:
  - user speech detected
  - assistant audio canceled/ducked
  - new turn ownership committed
- Duplex benchmarks for browser and telephony surfaces.

Acceptance criteria:

- Developers can choose cascaded or realtime without rewriting app workflow code.
- Barge-in behavior is deterministic and benchmarked.
- Latency reports show provider-stage timing, not only aggregate latency.

### Phase 6: Simulation, Evals, And Certification

Goal: make production confidence a core product advantage.

Deliverables:

- `createVoiceSimulationSuite(...)` for simulated callers, expected outcomes, tool assertions, handoff assertions, and trace assertions.
- Scenario fixtures for browser, telephony, campaign, handoff, and multilingual flows.
- Baseline trend reports with pass/fail deltas against previous known-good runs.
- A release-gate script that runs typecheck, build, unit tests, live adapter tests where keys exist, smoke server, and selected eval suites.
- Markdown reports that can be copied into releases.

Acceptance criteria:

- Every major primitive has a simulation path.
- A team can prove a voice flow before live traffic.
- Benchmark/eval claims are backed by saved artifacts.

### Phase 7: Compliance And Data Control Recipes

Goal: convert self-hosting from an implicit advantage into an explicit buying reason.

Deliverables:

- Data-retention policies for sessions, traces, recordings/reviews, tasks, and integration events.
- Zero-retention recipe for sensitive calls.
- Redaction recipes for PII and secrets in traces/reviews.
- Audit log hooks for provider calls, tool calls, handoffs, and operator actions.
- Storage recipes:
  - SQLite local/dev
  - Postgres production
  - Redis workers/idempotency
  - S3 artifacts
- Security checklist for webhook signing, carrier signatures, env handling, and least-privilege provider keys.

Acceptance criteria:

- The docs explain how to run with customer-owned storage and retention.
- Sensitive data surfaces have clear redaction/deletion hooks.
- Compliance-sensitive users see a path without asking for a hosted mode.

### Phase 8: Framework Primitives Everywhere

Goal: no framework feels second-class.

Deliverables:

- Ensure React/Vue/Svelte/Angular/HTML/HTMX have primitives for:
  - start/stop microphone
  - connection/reconnect state
  - transcript partials and commits
  - assistant playback state
  - interruption
  - provider status
  - routing status
  - trace timeline
  - turn quality
  - turn latency
  - live latency
  - app kit status
- Add htmx/custom-element equivalents for the high-value widgets.
- Add parity tests or build-time checks to prevent Angular/HTMX regressions.

Acceptance criteria:

- The six-framework example remains feature-parity by design.
- Adding a new primitive includes a framework parity checklist.

## Winning Scorecard

We are ahead of Vapi-style hosted platforms for AbsoluteJS users when:

- A developer can add a browser voice agent and inspect traces/readiness in one install path.
- A developer can add a phone agent with Twilio/Telnyx/Plivo and get carrier readiness before live traffic.
- Provider routing, fallback, and model choice are app-owned and observable.
- Live latency, turn latency, turn quality, traces, and production readiness are visible by default.
- Multi-agent handoff and human handoff are testable and persisted.
- Campaign/batch call primitives exist for self-hosted outbound operations.
- Evals and simulations prove workflows before production.
- Storage, redaction, retention, and audit hooks are explicit.
- Every feature works across React, Vue, Svelte, Angular, HTML, and HTMX.
- The example app demonstrates the primitives without becoming the product.

## Immediate Backlog

### Tier 1: Highest Market Impact

- Document the current product surface as a self-hosted alternative to hosted voice platforms.
- Add `createVoicePhoneAgent(...)` as the obvious telephony entrypoint.
- Add live latency trend links/docs across App Kit and README.
- Harden `createVoiceAgentSquad(...)` docs/tests as the Vapi Squads answer.
- Add a simulation-suite primitive that wraps existing evals/contracts into one obvious API.

### Tier 2: Close Hosted Platform Gaps

- Add campaign/batch-call primitives.
- Add OpenAI Realtime adapter support.
- Add deeper barge-in/duplex benchmarks.
- Add compliance/data-retention recipes.
- Add campaign and phone-agent demo pages to the example app.

### Tier 3: Proof And Polish

- Add benchmark markdown artifacts for latency, telephony, STT, TTS, duplex, and campaigns.
- Add framework parity checks for new widgets/services.
- Add docs pages by use case instead of by internal module.
- Add source-backed market comparison docs with updated competitor notes.

## Source Notes

- Vapi docs: https://docs.vapi.ai/
- Vapi current updates: https://docs.vapi.ai/whats-new
- Retell docs: https://docs.retellai.com/
- Retell pricing: https://www.retellai.com/pricing
- Retell webhooks: https://docs.retellai.com/features/webhook
- Retell batch calls: https://docs.retellai.com/deploy/make-batch-call
- Bland billing/plans: https://docs.bland.ai/platform/billing
- Bland batch calls: https://docs.bland.ai/tutorials/batch-calls
- Bland webhooks: https://docs.bland.ai/tutorials/webhooks
- Bland public product page: https://www.bland.ai/
- LiveKit Agents: https://docs.livekit.io/agents/
- LiveKit telephony: https://docs.livekit.io/frontends/telephony/agents
- Pipecat overview: https://docs.pipecat.ai/overview/pipecat
- OpenAI Realtime announcement: https://openai.com/index/introducing-gpt-realtime
- OpenAI voice agents docs: https://platform.openai.com/docs/guides/voice-agents
- Deepgram Flux quickstart: https://developers.deepgram.com/docs/flux/quickstart
