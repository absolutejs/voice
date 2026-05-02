# AbsoluteJS Voice Market Plan

Last researched: May 2, 2026

## North Star

Make `@absolutejs/voice` the default voice layer for teams that run their own AbsoluteJS server and want production-grade voice agents without handing orchestration, traces, customer data, or per-minute platform margin to a hosted voice platform.

We are not trying to become hosted Vapi. We win by being the best self-hosted voice primitive layer: installable, framework-native, observable, provider-neutral, and production-certifiable inside the app a team already owns.

## Market Thesis

The market is splitting into three categories:

- Hosted voice-agent platforms: Vapi, Retell, Bland. They win on speed to launch, dashboards, phone-number provisioning, batch calls, and managed orchestration.
- Realtime infrastructure/frameworks: LiveKit Agents and Pipecat. They win on low-level media control, open frameworks, SIP/media infrastructure, and extensibility.
- Model/provider primitives: OpenAI Realtime, Deepgram Flux, ElevenLabs, AssemblyAI, and similar vendors. They win on model capability, but developers still need orchestration, persistence, routing, testing, and framework UX.

AbsoluteJS Voice should own the fourth lane: self-hosted production voice app primitives for full-stack web teams. That means the package should feel lower-level and less opinionated than Retell/Bland, but more complete and web-app-native than stitching together LiveKit/Pipecat/model APIs manually.

Package boundary:

- `@absolutejs/voice` owns voice-agent product primitives: assistants, tools, provider routing, telephony, traces, readiness, reviews, operations records, campaigns, post-call workflow, guardrails, framework bindings, and voice proof routes.
- `@absolutejs/media` owns generic realtime media primitives: media frames, transport lifecycle reports, processor graphs, calibration, resampling, VAD/speech segments, interruption reports, and future media quality/WebRTC/serializer work.
- `VOICE_PLAN.md` tracks what a voice buyer needs. `../media/MEDIA_PLAN.md` tracks the lower-level media roadmap that voice consumes.

## Competitor Baseline

### Vapi

What Vapi is strong at:

- Developer-first hosted platform for voice agents that make and receive phone calls.
- Assistants and Squads for single-agent and multi-assistant orchestration.
- Phone and web call surfaces, tool integration, provider choice across STT/LLM/TTS, and hosted infrastructure.
- Public positioning around real-time conversations and sub-600ms response times.
- Current docs emphasize monitoring with scheduled triggers, issues, notifier delivery through email/Slack/webhooks, call analysis, phone-number hooks, compliance modes, consolidated logs, and broad model/provider support.

What Vapi implies customers want:

- A quick API path from idea to phone/web voice agent.
- Multi-provider choice without writing adapter glue.
- Strong call observability, logs, and debugging.
- Agent handoff/composition primitives.
- Phone calls as a first-class surface, not an afterthought.
- Configurable monitors that turn call data into issues and notify the team without manual log review.

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

- Open-source Python framework for real-time voice and multimodal agents. Its public README positions it around audio/video orchestration, AI services, transports, and conversation pipelines.
- Pipeline orchestration is the product center. Current docs define `Pipeline` as the component that connects frame processors in sequence, normally shaped as transport input -> STT -> context aggregation -> LLM -> TTS -> transport output -> assistant context aggregation.
- Frame and processor semantics are deeper than a simple event bus: frames include audio, text, image, system, context, control, error, interruption, and lifecycle classes; system frames bypass queues for immediate handling while data/control frames are queued and ordered.
- Transports are a first-class abstraction. Current docs list Daily, FastAPI WebSocket, HeyGen, LiveKit, SmallWebRTC, Tavus, WebSocket, WhatsApp, and telephony serializers for Twilio/Telnyx/Plivo/Exotel/Vonage.
- WebRTC/WebSocket guidance is explicit: WebRTC is recommended for browser/mobile real-time apps because of low latency, packet-loss resilience, audio processing, quality stats, timestamping, and reconnection; WebSocket is positioned for telephony, custom streams, prototyping, and server-to-server.
- Provider integration breadth is strong across STT, LLM, TTS, speech-to-speech, image, video, memory, vision, analytics, monitoring, frame processors, context utilities, metrics, observers, service switchers, and turn management.
- Ecosystem depth includes client SDKs, subagents, flows, UI kit, CLI, Pipecat Cloud deployment, Whisker debugger, and terminal dashboard.

Research sources:

- Pipecat pipeline docs: https://docs.pipecat.ai/pipecat/learn/pipeline
- Pipecat transport docs: https://docs.pipecat.ai/pipecat/learn/transports
- Pipecat supported services: https://docs.pipecat.ai/server/services/supported-services
- Pipecat GitHub README: https://github.com/pipecat-ai/pipecat

What Pipecat implies customers want:

- Provider-neutral orchestration.
- Low-latency pipeline control.
- Extensibility across transports and models.
- Self-hosting optionality.
- Ordered media frames, immediate control frames, processor composition, and lifecycle management.
- Same bot logic across browser, telephony, WebRTC, WebSocket, and provider-direct transports.
- Observable media quality, interruption, turn detection, and replay/debug tools.

Our wedge against Pipecat:

- TypeScript/Bun/AbsoluteJS-native.
- Framework parity and app UI primitives.
- Business workflow/readiness/eval primitives bundled with the voice layer.
- Roadmap intent: AbsoluteJS should own the common media-pipeline primitives that a self-hosted AbsoluteJS voice app needs, instead of treating Pipecat as a dependency or bridge target. The low-level primitives live in `@absolutejs/media`; voice owns the voice-specific proof, readiness, provider, telephony, and operations surfaces built on top.
- Code-owned operations record, readiness gates, monitor issues, provider decision traces, guardrails, post-call workflows, campaign primitives, and framework hooks/composables/services are already deeper for web-app teams than Pipecat's lower-level media focus.
- We should not ship a Pipecat bridge. We should replace app-level voice needs directly in `@absolutejs/voice` and replace media-runtime needs in `@absolutejs/media`.

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

- Framework parity: React, Vue, Svelte, Angular, HTML, HTMX, and plain client primitives, with a six-framework browser proof runner that forces reconnect/resume and rejects stale proof state.
- Primitive-first ops surfaces: self-hosted ops console, ops status, demo-ready, readiness, quality, eval, trace, handoff, and diagnostic routes instead of a vendor dashboard dependency.
- Observability: trace events, trace timelines, diagnostics, trace sinks, delivery workers, redaction, and live browser latency traces.
- Readiness: production-readiness gates, provider health, provider capabilities, turn latency, turn quality, live latency, carrier matrix, campaign readiness, handoff health, and app status.
- Evaluation: eval routes, scenario fixtures, baseline comparison, markdown/json benchmark outputs, fixture workflows, and scenario workflow contracts.
- Core workflow primitives: assistants, tools, tool contracts, workflow contracts, outcome contracts, ops tasks, reviews, handoffs, webhooks, and integration events.
- Provider neutrality: OpenAI, Anthropic, Gemini model adapters, STT routing, TTS routing, Deepgram and AssemblyAI STT adapters, OpenAI TTS primitive, realtime provider adapter packages (`@absolutejs/voice-openai` and `@absolutejs/voice-gemini`), provider contract matrices, and provider simulation controls.
- Recovered fallback semantics: provider errors that recover through fallback remain visible in replay, but do not fail session health or production readiness unless recovery fails.
- Storage and operations: file, SQLite, Postgres, Redis queue/idempotency/leases, S3 review storage, task workers, webhook workers, trace sink workers, and runtime storage helpers.
- Telephony primitives: Twilio, Telnyx, and Plivo routes/bridges, webhook verification, carrier webhook security reports/routes/readiness gates, carrier matrix, telephony outcomes, response shaping, and handoff adapters.
- Domain adaptation: phrase hints, lexicons, deterministic correction, risk-tiered corrections, jargon benchmarks, and routing correction helpers.
- Support/debugging primitives: session snapshots, linked debug artifacts, operations records, failure replay, incident Markdown, latest-session call debugger routes, call-debugger launch widgets, and React/Vue/Svelte/Angular/HTML/HTMX framework access to the latest support artifact.
- Proof surfaces: synthetic turn latency proof, live browser latency proof, persisted live latency events, p50/p95 live latency trend routes, reconnect recovery contracts, barge-in readiness proof, package-level platform coverage routes/widgets that map hosted-platform buyer needs to self-hosted evidence, production-readiness gate explanation assertions, framework readiness-gate screenshot proof, and `createVoiceProductionReadinessProofRuntime(...)` so stale local demo sessions do not pollute release evidence.
- Live operations intervention: operator action routes, action-center primitives, framework live-ops hooks/composables/services, runtime pause/resume/takeover controls, injected operator instructions, skipped-turn trace evidence, and package-level runtime proof in `test/liveOpsRuntime.test.ts`.

This is a strong package surface. The issue is not lack of primitives. The issue is product cohesion, docs, proof, and a few missing high-value primitives that hosted platforms make obvious.

## Where We Still Lack

The biggest gaps versus Vapi/Retell/Bland are not raw code count. They are product completeness and obviousness:

- Fastest first success: hosted competitors can get a user to a phone-call agent quickly through a dashboard. Our install path needs a sharper "10 minutes to local web voice agent, 20 minutes to phone call" story.
- Phone-number and SIP setup: we have carrier primitives, but not a guided provisioning/setup flow comparable to hosted platforms.
- Batch outbound campaigns: Retell and Bland make batch calls obvious. Campaign queues, CSV/JSON recipient import, consent validation, dedupe, attempts, retries, workers, pause/resume/cancel, rate limits, quiet hours, scheduled attempt windows, retry backoff, carrier outcomes, observability, carrier dry-run proof, campaign readiness proof, production-readiness integration, README path docs, and example readiness wiring now exist.
- Agent composition: Vapi Squads is a clear primitive. Agent Squad now has code-owned specialist routing, context control, handoff summaries, durable state, traces, and readiness contracts; the remaining gap is example/UI obviousness.
- Visual/declared workflow story: Bland pathways and Retell flow agents are easy to understand. We should not ship a heavy builder, but we need code-first flow primitives and diagrams/docs.
- Simulation testing UX: evals, fixtures, tool contracts, outcome contracts, baseline comparison, simulation-suite routes, and operations-record-linked failure actions now exist. The remaining gap is buyer-facing docs that make the simulation path obvious before production traffic.
- Compliance proof: self-hosted storage, redaction defaults, retention dry-runs, guarded deletion, zero-retention policy helper, redacted audit exports, data-control routes, provider-key recommendations, example/readiness wiring, and a compliance-sensitive workflow recipe now exist. The remaining gap is keeping compliance docs aligned with new storage/provider surfaces without claiming certification.
- Realtime/S2S provider integration: voice now owns the shared `RealtimeAdapter` contract, `voice(...)` orchestration path, realtime channel proof, realtime provider contract matrix, proof-trend runtime-channel evidence, and media proof routes that consume `@absolutejs/media` reports. Vendor protocol glue lives in adapter packages. `@absolutejs/voice@0.0.22-beta.337` consumes `@absolutejs/media@0.0.1-beta.7` media quality, browser WebRTC stats, browser WebRTC continuity, telephony media serializer reports, telephony start/media/stop lifecycle reports, runtime-channel trend samples, and provider/runtime recommendations in `/voice/media-pipeline`, `/voice/browser-media`, `/voice/telephony-media`, `/voice/proof-trend-recommendations`, Markdown/HTML where available, proof-pack assertions, production-readiness deploy gates, operations-record links for impacted sessions, and failure replay evidence for what failed or recovered and what the caller heard. Real browser `RTCPeerConnection.getStats()` collection exists in media, browser media persists as `client.browser_media`, and carrier bridges persist live inbound/outbound stream lifecycle envelopes as `client.telephony_media` so readiness and operations records can prefer real call evidence before deterministic proof envelopes.
- Reconnect proof: client reconnect state and replay-safe resume now have package contract/proof primitives via `runVoiceReconnectContract(...)`, `createVoiceReconnectContractRoutes(...)`, and `createVoiceReconnectProofRoutes(...)`, are accepted by production readiness, are wired into every framework example page, and have a parallel Playwright browser runner that proves HTML, React, Svelte, Vue, Angular, and HTMX all reconnect/resume against a fresh `absolute start` server. The remaining gap is broader production-traffic reconnect history, not framework parity.
- Recovery proof: provider fallback recovery is now part of session-health semantics and the unified ops/recovery report now surfaces recovered fallback counts, unresolved provider failures, delivery failures, handoff failures, live-ops interventions, failed sessions, SLO breaches, and operations-record links. Ops/recovery is wired into production readiness as a deploy gate.
- Live-ops intervention proof: pause/resume/takeover and injected operator instructions now affect the actual session runtime, not only UI/audit routes. README now documents safe live-operator workflows, route wiring, runtime control behavior, framework UI, and audit/trace proof.
- Fastest-first-success proof: README now includes a 10-minute browser-agent recipe and a 20-minute phone-agent recipe that mount the voice route plus operations records, trace/readiness proof, and phone smoke/setup surfaces without hiding primitives.
- Agent Squad visibility proof: React, Vue, Svelte, Angular, and HTML/client primitives now expose current specialist state from the trace timeline so apps can show Vapi Squads-style active specialist UI without a dashboard.
- Phone setup proof: `createVoicePhoneAgent(...)` setup JSON now includes copy-ready `setupInstructions` for answer/TwiML/TeXML URLs, status webhooks, media stream URLs, setup/smoke proof links, and contract issues, so users can build carrier setup UI without parsing HTML.
- Carrier webhook security proof: Twilio/Telnyx/Plivo webhook verification, replay protection, Twilio idempotency, persistent security stores, `/api/voice/telephony/webhook-security`, production-readiness gating, and phone-agent readiness-profile metadata are now package-level primitives as of `@absolutejs/voice@0.0.22-beta.277`.
- Compliance recipe proof: README now has explicit zero-retention, redacted support export, customer-owned storage, and deploy-gated compliance evidence recipes while clearly separating primitives from legal certification.
- Unified call-log and support-debug proof: the operations record now links trace, replay, provider events, transcript, provider decisions, tools, handoffs, audit, reviews, ops tasks, integration events, sink delivery attempts, telephony media stream lifecycle evidence, failure replay artifacts, and copyable incident Markdown. Session snapshots now expose linked debug artifacts, and `createVoiceCallDebuggerRoutes(...)` gives one latest-session support/debug surface with JSON, HTML, and incident Markdown. React, Vue, Svelte, Angular, HTML, and HTMX all have package-level call-debugger launch primitives. Readiness, ops recovery, evals, simulation suite, tool contracts, outcome contracts, trace timelines, sessions, campaign attempts, and example proof surfaces now link failures back to operations records or the call debugger.
- Latency proof depth: live p50/p95, provider-stage timings, turn waterfall timings, barge-in timings, SLO budgets, Markdown artifacts, provider SLO artifacts, readiness-gated provider latency/fallback/error budgets, proof-pack headline SLO numbers, screenshot artifacts, a long proof-window runner, sustained provider/runtime recommendation reports, provider-specific sustained comparison rows, benchmark-profile recommendation summaries, history-backed profile aggregation, and a real-call evidence runtime now exist. The remaining gap is wiring the runtime into broader real browser/phone traffic in the example and collecting longer proof windows, not inventing another deterministic proof format.
- Docs and examples: README now has explicit buyer paths, a capability matrix, support-triage, appointment-scheduling, campaign-outreach, meeting-recorder/browser-recorder, and compliance-sensitive workflow use-case recipes.
- Market-facing proof: README now has a proof-pack checklist and Vapi migration checklist that map hosted-dashboard buyer questions to concrete routes, reports, contracts, and exports. The package now exposes `createVoicePlatformCoverageRoutes(...)`, `createVoicePlatformCoverageStore(...)`, platform coverage assertions, production-readiness evidence assertions, browser widgets, React/Vue components, Svelte store support, and Angular service support for proof-backed hosted-platform replacement coverage. The example now generates current proof-pack numbers plus screenshot artifacts for production readiness, framework readiness-gate explanations, provider SLOs, proof trends with runtime-channel samples, simulation suite, operations records, post-call analysis, guardrails, failure replay, and switching-from-Vapi coverage. Customer-owned observability export now has schema validation, delivery, replay, readiness gating, and readable replay routes. Post-call analysis now has `buildVoicePostCallAnalysisReport(...)` and `createVoicePostCallAnalysisRoutes(...)` to validate extraction fields, required task creation, integration/webhook delivery, and operations-record links together. Guardrails now have `createVoiceGuardrailPolicy(...)`, `evaluateVoiceGuardrailPolicy(...)`, `createVoiceGuardrailRuntime(...)`, and `createVoiceGuardrailRoutes(...)` for code-owned live assistant/tool enforcement plus blocking/warning policy proof with trace evidence. Code-owned monitoring now has monitor definitions, run reports, durable issues, lifecycle actions, JSON/HTML/Markdown routes, notifier delivery receipts, webhook notifier helpers, scheduled monitor runner controls, and production-readiness gates as of `@absolutejs/voice@0.0.22-beta.280`. SLO calibration now has package primitives and routes as of `@absolutejs/voice@0.0.22-beta.281`. Provider orchestration profiles now exist as of `@absolutejs/voice@0.0.22-beta.292`, giving apps one code-owned provider graph with surface-specific cost/latency/quality routing, fallback order, circuit-breaker settings, timeout budgets, and provider profiles. Provider orchestration proof now exists as of `@absolutejs/voice@0.0.22-beta.293`, with report/routes/Markdown/HTML plus production-readiness gating for provider count, fallback order, circuit breakers, timeout budgets, and budget policy. Provider decision traces now exist as of `@absolutejs/voice@0.0.22-beta.294`, adding explicit `provider.decision` trace events plus report/routes/Markdown/HTML for why a provider was selected, skipped, failed, or recovered by fallback. Provider decision recovery is now visible in operations records and example proof-pack evidence. Competitive coverage/depth report primitives now exist to turn these surfaces into explicit advantage/parity/intentional-gap evidence, including failure replay as first-class evidence for what failed or recovered and what the caller heard. Proof trends now carry runtime-channel first-audio, jitter, timestamp-drift, backpressure, and interruption p95 evidence as of `@absolutejs/voice@0.0.22-beta.333`; SLO calibration consumes sustained interruption p95 directly from those artifacts. Provider/runtime recommendation primitives now exist as of `@absolutejs/voice@0.0.22-beta.337` through `buildVoiceProofTrendRecommendationReport(...)`, `renderVoiceProofTrendRecommendationMarkdown(...)`, `renderVoiceProofTrendRecommendationHTML(...)`, and `createVoiceProofTrendRecommendationRoutes(...)`, with optional provider comparison inputs, best-provider ranking, current-provider switch recommendations, and JSON/HTML/Markdown provider comparison tables. `@absolutejs/voice@0.0.22-beta.338` adds benchmark-profile recommendation rows so the same sustained trend artifact can prove profile-specific provider mixes for meeting recorder, support agent, appointment scheduler, noisy phone call, or app-defined profiles without turning the package into an app kit. `@absolutejs/voice@0.0.22-beta.340` adds `buildVoiceProofTrendProfileSummaries(...)` and `DEFAULT_VOICE_PROOF_TREND_PROFILE_DEFINITIONS` so apps can aggregate profile evidence across repeated proof-trend artifacts, include the current unprofiled run in existing profile history, and only fall back to deterministic derivation before real profile history exists. `@absolutejs/voice@0.0.22-beta.341` recomputes aggregated proof-profile status from latency, provider, and runtime budgets so stale failed profile rows cannot permanently poison otherwise passing sustained history. `@absolutejs/voice@0.0.22-beta.344` adds `buildVoiceProofTrendReportFromRealCallProfiles(...)` so app-owned browser or phone session evidence can be converted into the same profile-history artifact format as sustained proof trends. `@absolutejs/voice@0.0.22-beta.345` adds `buildVoiceBrowserCallProfileReport(...)`, `evaluateVoiceBrowserCallProfileEvidence(...)`, Markdown/HTML renderers, and `createVoiceBrowserCallProfileRoutes(...)` so real browser microphone/WebSocket framework parity is a package primitive instead of an example-only artifact. `@absolutejs/voice@0.0.22-beta.431` adds `buildVoiceOperationalStatusReport(...)`, `createVoiceOperationalStatusRoutes(...)`, and HTML/JSON operational status output that combines proof-pack freshness, delivery-runtime health, and production-readiness posture. `@absolutejs/voice@0.0.22-beta.432` adds `buildVoiceIncidentTimelineReport(...)`, `createVoiceIncidentTimelineRoutes(...)`, `renderVoiceIncidentTimelineHTML(...)`, and `renderVoiceIncidentTimelineMarkdown(...)`, turning operational status, ops recovery, monitor issues, operations records, and failure replay into one chronological triage surface. The voice example mounts `/api/voice/operational-status`, `/voice/operational-status`, `/api/voice/incident-timeline`, `/voice/incident-timeline`, and `/voice/incident-timeline.md`, and uses `@absolutejs/absolute@0.19.0-beta.816` with `"build": "absolute build"` passing. The example also has `bun run proof:long-window`, which runs sustained trends and the proof pack against a fresh isolated runtime by default and rejects stale outputs. `bun run proof:long-window` passed on April 30, 2026 at `.voice-runtime/long-proof-window/2026-04-30T14-26-10.991Z`, including provider comparison rows for `tts:openai`, `stt:deepgram`, and `llm:deterministic+openai`. The remaining gap is broader real-call benchmark history plus deeper incident action execution, not another dashboard surface.

## Latest Proof Status

Current verified proof: core `@absolutejs/voice@0.0.22-beta.452` and the voice example were verified on May 2, 2026.

Latest full proof-pack output remains `.voice-runtime/proof-pack/2026-04-30T15-34-16.230Z` from April 30, 2026. The May 2 verification covered the incident-timeline primitive, audited executable incident recovery actions, recovery outcome summaries, incident support/export artifacts, the operational-status primitive, the updated Absolute standalone build path, reconnect-proof routes accepted by production readiness, package-level `simulateDisconnect()` support across framework wrappers, HTMX production-bootstrap hardening, and a six-framework parallel browser reconnect proof. Rerun `bun run proof:pack:server` when a fresh end-to-end proof artifact is needed.

Verified:

- `@absolutejs/voice@0.0.22-beta.431` exposes `buildVoiceOperationalStatusReport(...)`, `renderVoiceOperationalStatusHTML(...)`, and `createVoiceOperationalStatusRoutes(...)`.
- Operational status combines proof-pack freshness, delivery runtime health, and production-readiness posture into one JSON/HTML surface with links back to the relevant proof routes.
- `@absolutejs/voice@0.0.22-beta.432` exposes `buildVoiceIncidentTimelineReport(...)`, `renderVoiceIncidentTimelineHTML(...)`, `renderVoiceIncidentTimelineMarkdown(...)`, and `createVoiceIncidentTimelineRoutes(...)`.
- Incident timeline combines operational status, ops recovery issues, monitor issues, operations records, and failure replay into one chronological JSON/HTML/Markdown triage surface.
- `@absolutejs/voice@0.0.22-beta.435` adds incident recovery action descriptors plus `GET /api/voice/incident-timeline/actions` and `POST /api/voice/incident-timeline/actions/:actionId` execution through app-supplied handlers, with optional operator-action audit/trace evidence that records before/after incident status.
- `@absolutejs/voice@0.0.22-beta.436` adds `buildVoiceIncidentRecoveryOutcomeReport(...)`, `renderVoiceIncidentRecoveryOutcomeHTML(...)`, `/api/voice/incident-timeline/recovery-outcomes`, and `/voice/incident-recovery-outcomes` so audited recovery actions are summarized as improved, unchanged, regressed, or failed.
- `@absolutejs/voice@0.0.22-beta.437` folds recovery outcomes into support/export artifacts: incident bundles can embed redacted recovery outcome summaries, and observability export manifests/indexes can include required incident-bundle and incident-recovery-outcome artifacts that gate export status when failed or regressed evidence is present.
- `@absolutejs/voice@0.0.22-beta.438` adds `buildVoiceIncidentRecoveryOutcomeReadinessCheck(...)` plus production-readiness `incidentRecoveryOutcomes` gating, so failed/regressed recovery outcomes can block deploys automatically.
- `@absolutejs/voice@0.0.22-beta.439` adds `buildVoiceIncidentRecoveryTrendReport(...)`, `renderVoiceIncidentRecoveryTrendHTML(...)`, `renderVoiceIncidentRecoveryTrendMarkdown(...)`, and incident-timeline trend routes for repeated recovery outcome reports so teams can prove recovery effectiveness over proof windows/releases.
- `@absolutejs/voice@0.0.22-beta.449` adds reconnect proof reports to production-readiness evidence so deploy gates can fail when reconnect/resume is not observed.
- `@absolutejs/voice@0.0.22-beta.450` embeds the HTMX browser bootstrap into the package build so production `absolute start` can serve the HTMX helper without depending on fragile filesystem resolution after server bundling.
- `@absolutejs/voice@0.0.22-beta.451` fixes optional HTMX selector handling so omitted optional selectors do not crash the browser bootstrap.
- `@absolutejs/voice@0.0.22-beta.452` adds real-call profile evidence generated from reconnect proof reports and SLO reconnect resume calibration from profile/trend history, so reconnect/resume proof now feeds both profile history and SLO budgets.
- The voice example installs `@absolutejs/voice@0.0.22-beta.452`, mounts `/api/voice/operational-status`, `/voice/operational-status`, `/api/voice/incident-timeline`, `/voice/incident-timeline`, and `/voice/incident-timeline.md`, wires safe handlers for delivery retry, proof rerun, readiness refresh, and support bundle generation, connects those actions to audit/trace stores, inherits recovery outcome and trend routes from the incident timeline primitive, installs `@absolutejs/absolute@0.19.0-beta.816`, defines `"build": "absolute build"`, and exposes `bun run proof:reconnect` for parallel browser reconnect proof across all six framework pages.
- Repository state is archived: `@absolutejs/voice` is pushed at `7989be5`, `@absolutejs/media` is pushed at `75a8022`, and `@absolutejs/voice-adapters` is pushed at `abda3b5` before the latest adapter metadata refresh.
- Adapter packages now live in the `https://github.com/absolutejs/voice-adapters.git` monorepo with package directories for AssemblyAI, Deepgram, ElevenLabs, Gemini, and OpenAI. Their package metadata targets `@absolutejs/voice@0.0.22-beta.452` so provider glue stays aligned with the current core primitive surface.
- `@absolutejs/voice@0.0.22-beta.453` adds `createVoiceSQLiteRealCallProfileEvidenceStore(...)`, `loadVoiceRealCallProfileEvidenceFromStore(...)`, and `buildVoiceRealCallProfileHistoryReportFromStore(...)`, giving apps a Bun-native SQLite persistence primitive for repeated real-call profile evidence before feeding history, recommendations, and readiness gates.
- `@absolutejs/voice@0.0.22-beta.455` adds `createVoiceRealCallEvidenceRuntime(...)`, `createVoiceRealCallEvidenceRuntimeRoutes(...)`, `renderVoiceRealCallEvidenceRuntimeHTML(...)`, and `renderVoiceRealCallEvidenceRuntimeMarkdown(...)`, giving apps a package-level runtime that collects trace/reconnect evidence into durable real-call profile history, dedupes repeated collection, and exposes rolling JSON/HTML/Markdown evidence for provider/profile recommendations.
- May 2 verification passed: core `bun test test/incidentTimeline.test.ts`, core `bun test ./test/reconnectContract.test.ts ./test/productionReadiness.test.ts`, core `bun run typecheck`, core `bun run build`, example `bun run typecheck`, example `bun run proof:reconnect htmx`, example `bun run proof:reconnect`, and example `bun run build`.
- The latest framework reconnect proof run started one fresh production server, opened `/html`, `/react`, `/svelte`, `/vue`, `/angular`, and `/htmx` in parallel, forced reconnect/resume from the browser UI, rejected stale proof state, and passed with `snapshotCount: 24`, `reconnected: true`, and `resumed: true`.
- Platform coverage passes across 13 hosted-platform replacement surfaces.
- Production readiness evidence assertion passes.
- Production readiness gate explanation assertion passes, including structured observed value, threshold, unit, remediation, and source link data for non-pass checks.
- Simulation suite, live ops evidence, data-control evidence, observability export/replay, post-call analysis, guardrails, provider SLO assertions, and provider/runtime recommendation assertions pass.
- Native media pipeline proof passes through `@absolutejs/media` primitives with connected transport and processor-graph evidence: 5 frames, 3 processor nodes, 5 processor output frames, 1 processor-dropped frame, 1 input transport frame, 1 output transport frame, 0 backpressure events, 420ms first audio, 12ms jitter, 1 VAD segment, and 1 interruption frame.
- Proof artifacts include production readiness, framework readiness gate explanations, provider SLOs, proof trends, provider/runtime recommendations, simulation suite, operations record, failure replay, post-call analysis, guardrails, media pipeline, browser WebRTC stats, and switching-from-Vapi.
- Proof runs use isolated `VOICE_DEMO_RUNTIME_DIR` runtime directories so stale local demo sessions do not pollute release proof.
- `@absolutejs/voice@0.0.22-beta.347` adds package-level real-call profile history reports/routes so repeated browser/phone evidence can roll up into provider/runtime recommendations by benchmark profile.
- `@absolutejs/voice@0.0.22-beta.367` adds `createVoiceProductionReadinessProofRuntime(...)`, giving apps a package-owned bounded proof store, proof-freshness gate, shared readiness cache, trace-window defaults, and synthetic provider/live-latency seed events without becoming an app kit. The voice example now uses that primitive for production-readiness JSON, HTML, gate, proof-pack, trend, provider SLO, and freshness evidence.
- `@absolutejs/voice@0.0.22-beta.368` adds `buildVoiceRealCallProfileEvidenceFromTraceEvents(...)` and `loadVoiceRealCallProfileEvidenceFromTraceStore(...)`, so ordinary persisted session/provider/live-latency/runtime/turn traces can become real-call benchmark profile history without app-specific glue.
- `@absolutejs/voice@0.0.22-beta.369` adds `createVoiceProfileTraceTagger(...)`, so apps can wrap any trace store and automatically stamp real sessions with benchmark profile metadata before profile-history ingestion.
- `@absolutejs/voice@0.0.22-beta.370` adds `buildVoiceRealCallProfileReadinessCheck(...)`, turning real-call profile history into a production-readiness gate for required profiles, cycles, actionable provider defaults, provider roles, and profile recommendation failures.
- `@absolutejs/voice@0.0.22-beta.371` adds `buildVoiceRealCallProfileRecoveryActions(...)`, so failed real-call profile gates can return exact operator actions for browser proof, phone proof, missing provider-role evidence, operations records, and production-readiness refresh.
- `@absolutejs/voice@0.0.22-beta.372` adds `createVoiceRealCallProfileRecoveryActionRoutes(...)`, making profile recovery actions executable through app-supplied safe POST handlers while preserving primitive ownership.
- `@absolutejs/voice@0.0.22-beta.373` adds `createVoiceInMemoryRealCallProfileRecoveryJobStore(...)` and async recovery action polling, so long-running proof repair can return `jobId`/`queued` immediately and expose job status at `/actions/:jobId`.
- `@absolutejs/voice@0.0.22-beta.374` adds `createVoiceSQLiteRealCallProfileRecoveryJobStore(...)`, giving recovery jobs a Bun-native persistent store for self-hosted ops history across restarts.
- `@absolutejs/voice@0.0.22-beta.375` keeps the SQLite recovery job store server-only at runtime so browser/client bundles do not statically import `bun:sqlite`.
- `@absolutejs/voice@0.0.22-beta.376` adds optional recovery job history listing and `GET /actions/jobs`, so persisted proof repair runs are inspectable without copying job IDs.
- `@absolutejs/voice@0.0.22-beta.377` adds `buildVoiceRealCallProfileRecoveryJobHistoryCheck(...)`, making persisted recovery job history part of production readiness instead of only a side UI.
- `@absolutejs/voice@0.0.22-beta.378` adds `buildVoiceReadinessRecoveryActions(...)`, turning failed/warn readiness checks into a normalized recovery action plan for UI/API surfaces.
- `@absolutejs/voice@0.0.22-beta.379` adds `createVoiceRealCallProfileTraceCollector(...)`, making ordinary profiled trace traffic self-reporting for real-call profile evidence/history instead of requiring app-specific trace-store loading glue.
- `@absolutejs/voice@0.0.22-beta.380` deepens real-call profile readiness with per-profile cycle/session counts and required surface evidence, so readiness can warn or fail when a claimed profile lacks enough browser, phone, or live traffic proof.
- `@absolutejs/voice@0.0.22-beta.381` maps those per-profile depth gaps into executable profile-proof recovery actions, not just warning text.
- `@absolutejs/voice@0.0.22-beta.382` makes those recovery actions profile-targeted by carrying `profileId` in action hrefs and handler input, closing the detection -> targeted proof run loop.
- `@absolutejs/voice@0.0.22-beta.383` marks profile-proof recovery actions as POST actions so readiness recovery UIs can run them directly instead of opening proof surfaces.
- `@absolutejs/voice@0.0.22-beta.431` adds the operational-status surface that buyers expect from hosted dashboards, but as app-owned routes and reports.
- `@absolutejs/voice@0.0.22-beta.432` adds the incident timeline/operational triage surface that answers what changed recently, which calls were affected, what failed or recovered, and where to investigate next.
- `@absolutejs/voice@0.0.22-beta.435` adds executable incident recovery actions without owning the recovery workflow; apps provide the safe handlers, and the package can record operator-action audit/trace evidence.
- `@absolutejs/voice@0.0.22-beta.436` adds recovery outcome summaries so incident actions can be judged by status impact instead of only execution success.
- `@absolutejs/voice@0.0.22-beta.437` makes those outcomes portable by embedding them in incident bundles and customer-owned observability export artifacts.
- `@absolutejs/voice@0.0.22-beta.438` makes those outcomes deploy-gatable through production-readiness checks and gate explanations.
- `@absolutejs/voice@0.0.22-beta.439` turns repeated outcome reports into recovery effectiveness trend history with improvement, unchanged, regression, and failure rates.
- `@absolutejs/voice@0.0.22-beta.440` adds production-readiness trend SLO checks (`incidentRecoveryTrendSLO`) so release readiness can enforce minimum improvement and maximum regression/failure/unchanged rates over trend windows.

Recent package/example proof has moved provider orchestration from "primitive exists" to "buyer-visible evidence exists": provider orchestration reports, provider decision traces, fallback recovery, and operations-record provider recovery evidence are now part of the proof story.

Next core-product wedge: real-call evidence breadth. Recovery trend SLO budgeting is now implemented and enforced in production readiness for minimum improvement and maximum regression/failure/unchanged rates. Next, we should increase telephony/browser/reconnect real-call evidence breadth so recommendations and trends are rooted in broader production traffic.

## Competitive Coverage And Depth Scorecard

Current Vapi-style surface coverage estimate: **99.8%** for a self-hosted AbsoluteJS buyer.

Current broader voice-agent market coverage estimate: **94-96%** across Vapi, Retell, Bland, LiveKit Agents, Pipecat, and direct provider primitives.

The Vapi-style number is higher because the buyer profile is narrower and aligned with our lane: a team running its own AbsoluteJS server that wants browser agents, phone agents, provider choice, tools, Squads-style composition, observability, monitoring, call analysis, simulations, campaigns, data control, and deploy proof without a hosted voice platform. The broader-market number stays lower because LiveKit-grade SIP/media infrastructure, hosted phone-number provisioning, managed dashboards, no-code builders, compliance certifications, and Pipecat-grade media processor ecosystems are not fully owned yet.

Depth levels:

- `Advantage`: AbsoluteJS Voice does more for the self-hosted/code-owned buyer than the hosted competitor surface.
- `Parity`: AbsoluteJS Voice covers the surface well, but competitors have comparable or more polished product UX.
- `Covered`: AbsoluteJS Voice has the primitive/proof, but buyer-facing ergonomics or docs still need tightening.
- `Intentional gap`: not part of our core product lane; expose integration seams instead.

| Buyer surface | Current coverage | Depth vs Vapi-style buyer | Why we win or lag | Next move |
| --- | --- | --- | --- | --- |
| Browser voice agent | Covered | Advantage | Framework hooks/composables/services/widgets, reconnect, barge-in, trace timelines, live latency, and readiness proof are app-native instead of widget-only. The example now proves HTML, React, Svelte, Vue, Angular, and HTMX reconnect/resume in parallel against a fresh production server. | Keep first-success docs and examples current as primitives evolve; expand from demo proof to broader real-call profile history. |
| Phone voice agent | Covered | Parity | Carrier bridges, webhook security, phone setup reports, smoke proof, and outcome normalization exist, but hosted platforms still win on click-to-buy-number provisioning. | Improve setup proof and carrier config UX without owning phone-number infrastructure. |
| Multi-assistant/Squads workflows | Covered | Parity to advantage | Code-owned specialist routing, context policy, handoff summaries, durable squad state, traces, readiness contracts, and framework specialist state answer Vapi Squads directly. Vapi still has a clearer hosted mental model. | Keep squad examples and operations-record links obvious. |
| Tools and business actions | Covered | Advantage | Tool contracts, workflow/outcome contracts, audit hooks, ops tasks, integration events, and operations-record-linked failures are stronger for code-owned apps. | Expand real-session proof examples for common tool workflows. |
| Guardrails and policy enforcement | Covered | Advantage | Guardrails are code-owned runtime policies with blocking/warning proof, trace evidence, incident summaries, and readiness/proof-pack integration. | Keep buyer recipes focused; avoid becoming a no-code policy builder. |
| Provider choice and fallback | Covered | Advantage | Provider profiles, cost/latency/quality routing, circuit breakers, provider SLOs, decision traces, fallback recovery, operations-record recovery evidence, and failure replay are now first-class. | Keep provider recovery and caller-heard replay visible in proof-pack artifacts. |
| Monitoring, issues, notifiers | Covered | Advantage | Monitor definitions, scheduled runners, durable issues, lifecycle actions, notifier receipts, readiness gates, and ops recovery are customer-owned. | Continue tightening export/schema/readiness cohesion. |
| Unified call log / operations record | Covered | Advantage | Operations records link trace, replay, transcript, provider decisions, tools, guardrails, handoffs, audit, reviews, tasks, delivery attempts, telephony media lifecycle evidence, failure replay, and incident Markdown. | Keep every new proof surface linking back to operations records and failure replay where caller-heard context matters. |
| Post-call analysis and workflows | Covered | Parity | Extraction/task/delivery proof exists and is operations-record-linked. Hosted products still have a smoother dashboard-attached call-record UX. | Add more workflow recipes and proof-pack examples. |
| Simulation and regression testing | Covered | Advantage | Evals, fixtures, simulations, baseline comparison, operation-linked failures, and readiness gates live in the repo and CI path. | Make scenario authoring easier without creating an opinionated app kit. |
| Outbound campaigns | Covered | Parity | Campaign queues, import, consent, dedupe, retries, quiet hours, carrier dry-runs, and readiness proof exist. Bland/Retell still have stronger dashboard-led campaign UX. | Improve primitives/docs; do not build a hosted dialer dashboard. |
| Live operator controls | Covered | Advantage | Runtime pause/resume/takeover, injected instructions, action center primitives, audit/trace evidence, and framework integrations are code-owned. | Keep live-ops evidence visible in all framework examples. |
| Customer-owned observability export | Covered | Advantage | Export/replay, schema validation, delivery, redaction, readiness gating, and operations-record links support SIEM/warehouse ownership. | Make export manifests the default release/incident artifact. |
| Compliance and data control | Covered | Advantage for self-hosted buyers | Retention, redaction, zero-retention helpers, guarded deletion, customer storage, audit export, and provider-key guidance exist. Hosted competitors may still win procurement with certifications. | Keep docs precise; never imply certification. |
| Latency, interruption, reconnect confidence | Covered | Advantage | Live p50/p95, provider-stage timings, barge-in, reconnect contracts/proof routes, long-window proof, runtime-channel trend samples, SLO artifacts, readiness gates, and six-framework browser reconnect proof exist. Competitors still market raw latency numbers aggressively, but our proof is code-owned and reproducible. | Build broader real-call benchmark history and tune defaults from repeated runs. |
| Direct realtime/duplex providers | Covered | Parity | Core `RealtimeAdapter` contract plus `@absolutejs/voice-openai` and `@absolutejs/voice-gemini` adapter packages exist; example provider-contract proof shows OpenAI and Gemini passing. Runtime-channel proof trends now track first audio, interruption p95, jitter, drift, and backpressure. Cascaded STT/LLM/TTS remains strong. | Improve browser format negotiation and provider stream evidence. |
| No-code visual builder | Intentional gap | Lag by design | Bland/Retell/Vapi-style visual flows are not our lane. We should provide code-first flow primitives, diagrams, and recipes. | Avoid app kits; add lightweight diagrams/docs only. |
| Hosted phone-number provisioning | Intentional gap | Lag by design | Vapi/LiveKit Cloud can provision/manage numbers in hosted dashboards. AbsoluteJS should guide carrier setup and verify config, not become a telco platform. | Keep setup reports copy-ready and adapter-friendly. |
| Native media pipeline / Pipecat-style orchestration | Partial | Covered, lagging Pipecat depth | `@absolutejs/media` owns generic frames, calibration, VAD/interruption reports, processor graphs, transport lifecycle reports, and WebRTC stats normalization; `@absolutejs/voice` owns voice proof routes and readiness gates that consume them. Pipecat still has a deeper transport catalog, service ecosystem, runners, SDKs, and debugger surfaces. | Track low-level work in `../media/MEDIA_PLAN.md`; in voice, keep wiring media evidence into readiness, provider/realtime, telephony, operations records, and proof-pack artifacts. |
| SIP/media infrastructure | Roadmap gap | Lag today, planned native depth | LiveKit owns rooms, SIP trunks, RTP/SRTP, DTMF, REFER, dispatch, and media networking. AbsoluteJS should not become a phone-number/telco dashboard, but it can consume media primitives for app-level media evidence. | Keep carrier number provisioning, SIP trunking, and media network rooms as adapter seams; voice should verify and prove them rather than own telco infrastructure. |

Current depth summary:

- We are ahead in the surfaces that matter to a self-hosted engineering team: proof, observability, operations records, provider recovery, framework integration, data control, guardrails-as-code, and release gates.
- We are roughly at parity where the buyer expects a complete voice-agent product surface: phone agents, Squads-style routing, post-call workflows, campaigns, and latency proof.
- We intentionally lag hosted platforms where the product would become a dashboard/telco/no-code builder: number provisioning and visual workflow builders. Raw media infrastructure is now a separate package concern: `@absolutejs/media` owns low-level media depth, and `@absolutejs/voice` owns the voice-agent proof/readiness surfaces that use it.
- The next percentage gain is not another large app surface. Depth is now measurable through the package competitive coverage report and proof-trend recommendation report; the remaining work is broader real-call benchmark profiles and keeping evidence links current.

## Vapi-User Needs Matrix

This is the product checklist that matters more than example polish. If a developer is evaluating Vapi, Retell, Bland, LiveKit Agents, Pipecat, and AbsoluteJS Voice, these are the surfaces they expect to find.

Current surface coverage estimate versus Vapi-user needs: **99.8%** for a self-hosted AbsoluteJS buyer.

What is covered: browser agent, phone agent, phone setup guidance, carrier webhook security, provider choice/fallback, provider orchestration profiles and readiness proof, provider decision traces, provider recovery evidence in operations records, failure replay for failed/recovered paths and caller-heard context, competitive coverage/depth report primitives, adapter-package realtime providers, multi-agent handoff, tools, observability, code-owned monitor definitions/issues/notifier receipts/scheduled runners, SLO calibration with runtime-channel proof trends, provider/runtime recommendations from sustained proof history, provider-specific sustained comparisons, customer-owned observability export/replay, production readiness, structured readiness-gate explanations, reconnect proof reports accepted by readiness gates, six-framework browser reconnect/resume proof, evals, simulations, campaigns, post-call workflow, compliance/data control, compliance recipes, live operator controls, fastest-first-success recipes, framework-visible specialist state, framework-visible readiness failures, proof-surface-to-call-log debugging, session snapshots, latest-call debugger launch primitives across React/Vue/Svelte/Angular/HTML/HTMX, buyer-path docs, a primitive capability matrix, proof-pack docs, package-level Vapi/platform coverage routes and widgets, screenshot proof artifacts, isolated proof runtime directories, long proof-window evidence, support-triage, appointment-scheduling, campaign-outreach, meeting-recorder/browser-recorder, and compliance-sensitive workflow use-case recipes. What still holds us back from the next tier: broader real-call benchmark history and continuously pruning navigation friction without becoming an opinionated app kit.

| Buyer need | Hosted competitor expectation | AbsoluteJS Voice current state | Product status | Next core move |
| --- | --- | --- | --- | --- |
| Create a browser voice agent quickly | Vapi has web calls and a quick assistant path. | `voice(...)`, browser client primitives, framework hooks/composables/services/widgets, reconnect, barge-in, live latency, turn quality, trace timelines, a 10-minute browser-agent recipe, and a parallel browser proof runner that forces reconnect/resume across HTML, React, Svelte, Vue, Angular, and HTMX exist. | Strong | Keep the browser recipe current as proof/debug routes evolve and add real-call profile history beyond demo sessions. |
| Create a phone agent quickly | Vapi and Retell lead with phone assistants and phone-number setup. | Twilio/Telnyx/Plivo bridges, response shaping, outcome mapping, carrier matrix, phone-agent smoke, `createVoicePhoneAgent(...)`, a 20-minute phone-agent recipe, HTML setup page, and structured copy-ready `setupInstructions` exist. | Strong | Keep carrier setup guidance current as providers add dashboard fields. |
| Carrier webhook security | Hosted platforms hide carrier webhook verification and replay/idempotency behind managed infrastructure. | Twilio/Telnyx/Plivo webhook security report/routes, persistent replay/idempotency stores, production-readiness gate, and phone-agent readiness-profile metadata exist. | Strong | Keep provider-specific signature/idempotency expectations current as carrier docs evolve. |
| Multi-assistant workflows | Vapi Squads has member assistants, handoff tools, overrides, and context controls. | `createVoiceAgentSquad(...)`, per-specialist tools, handoff policy, context policy, handoff summaries, durable squad state, trace events, workflow contracts, readiness-gated squad contracts, framework current-specialist primitives, and docs exist. | Strong | Polish example specialist flows and keep squad status wired to operations records/traces. |
| Tool calling, guardrails, and business actions | Hosted platforms expose tools/webhooks/actions and policy guardrails. | Tool runtime, tool contracts, workflow contracts, outcome contracts, guardrail policies/routes/runtime, operations-record and incident-bundle guardrail summaries, JSON guardrail evidence assertions, ops tasks, integration events, audit hooks, operations-record-linked contract failures, support-triage and appointment-scheduling tool-contract recipes, and compliance-sensitive audit/redaction workflow docs exist. | Strong | Keep expanding real-session guardrail proofs across buyer-facing examples and readiness/proof-pack surfaces. |
| Provider choice and fallback | Vapi sells STT/LLM/TTS choice without adapter glue. | OpenAI/Anthropic/Gemini models, Deepgram/AssemblyAI STT, OpenAI/emergency TTS, provider routers, provider orchestration profiles/routes/reports, provider decision traces, provider recovery evidence in operations records, failure replay for failed/recovered provider paths and caller-heard context, provider health, simulations, provider contract matrix, provider SLO reports, proof-trend provider/runtime recommendations, provider-specific sustained comparisons, JSON SLO/fallback evidence assertions, Markdown/JSON/HTML provider SLO artifacts, proof-pack headline SLO numbers, screenshot proof, long proof-window evidence, and readiness-gated latency/fallback/error budgets exist. | Strong | Expand real-call benchmark profiles so recommendations are backed by more call shapes and provider mixes. |
| Observability, monitoring, and logs | Vapi logs/monitoring/issues/notifiers, Retell monitoring, Bland call logs. | Trace events, timelines, diagnostics, replay, delivery sinks, ops status, provider health, ops recovery, readiness proof, monitor definitions/run reports/durable issues/lifecycle routes/notifier receipts/scheduled runner routes, SLO calibration routes, provider/runtime recommendation routes, unified operations records with guardrail evidence, incident Markdown with blocked-stage summaries, documented default debug path, "Switching from Vapi" guide, proof-pack docs, platform coverage route/widgets, screenshot proof, long proof-window artifacts, and proof-surface-to-call-log links exist. | Strong | Feed real-call profile history into calibration and provider recommendations. |
| Live operator intervention | Hosted platforms expose controls for pausing automation, takeover, escalation, notes, and intervention history. | Live-ops action routes, action-center client primitives, framework hooks/composables/services, runtime pause/resume/takeover controls, injected instructions, audit/trace evidence, operations-record linkage, package-level runtime proof, and safe operator workflow docs exist. | Strong | Keep operator controls visible in framework examples and operations records as live-ops use cases expand. |
| Latency/interruption confidence | Hosted platforms market low-latency calls and interruption behavior. | Turn latency, live latency, provider-stage SLO gates, barge-in routes, audio player interruption metrics, reconnect contracts/proof reports, readiness gating for observed reconnect resume, Markdown latency artifacts, provider SLO readiness gates, proof pages, proof-pack headline metrics, screenshot artifacts, six-framework forced reconnect proof, and long-running trend artifacts exist. | Strong | Keep thresholds tuned from repeated real runs and expand interruption/reconnect trend history. |
| Batch outbound campaigns | Retell/Bland make batch calling obvious. | Campaign store/routes/worker/proof exist, plus carrier dry-run proof, recipient import/validation, consent checks, dedupe, runtime import routes, pause/resume/cancel, retry-to-max behavior, rate limits, quiet hours, scheduled attempt windows, retry backoff, readiness proof without live carrier traffic, production-readiness gate integration, phone-agent profile support, README path docs, campaign-outreach recipe docs, and example readiness wiring. | Strong | Keep improving buyer-facing examples as campaign use cases emerge. |
| Simulation and regression testing | Retell simulation testing; Bland Standards/backtesting. | Eval routes, scenario fixtures, workflow/tool/outcome contracts, simulation suite, provider simulators, baseline store, operations-record-linked failure actions, buyer-path docs, and support/scheduling/campaign/meeting-recorder proof recipes exist. | Strong | Keep simulation examples aligned as use-case docs expand. |
| Support debugging and call logs | Hosted platforms give a dashboard call log, transcript, error trail, and support handoff. | Operations records, session snapshots, linked debug artifacts, failure replay, provider paths, user-heard output, transcript, incident Markdown, latest-session call debugger JSON/HTML/Markdown routes, and React/Vue/Svelte/Angular/HTML/HTMX launch primitives exist. | Strong | Feed call-debugger artifacts into observability export manifests and keep every new proof surface linked to a call debugger or operations record. |
| Call analysis and post-call workflow | Retell call analysis, Bland outcomes/post-call webhooks. | Reviews, outcomes, tasks, handoff deliveries, integration events, audit/webhook sinks, outcome contracts, operations-record-linked matched sessions, support-triage task docs, appointment confirmation task docs, `createVoicePostCallAnalysisRoutes(...)`, and example proof-pack/screenshot coverage for extraction/task/delivery proof exist. | Strong | Keep post-call proof aligned as new workflow recipes are added. |
| Compliance/data control | Hosted platforms sell HIPAA/SOC2/GDPR/compliance modes. | Self-hosted storage, redaction defaults, retention plans, guarded deletion, zero-retention helper, redacted audit exports, data-control routes, file/SQLite/Postgres/S3, webhook signing, provider-key recommendations, example/readiness wiring, buyer-facing compliance recipes, and a compliance-sensitive workflow recipe exist. | Strong | Keep compliance recipes aligned with storage/provider additions and avoid claiming certification. |
| Native media pipeline | Pipecat makes ordered frame processors, transport input/output, WebRTC/WebSocket transport choice, telephony serializers, and service integrations central. | `@absolutejs/media` now owns reusable media primitives, media quality reports, and WebRTC stats normalization; `@absolutejs/voice` has media proof routes, browser media readiness, and proof-pack assertions that consume those reports. It does not yet have Pipecat-level serializer adapters, media debuggers/runners, or a broad transport catalog. | Partial | Low-level work belongs in `../media/MEDIA_PLAN.md`; voice work is to consume those reports in readiness, live proofs, telephony proof, provider contracts, and operations records. |
| SIP/media infrastructure | LiveKit/Pipecat are strongest here. | Twilio/Telnyx/Plivo bridges plus adapter-package seams for OpenAI/Gemini realtime exist. Media primitives are separate in `@absolutejs/media`; voice verifies and proves app-level behavior. | Roadmap gap | Keep carrier number provisioning, SIP trunking, and media network rooms as adapter seams. Add proof/readiness around them instead of owning hosted telco infrastructure. |

## Core Product Priorities

The example should prove the primitives, not become the product. The product work that matters now is core package capability, API shape, docs, and release proof.

### Priority 1: Agent Squad As The Vapi Squads Answer

Why this matters: Vapi is making multi-assistant coordination a headline feature. AbsoluteJS Voice already has agent and handoff primitives, but buyers need one clearly named, documented, tested surface.

Core deliverables:

- `createVoiceAgentSquad(...)` docs with one browser flow and one phone flow.
- Handoff policy primitives for specialist routing:
  - trigger conditions
  - destination specialist
  - context window policy
  - handoff summary
  - tool permissions per specialist
- Persisted squad state on session/trace records:
  - current specialist
  - previous specialist
  - handoff reason
  - context summary
  - handoff outcome
- Squad contract route/report that proves expected transfers.
- Framework-visible current specialist state.

Acceptance criteria:

- A developer can define support -> billing -> scheduling -> human handoff in code.
- Trace timeline explains why the specialist changed.
- Production readiness can fail if squad contracts fail.

### Priority 2: Campaign/Batch Calls As The Retell/Bland Gap Closer

Why this matters: batch outbound is a buying feature for Retell/Bland. We should not host calls, but we need self-hosted campaign orchestration primitives.

Closed deliverables:

- Campaign recipient model with variables, validation errors, consent metadata, and dedupe keys.
- CSV/JSON import helper with safe variable mapping.
- Attempt scheduler with rate limit, concurrency, quiet hours, retry policy, and idempotency.
- Pause/resume/cancel campaign controls.
- Campaign attempt outcomes normalized across Twilio/Telnyx/Plivo.
- Campaign simulation fixtures that prove routing and outcomes without dialing.

Acceptance criteria:

- A user can run a self-hosted outbound campaign through their carrier account.
- Campaign attempts write reviews/tasks/integration events.
- Campaign proof can run without live carrier traffic.

### Priority 3: Unified Voice Operations Record

Why this matters: hosted platforms win because all call evidence is in one dashboard. We win by making the same evidence code-owned and queryable.

Core deliverables:

- A normalized operation record/view that links:
  - session
  - trace timeline
  - review
  - tasks
  - handoff deliveries
  - provider fallback events
  - tool calls
  - audit events
  - sink delivery attempts
- Route helpers to fetch an operation by session/call/review id.
- Export helpers for JSON/Markdown evidence bundles.
- Readiness proof links into the operation record.

Acceptance criteria:

- Given one call/session id, a developer can inspect the whole business and provider lifecycle.
- This works for browser sessions, phone sessions, campaigns, and simulations.

### Priority 4: Latency And Barge-In SLO Gates

Why this matters: "feels realtime" is a purchase criterion. We need measurable release gates, not just dashboards.

Core deliverables:

- Stage timing schema across cascaded and realtime modes:
  - speech detected
  - first partial
  - final transcript
  - turn committed
  - model request started
  - model first token/audio
  - TTS send started
  - TTS first audio
  - playback started
  - playback interrupted/stopped
- SLO config for browser and telephony.
- Release-gate helper that fails on p95 regression.
- Markdown artifact writer for latency proof.

Acceptance criteria:

- A team can gate deploys on p95 turn latency and barge-in stop latency.
- Reports separate provider latency from app orchestration latency.

### Priority 5: Compliance/Data-Control Recipes

Why this matters: self-hosted only wins if the buyer can see how to control data.

Status: core primitives and example/readiness proof are complete as of `@absolutejs/voice@0.0.22-beta.195`. This priority is now a docs/recipes track, not the next core blocker.

Core deliverables:

- `createVoiceDataControlRoutes(...)` or equivalent recipe around existing retention/redaction primitives.
- Zero-retention mode recipe.
- PII/secrets redaction defaults for traces, reviews, tool payloads, and webhooks.
- Audit export and deletion proof report.
- Storage recipes for SQLite, Postgres, Redis, S3, and file.

Acceptance criteria:

- The README can honestly say: customer-owned storage, retention, redaction, audit export, and deletion proof are all supported.
- Compliance-sensitive users do not need a hosted mode to understand the path.

### Priority 6: Unified Ops And Recovery Signal

Why this matters: Vapi-style hosted platforms make logs, monitoring, and issue detection feel centralized. AbsoluteJS Voice already has better code-owned primitives, but the buyer still needs one operational signal that answers "is my voice system healthy, what recovered, and what needs action?"

Status: core report/routes, example smoke proof, and production-readiness gate integration are complete as of `@absolutejs/voice@0.0.22-beta.197`. This priority is no longer the main blocker; the remaining work is broader operation-record link coverage across every proof surface.

Core deliverables:

- `buildVoiceOpsRecoveryReport(...)` that summarizes:
  - recovered provider fallback counts
  - unresolved provider failures
  - delivery sink failures and retry backlog
  - handoff failures and retry backlog
  - live-ops interventions
  - latency SLO warnings/failures
  - recent failed sessions and impacted session ids
- `createVoiceOpsRecoveryRoutes(...)` exposing:
  - JSON status for readiness/CI
  - HTML operator view
  - Markdown incident-ready export
- Stable issue codes and severity levels for deploy gates.
- Production-readiness integration so unresolved recovery failures can fail readiness while recovered fallback remains resilience evidence.
- Regression coverage using trace, audit, handoff, provider, and delivery stores.

Acceptance criteria:

- One endpoint gives an operator the current recovery/issue posture.
- Recovered fallback is visible as resilience evidence, not hidden.
- Unresolved provider/delivery/handoff/SLO failures fail readiness with stable issue codes.
- The report links back to operations records, traces, sessions, and delivery queues for investigation.

### Priority 7: Operations Record As The Default Debug Entrypoint

Why this matters: hosted competitors win on "open the call log and understand what happened." AbsoluteJS Voice already has richer code-owned evidence, but buyers need a default path that starts from one call/session id and lands on the operations record before drilling into traces, replay, reviews, tasks, handoffs, audit, and delivery queues.

Status: operations-record coverage is package-proven and support debugging is now a first-class package surface. Operations records were hardened through `@absolutejs/voice@0.0.22-beta.204`. `@absolutejs/voice@0.0.22-beta.401` through `0.0.22-beta.406` add session snapshot debug artifacts, call-debugger JSON/HTML/incident routes, latest-session resolution, client launch primitives, React/Vue/Svelte/Angular framework wrappers, HTML/HTMX custom-element support, README examples, and regression coverage. Package docs, ops recovery issues, production-readiness failures, trace timeline rows, session lists, campaign attempts, review pages, eval rows, simulation-suite actions, tool-contract cases, outcome-contract matched sessions, session snapshots, and example proof surfaces now prefer operations-record or call-debugger links. The operations record itself includes transcript sections, provider decisions, support/debug evidence, and copyable incident handoff Markdown.

Closed deliverables:

- Make operations records the default support/debug link from:
  - production readiness failures
  - ops recovery issues
  - trace timeline session rows
  - review pages
  - session list/replay entrypoints
  - campaign attempt outcomes
  - eval failures
  - simulation-suite actions
  - tool-contract cases
  - outcome-contract matched sessions
- Add operation-record links into recovery issues for failed sessions, provider failures, handoff failures, delivery failures, and SLO breaches.
- Add README docs positioning `/voice-operations/:sessionId` as the first debug surface.
- Add example demo path wording that starts support/debug investigation from operations records.
- Add regression coverage for route links from ops recovery/readiness to operations records.
- Add example smoke coverage that rejects proof surfaces without operations-record links.
- Add `createVoiceCallDebuggerRoutes(...)` with JSON, HTML, and incident Markdown for one-call support/debug.
- Add latest-session resolution so demos and support surfaces can open the most relevant failed/degraded/latest call without a manual session id.
- Add client/framework launch primitives for React, Vue, Svelte, Angular, HTML, and HTMX.
- Add README copy/paste examples and regression coverage for call-debugger wrapper exports.

Remaining work:

- Keep adding operations-record and call-debugger links as new proof surfaces are introduced.
- Fold call-debugger/session-snapshot artifacts into the customer-owned observability export manifest so support bundles, SIEM exports, and warehouse delivery share one artifact index. Status: done in `@absolutejs/voice@0.0.22-beta.407` via `sessionSnapshots`, `callDebuggerReports`, `links.sessionSnapshot`, and `links.callDebugger`.

Acceptance criteria:

- Given one problematic call, a developer can find the operations record from every major proof surface.
- The operations record is the documented first place to debug calls, not a hidden advanced route.
- Given no known session id, a developer can open `/voice-call-debugger/latest` and land on the most relevant failed/degraded/latest call.
- Every framework can expose "Debug Latest Call" without hand-writing store/mount code.
- Vapi-style call-log expectations are covered without a hosted dashboard.

### Priority 8: Customer-Owned Observability And Export

Why this matters: hosted competitors make monitoring feel easy because they own the dashboard. AbsoluteJS Voice should win the self-hosted buyer by making every important signal exportable, queryable, and incident-ready inside the customer's own stack instead of trapped in a vendor UI.

Status: the raw pieces exist: trace events, audit events, delivery sinks, operations records, session snapshots, call-debugger reports, incident Markdown, provider SLO reports, ops recovery reports, readiness gates, proof-pack JSON/Markdown, and screenshot proof. The next gap is cohesion: one primitive set that standardizes export manifests, artifact indexes, stable schemas, and warehouse/SIEM-friendly envelopes.

Core deliverables:

- `buildVoiceObservabilityExport(...)` that creates one normalized export manifest for:
  - operations records
  - session snapshots
  - call-debugger reports
  - trace timelines
  - audit events
  - sink delivery attempts
  - provider SLO reports
  - latency reports
  - readiness checks
  - ops recovery issues
  - proof-pack artifacts
  - incident Markdown
- `createVoiceObservabilityExportRoutes(...)` exposing:
  - JSON export manifest
  - Markdown incident/release summary
  - downloadable artifact index
  - optional redacted export mode
- Stable event/envelope schema for SIEM/warehouse forwarding:
  - event id
  - session id
  - trace id
  - tenant/customer metadata
  - provider kind/provider
  - severity/status
  - linked operations record
  - redaction metadata
  - delivery status
- Export adapters or recipes for the sinks we already support:
  - file
  - webhook
  - S3
  - SQLite
  - Postgres
- Production-readiness integration that fails if critical observability exports are stale, missing, or failing delivery.

Acceptance criteria:

- A buyer can send voice evidence to their own data lake, SIEM, incident process, or release notes without using a hosted dashboard.
- Every export links back to the operations record and preserves redaction posture.
- Proof-pack artifacts are part of the same evidence graph as runtime traces and audits.

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

- Rewrite README around seven installable paths:
  - browser voice agent
  - phone voice agent
  - production readiness and ops status
  - provider routing/fallbacks
  - evals/simulation
  - campaigns
  - compliance/data control
- Add a "Why not Vapi?" section focused on self-hosting, no platform fee, data ownership, code-owned primitives, and framework parity.
- Add a capabilities matrix for browser, telephony, providers, observability, evals, handoff, storage, and frameworks.
- Add a documented primitive-first recipe that wires the common routes without hiding the lower-level APIs.
- Make `/live-latency`, `/turn-latency`, `/traces`, `/quality`, `/production-readiness`, `/data-control`, and `/api/voice/ops-status` part of the default recommended demo path.

Status: README now has the buyer-path table, hosted-platform positioning, proof-pack checklist, default debug path, "Switching from Vapi" map, fastest-first-success recipes, compliance recipes, a capability matrix, plus support-triage, appointment-scheduling, campaign-outreach, meeting-recorder, and compliance-sensitive workflow use-case recipes. Example proof-pack output now includes headline provider SLO numbers and screenshot artifacts. Remaining work is customer-owned observability/export packaging and longer-running benchmark artifacts, not a missing top-level product story.

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

- Core `RealtimeAdapter` contract for direct audio-in/audio-out providers.
- Vendor realtime adapters live outside core: `@absolutejs/voice-openai` and `@absolutejs/voice-gemini` are published beta adapter packages, and the example proves both through realtime provider contracts.
- `voice(...)` can run with `realtime` instead of cascaded `stt`/`tts` without embedding vendor protocol code in core.
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

### Phase 5B: Voice Media Evidence Layer

Goal: consume `@absolutejs/media` primitives to prove the Pipecat-style media pipeline needs that matter for voice agents without turning `@absolutejs/voice` into a generic media runtime, hosted telco platform, or no-code builder.

Current status: split cleanly. `@absolutejs/media` now owns generic media frames, frame transform pipelines, ordered processor graphs, branch/filter/processor nodes, processor graph reports, resampling plans, calibration reports, VAD reports, interruption reports, transport lifecycle reports, media-quality reports, WebRTC stats reports, live WebRTC stats collection, WebRTC stream continuity reports, Twilio/Telnyx/Plivo telephony media serializers, and telephony stream lifecycle reports. `@absolutejs/voice` depends on media for primitives and keeps voice-specific pipeline proof routes, browser media readiness assertions, telephony media serializer/lifecycle proof, provider/realtime integration, operations records, and proof-pack wiring. This is enough to prove app-level media flow in an AbsoluteJS app; it is not yet Pipecat-depth because richer graph lifecycle controls, debugger/runners, and broader service integration are still roadmap work.

Deliverables:

- Browser and telephony audio frame model for input, assistant output, interruptions, and metadata. Status: `@absolutejs/media` primitive exists.
- Runtime calibration for capture format, sample rate, channel count, resampling requirement, first-audio latency, jitter, and backpressure. Status: `@absolutejs/media` report exists and `@absolutejs/voice` proof route uses it.
- Frame processors for VAD/turn detection hooks, noise/level metadata, transcript alignment, interruption markers, and provider-stage timing. Status: `@absolutejs/media` owns frame transform pipelines, ordered processor graphs, branch/filter nodes, VAD, and interruption reports.
- Transport lifecycle primitives for browser WebSocket, telephony media streams, and direct realtime provider streams. Status: `@absolutejs/media` owns transport runtime/report primitives; concrete WebRTC/WebSocket/telephony helpers are tracked in `../media/MEDIA_PLAN.md`.
- Voice proof consumption for media-quality stats, jitter, loss, playback timestamp drift, interruption stop latency, and provider-stage timing once `@absolutejs/media` exposes those reports.
- Voice proof consumption for telephony media serializers and lifecycle. Status: `@absolutejs/media@0.0.1-beta.7` exposes Twilio/Telnyx/Plivo media packet serializers plus start/media/stop/error lifecycle reports, and `@absolutejs/voice@0.0.22-beta.337` exposes `buildVoiceTelephonyMediaReport(...)`, `getLatestVoiceTelephonyMediaReport(...)`, `/api/voice/telephony/media`, `/voice/telephony-media`, production-readiness deploy gating through the `telephonyMedia` readiness input, live bridge `client.telephony_media` trace evidence for inbound media and outbound assistant media/marks/clears, operations-record summaries for per-call start/media/stop/inbound/outbound evidence, operations-record links for failing carrier stream IDs, `runVoiceTelephonyMediaOperationsSmoke(...)` so examples/apps can prove inbound/outbound carrier media operations without duplicating bridge test harness code, runtime-channel proof trend assertions, and `buildVoiceFailureReplay(...)`/`renderVoiceFailureReplayMarkdown(...)` so a support/debug surface can show what provider/media path failed or recovered and what the user actually heard.
- Browser WebRTC stats readiness gate. Status: `@absolutejs/media@0.0.1-beta.5` exposes `buildMediaWebRTCStatsReport(...)`, `collectMediaWebRTCStats(...)`, `collectMediaWebRTCStatsReport(...)`, and `buildMediaWebRTCStreamContinuityReport(...)`; `@absolutejs/voice@0.0.22-beta.322` consumes aggregate stats and stream continuity as `Browser media transport`, stores both in `client.browser_media` traces, merges continuity issues into `getLatestVoiceBrowserMediaReport(...)`, and exposes JSON/HTML proof routes. The example proof pack passes with `.voice-runtime/proof-pack/2026-04-30T09-03-51.415Z`; rerun after installing `.322`.
- Unified voice trace events that link media reports, provider decisions, operations records, barge-in, reconnect, and readiness gates.
- Package shape is now decided: `@absolutejs/media` owns generic media primitives; `@absolutejs/voice` owns voice proof, readiness, provider, telephony, operations, and framework consumption.

Acceptance criteria:

- A self-hosted AbsoluteJS app can build advanced voice pipelines without adopting Pipecat as a required runtime.
- OpenAI/Gemini realtime, cascaded STT/LLM/TTS, and telephony media streams all use the same proof vocabulary.
- Advanced media behavior is testable through package contracts and example proof pack artifacts.

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
  - ops status
- Add htmx/custom-element equivalents for the high-value widgets.
- Add parity tests or build-time checks to prevent Angular/HTMX regressions.

Acceptance criteria:

- The six-framework example remains feature-parity by design.
- Adding a new primitive includes a framework parity checklist.

### Phase 9: Customer-Owned Observability Export

Goal: make the self-hosted observability/export story as obvious as a hosted dashboard while keeping all data in the buyer's infrastructure.

Deliverables:

- Observability export manifest primitive covering traces, audits, operations records, provider SLOs, readiness, recovery, incidents, and proof packs.
- Redacted export mode with explicit redaction metadata.
- SHA-256 checksums, byte counts, and freshness windows for path-backed artifacts so proof packs and screenshots cannot silently go stale.
- Artifact index and download routes that make generated JSON, Markdown, screenshots, and incident bundles discoverable from one place.
- Stable schema id/version contract for export manifests and artifact indexes. Status: `schema.id`, `schema.version`, exported constants, and assertion helper are package primitives.
- Customer ingestion validator for exported evidence records. Status: manifests, artifact indexes, delivery reports, delivery receipts, delivery histories, and database payload records can be validated at read time before warehouse/SIEM use.
- Export replay primitive for already-delivered evidence. Status: supplied records plus file, S3, SQLite, and Postgres delivery targets can be replayed into a readiness-style report that validates records and flags failed artifacts/destinations; `createVoiceObservabilityExportReplayRoutes(...)` exposes both JSON and readable HTML proof.
- Production-readiness gate for export replay health. Status: `observabilityExportReplay` can fail deploy readiness when customer-owned export evidence cannot be read back cleanly.
- Delivery recipes for file, webhook, S3, SQLite, and Postgres using the existing sink/runtime primitives. Status: file, webhook, Bun-native S3, Bun-native SQLite, and Bun-native Postgres export delivery are package primitives.
- Readiness checks for stale or failed critical exports. Status: manifest health and delivery receipt history are production-readiness-gated.
- Delivery receipts/history for export runs so operators can prove destination health over time. Status: memory and file receipt stores plus delivery history routes are package primitives.

Acceptance criteria:

- A user can prove where every voice artifact is stored and how it was delivered.
- A user can prove generated artifacts are current and unchanged through machine-readable checksum and freshness metadata.
- The export graph works for browser sessions, phone sessions, campaigns, simulations, and proof packs.
- This improves observability without becoming a hosted dashboard clone.

### Phase 10: Code-Owned Monitoring, Issues, And Notifiers

Goal: answer Vapi-style monitoring without shipping a hosted dashboard. AbsoluteJS Voice should let teams define monitors in code, evaluate them against customer-owned evidence, create durable issues, and notify their own systems.

Status: monitor definitions, run reports, durable issue stores, issue acknowledge/resolve/mute lifecycle actions, JSON/HTML/Markdown routes, webhook notifier helpers, notifier delivery receipts, scheduled runner controls/routes, and production-readiness gates are package primitives as of `@absolutejs/voice@0.0.22-beta.280`. SLO calibration primitives and routes are package primitives as of `@absolutejs/voice@0.0.22-beta.281`. Provider/runtime recommendation primitives and routes are package primitives as of `@absolutejs/voice@0.0.22-beta.337`; benchmark-profile recommendations are package primitives as of `@absolutejs/voice@0.0.22-beta.338`; history-backed proof-profile aggregation is package-level as of `@absolutejs/voice@0.0.22-beta.340`, with stale failed profile status recomputed from aggregate budgets as of `@absolutejs/voice@0.0.22-beta.341`, and real-call profile history report generation as of `@absolutejs/voice@0.0.22-beta.344`. The example long proof-window runner now proves sustained trends, runtime-channel samples, proof-pack assertions, calibration recommendations, provider/runtime recommendations, profile-specific recommendations, and provider-specific comparison rows against fresh isolated artifacts; the remaining gap is broader real-call profile history.

Why this matters: current Vapi docs make monitoring a first-class product surface: monitors target assistants, triggers evaluate call data on a schedule, issues are created when thresholds fail, and notifiers alert teams by email, Slack, or webhook. We already have the underlying evidence graph through traces, operations records, provider SLOs, ops recovery, readiness, guardrails, post-call analysis, and observability export. The monitor/trigger/issue/notifier layer turns that evidence into an operator workflow.

Deliverables:

- Code-owned monitor definitions. Status: `VoiceMonitorDefinition` and `buildVoiceMonitorRunReport(...)` exist.
  - target sessions/assistants/providers/campaigns
  - query source: traces, operations records, provider SLOs, post-call analysis, guardrails, ops recovery, readiness, export delivery
  - threshold/rubric
  - severity
  - evaluation window
  - dedupe key
- Trigger runner primitives:
  - manual evaluation for CI/release proof. Status: `buildVoiceMonitorRunReport(...)` supports deterministic runs.
  - scheduled evaluation using app-owned cron/worker infrastructure. Status: `createVoiceMonitorRunner(...)`.
  - deterministic test fixtures for pass/fail trigger cases. Status: covered in `test/voiceMonitoring.test.ts`.
- Durable issue store and lifecycle:
  - open. Status: memory issue store creates open issues.
  - acknowledged. Status: `acknowledgeVoiceMonitorIssue(...)`.
  - resolved. Status: `resolveVoiceMonitorIssue(...)`.
  - muted/suppressed. Status: `muteVoiceMonitorIssue(...)`.
  - linked operations records and impacted sessions
  - generated incident Markdown. Status: monitor Markdown report exists; issue-specific incident bundles remain future work.
- Notifier delivery adapters:
  - webhook. Status: `createVoiceMonitorWebhookNotifier(...)`.
  - email recipe
  - Slack webhook recipe
  - file/S3/Postgres audit trail through existing delivery primitives. Status: delivery receipts can be persisted through `VoiceMonitorNotifierDeliveryReceiptStore`; dedicated durable adapters remain future work.
- Routes:
  - monitor list/detail JSON. Status: `createVoiceMonitorRoutes(...)`.
  - issue list/detail JSON/HTML. Status: issue list JSON and monitor HTML exist.
  - issue acknowledge/resolve actions. Status: acknowledge, resolve, and mute routes exist.
  - Markdown incident export. Status: monitor Markdown exists; issue-specific incident export remains future work.
- Production-readiness integration:
  - fail deploys on open critical issues. Status: `monitoring` production-readiness option emits `Monitoring issues`.
  - warn on stale monitor runs
  - prove notifier delivery health through delivery receipts. Status: `monitoringNotifierDelivery` production-readiness option emits `Monitor notifier delivery`.
- Framework/client primitives:
  - lightweight issue badge/list hooks/composables/services
  - no big dashboard kit

Acceptance criteria:

- A team can define "error rate > 2%", "provider p95 > budget", "guardrail blocks spiking", "post-call extraction missing", or "export delivery stale" in code. Status: supported by monitor definitions.
- Monitor runs create issues linked to operations records and incident Markdown. Status: issues and monitor Markdown exist; issue-specific incident bundles remain future work.
- Critical open issues can fail production readiness. Status: supported.
- Notifier delivery is customer-owned and auditable. Status: webhook notifier plus delivery receipts exist.
- The primitive stays composable enough for teams to build their own ops UI.

## Winning Scorecard

We are ahead of Vapi-style hosted platforms for AbsoluteJS users when:

- A developer can add a browser voice agent and inspect traces/readiness in one install path.
- A developer can add a phone agent with Twilio/Telnyx/Plivo and get carrier readiness before live traffic.
- Provider routing, fallback, and model choice are app-owned and observable.
- Recovered provider fallback is treated as resilience evidence, not a failed session, while unresolved provider errors still fail readiness.
- Live latency, turn latency, turn quality, traces, and production readiness are visible by default.
- Multi-agent handoff and human handoff are testable and persisted.
- Campaign/batch call primitives exist for self-hosted outbound operations.
- Evals and simulations prove workflows before production.
- Major proof failures link directly to operations records and incident handoff Markdown.
- Runtime and proof artifacts export cleanly to customer-owned storage, warehouse, SIEM, and release evidence flows.
- Storage, redaction, retention, and audit hooks are explicit.
- Every feature works across React, Vue, Svelte, Angular, HTML, and HTMX.
- The example app demonstrates the primitives without becoming the product.

## Immediate Backlog

### Recently Closed Core Proof

- Carrier webhook security is now package-proven and profile-visible:
  - `buildVoiceTelephonyWebhookSecurityReport(...)` verifies carrier webhook readiness across Twilio, Telnyx, and Plivo.
  - `createVoiceTelephonyWebhookSecurityRoutes(...)` exposes `/api/voice/telephony/webhook-security` as JSON/HTML proof.
  - replay protection, Twilio idempotency, persistent store requirements, verification status, warnings, and failures are summarized per provider.
  - `buildVoiceProductionReadinessReport(...)` accepts `telephonyWebhookSecurity` and emits a `Carrier webhook security` readiness check that can fail deploy gates.
  - `createVoiceReadinessProfile('phone-agent', ...)` treats `telephonyWebhookSecurity` as a phone-agent required/configured surface with default link metadata.
  - regression coverage lives in `test/telephonySecurity.test.ts`, `test/productionReadiness.test.ts`, and `test/readinessProfiles.test.ts`.
  - released in `@absolutejs/voice@0.0.22-beta.277` and installed in the example.

- Monitoring issues are now package-proven and readiness-gated:
  - `VoiceMonitorDefinition` defines code-owned monitor checks over customer-owned evidence.
  - `buildVoiceMonitorRunReport(...)` evaluates monitors and creates durable issues for failing/warning runs.
  - `createVoiceMemoryMonitorIssueStore(...)` provides the initial issue store primitive.
  - `acknowledgeVoiceMonitorIssue(...)`, `resolveVoiceMonitorIssue(...)`, and `muteVoiceMonitorIssue(...)` expose lifecycle actions.
  - `createVoiceMonitorRoutes(...)` exposes monitor JSON, issue JSON, lifecycle POST actions, HTML, and Markdown.
  - `buildVoiceProductionReadinessReport(...)` accepts `monitoring` and emits a `Monitoring issues` deploy gate that fails on open critical issues.
  - regression coverage lives in `test/voiceMonitoring.test.ts` and `test/productionReadiness.test.ts`.
  - released in `@absolutejs/voice@0.0.22-beta.278` and installed in the example.

- Monitor notifier delivery is now package-proven and readiness-gated:
  - `createVoiceMonitorWebhookNotifier(...)` posts issue payloads to customer-owned webhook/Slack-style endpoints.
  - `deliverVoiceMonitorIssueNotifications(...)` delivers open monitor issues to configured notifiers.
  - `createVoiceMemoryMonitorNotifierDeliveryReceiptStore(...)` persists notifier delivery receipts for proof and audit.
  - `createVoiceMonitorRoutes(...)` exposes `POST /api/voice/monitor-notifications` and notification receipt JSON.
  - `buildVoiceProductionReadinessReport(...)` accepts `monitoringNotifierDelivery` and emits a `Monitor notifier delivery` deploy gate.
  - regression coverage lives in `test/voiceMonitoring.test.ts` and `test/productionReadiness.test.ts`.
  - released in `@absolutejs/voice@0.0.22-beta.279` and installed in the example.

- Scheduled monitor runners are now package-proven:
  - `createVoiceMonitorRunner(...)` supports `tick()`, `start()`, `stop()`, and `isRunning()` over app-owned evidence loaders.
  - runner ticks evaluate monitors and deliver issue notifications through configured notifiers.
  - `createVoiceMonitorRunnerRoutes(...)` exposes runner status plus manual tick/start/stop controls.
  - regression coverage lives in `test/voiceMonitoring.test.ts`.
  - released in `@absolutejs/voice@0.0.22-beta.280` and installed in the example.

- Long proof-window evidence is now example-proven:
  - `absolutejs-voice-example` exposes `bun run proof:long-window`.
  - the runner starts one fresh demo server, runs sustained proof trends, then runs the proof pack against the same fresh trend artifact.
  - stale `latest.json` proof-trend or proof-pack files are rejected instead of summarized.
  - latest verified run passed 18/18 trend cycles plus proof pack with max turn p95 140ms, max live p95 420ms, and max provider p95 700ms.
  - artifacts live under `.voice-runtime/long-proof-window/<run-id>` with a current `latest.json` and `latest.md`.

- SLO calibration is now package-proven and example-backed by runtime samples:
  - `buildVoiceSloCalibrationReport(...)` consumes repeated long proof-window/proof-trend history.
  - `assertVoiceSloCalibration(...)` fails when required passing runs or core latency samples are missing.
  - `createVoiceSloCalibrationRoutes(...)` exposes JSON and Markdown recommendations.
  - `createVoiceSloThresholdProfile(...)` converts calibrated history into spreadable provider SLO, live-latency, barge-in, reconnect, monitor-run, and notifier-delivery threshold config.
  - `createVoiceSloReadinessThresholdOptions(...)` converts a calibration report/profile directly into production-readiness threshold options for `resolveOptions`.
  - `createVoiceSloReadinessThresholdRoutes(...)` exposes JSON, HTML, and Markdown views of the active calibrated readiness gates so teams can inspect "Calibration -> Active Readiness Gate" without correlating raw JSON reports.
  - production readiness now supports `links.sloReadinessThresholds`, renders a direct "Calibration -> Active Readiness Gate" link, and adds calibrated-gate actions when provider SLO, live-latency, barge-in, reconnect, monitor-run, or notifier-delivery gates warn/fail.
  - calibrated readiness failures now expose structured `gateExplanation` JSON with observed value, threshold, unit, source threshold route, evidence route, and remediation so clients do not need to parse prose.
  - client/framework primitives now render `gateExplanation` through `createVoiceReadinessFailuresStore(...)`, `renderVoiceReadinessFailuresHTML(...)`, the `absolute-voice-readiness-failures` custom element, React `useVoiceReadinessFailures`/`VoiceReadinessFailures`, Vue `useVoiceReadinessFailures`/`VoiceReadinessFailures`, Svelte `createVoiceReadinessFailures`, and Angular `VoiceReadinessFailuresService`.
  - `createVoiceProductionReadinessRoutes(...)` accepts `resolveOptions`, `liveLatencyMaxAgeMs`, `reconnectResumeFailAfterMs`, `monitoringRunFailAfterMs`, and `monitoringNotifierDeliveryFailAfterMs` so readiness gates and operations-record latency links can consume calibrated thresholds per request without stale trace noise.
  - reconnect reports now expose `resumeLatencyP95Ms`, and monitor/notifier reports expose `elapsedMs`, making every long-window runtime channel enforceable by readiness.
  - recommendations cover provider p95, live latency, turn latency, interruption, reconnect, monitor-run, and notifier-delivery channels while warning on optional channels that are not sampled yet.
  - the example long-window runner now writes interruption, reconnect, monitor-run, and notifier-delivery samples into `runtimeCalibration`.
  - the example now feeds calibrated provider SLO, live-latency, barge-in, reconnect, monitor-run, and notifier-delivery thresholds back into production readiness instead of leaving calibration as a passive report.
  - latest route smoke showed `/api/voice/slo-calibration` as `status: "pass"` with no issues across all seven channels.
  - regression coverage lives in `test/sloCalibration.test.ts`.
  - released in `@absolutejs/voice@0.0.22-beta.291` and installed in the example.

- Operations-record call-log coverage is now released through `@absolutejs/voice@0.0.22-beta.204`:
  - `0.0.22-beta.201`: operations-record HTML exposes visible incident Markdown links, and the example proof dashboard links the incident handoff.
  - `0.0.22-beta.202`: eval session/scenario/fixture reports expose `operationsRecordHref`, and eval HTML links failed/session rows to the operations record.
  - `0.0.22-beta.203`: simulation-suite session, scenario, and fixture failure actions prefer the impacted operations record over generic proof links.
  - `0.0.22-beta.204`: tool-contract cases and outcome-contract matched sessions expose operations-record links in JSON and HTML.
  - Example smoke now verifies incident Markdown, simulation-suite action links, tool-contract case links, and outcome-contract matched-session links.
  - Regression coverage lives in `test/operationsRecord.test.ts`, `test/evalRoutes.test.ts`, `test/simulationSuite.test.ts`, `test/toolContract.test.ts`, and `test/outcomeContract.test.ts`.
  - README now documents the default debug path: readiness/proof failure -> operations record -> incident Markdown.
  - README now includes a "Switching from Vapi" guide mapping assistants, web calls, phone calls, squads, tools, call logs, post-call analysis, simulations, monitoring, campaigns, and compliance controls to AbsoluteJS primitives.

- Live-ops runtime intervention is now package-proven:
  - `createVoiceSession(...)` reads live-ops control state before assistant generation.
  - paused/operator-takeover turns commit the user transcript but skip assistant generation.
  - injected operator instructions are passed into the next `onTurn` call after resume.
  - skipped automation writes `operator.action` trace evidence.
  - regression coverage lives in `test/liveOpsRuntime.test.ts`.
- Unified operations records now link support/debug evidence:
  - trace timeline, session replay, provider events, tools, handoffs, and audit.
  - call reviews, ops tasks, integration events, and sink delivery attempts.
  - guardrail decisions can be checked with package-level JSON assertions for blocked counts, stages, proofs, rule IDs, statuses, and tool names.
  - route helpers expose JSON and HTML records through `createVoiceOperationsRecordRoutes(...)`.
  - regression coverage lives in `test/operationsRecord.test.ts`.
- Call debugger and session snapshots are now package-proven:
  - `0.0.22-beta.401`: session snapshots expose linked support/debug artifacts.
  - `0.0.22-beta.402`: `createVoiceCallDebuggerRoutes(...)` exposes one-call JSON, HTML, and incident Markdown.
  - `0.0.22-beta.403`: latest-session resolution supports `/voice-call-debugger/latest`.
  - `0.0.22-beta.404`: client store, renderer, mounter, and custom element expose a "Debug Latest Call" launcher.
  - `0.0.22-beta.405`: React, Vue, Svelte, and Angular wrappers expose the same call-debugger primitive.
  - `0.0.22-beta.406`: README examples and `test/frameworkWrappers.test.ts` lock wrapper exports.
  - `0.0.22-beta.407`: observability export manifests and artifact indexes include first-class session snapshot and call-debugger report artifacts.
- Provider-stage latency/SLO gates are now package-proven:
  - `buildVoiceLatencySLOGate(...)` evaluates turn waterfall, provider, live latency, and barge-in trace timings.
  - `assertVoiceLatencySLOGate(...)` throws with a full report when release budgets fail.
  - `assertVoiceProviderSloEvidence(...)` verifies provider SLO JSON for required kinds, providers, fallback counts, latency samples, status, and latency ceilings.
  - `renderVoiceLatencySLOMarkdown(...)` emits copyable release evidence.
  - regression coverage lives in `test/latencySlo.test.ts`.
- Six-framework reconnect/resume proof is now package-backed and example-proven:
  - `createVoiceReconnectProofRoutes(...)` collects browser reconnect snapshots and emits JSON proof reports.
  - production readiness accepts reconnect proof reports and requires observed reconnect/resume when configured.
  - `simulateDisconnect()` is exposed through the client stream/controller and React, Vue, Svelte, Angular, HTML, and HTMX entrypoints.
  - `@absolutejs/voice@0.0.22-beta.450` fixed production `absolute start` HTMX bootstrap serving by embedding the generated browser bootstrap into the package build.
  - `@absolutejs/voice@0.0.22-beta.451` fixed optional HTMX selector handling so omitted optional selectors do not crash the bootstrap.
  - the voice example exposes `bun run proof:reconnect`, starts a fresh production server on a random port, opens all six framework pages in parallel, forces reconnect/resume from browser UI, rejects stale proof state, and passed with `snapshotCount: 24`.
  - regression coverage lives in `test/reconnectContract.test.ts`, `test/productionReadiness.test.ts`, and the example browser proof runner.
- Campaign recipient import and retry behavior are now package-proven:
  - `importVoiceCampaignRecipients(...)` validates CSV/JSON rows, consent, dedupe, phone normalization, metadata, and variables.
  - `VoiceCampaignRuntime.importRecipients(...)` persists accepted recipients while returning rejected-row evidence.
  - campaign routes expose recipient import through the runtime API.
  - `tick(...)` retries pending failed recipients until `maxAttempts`.
  - regression coverage lives in `test/campaign.test.ts`.
- Campaign scheduling controls are now package-proven:
  - campaign records accept rate limits, quiet hours, attempt windows, and retry policy.
  - `tick(...)` blocks attempts outside allowed windows and during quiet hours.
  - `tick(...)` enforces rolling attempt rate limits.
  - `tick(...)` enforces retry backoff with block evidence and retry timestamps.
  - regression coverage lives in `test/campaign.test.ts`.
- Campaign readiness proof is now package-proven:
  - `runVoiceCampaignReadinessProof(...)` certifies import validation, allowed/blocked schedule ticks, rate limiting, retry backoff, and retry-to-max behavior without live dialing.
  - `createVoiceCampaignRoutes(...)` exposes `/api/voice/campaigns/readiness-proof` as JSON proof.
  - regression coverage lives in `test/campaign.test.ts`.
- Campaign readiness is now production-readiness-gated:
  - `buildVoiceProductionReadinessReport(...)` accepts campaign readiness proof and emits a `Campaign readiness proof` check.
  - `summarizeVoiceProductionReadinessGate(...)` fails deploy gates on failed campaign proof.
  - `createVoiceReadinessProfile('phone-agent', ...)` accepts campaign readiness as a phone-agent proof surface.
  - regression coverage lives in `test/productionReadiness.test.ts` and `test/readinessProfiles.test.ts`.
- Customer-owned observability export delivery is now profile-visible:
  - `createVoiceReadinessProfile('phone-agent', ...)` and `createVoiceReadinessProfile('ops-heavy', ...)` accept `observabilityExportDeliveryHistory`.
  - `explain: true` shows `Observability export delivery` as a configured or missing surface.
  - `recommendVoiceReadinessProfile(...)` scores delivery receipt history as part of phone-agent and ops-heavy production coverage.
- Campaign docs and example wiring are now buyer-visible:
  - README documents the self-hosted campaign path, recipient import, scheduling controls, readiness proof, production-readiness wiring, and carrier dialer proof.
  - the example app passes `runVoiceCampaignReadinessProof(...)` into the phone-agent production-readiness profile.
  - the example readiness smoke checks `/api/voice/campaigns/readiness-proof` and shows campaign readiness inside production readiness.
  - `@absolutejs/voice@0.0.22-beta.193` contains the campaign readiness exports.
- Agent Squad is now hardened as the Vapi Squads answer:
  - `createVoiceAgentSquad(...)` supports `handoffPolicy` for allow/reroute/block/escalate routing.
  - `createVoiceAgentSquad(...)` supports `contextPolicy` for specialist context-window control.
  - handoff summaries, metadata, current specialist, previous specialist, and handoff status are returned in durable squad state.
  - `agent.handoff` and `agent.context` traces explain specialist movement and context policy.
  - README documents per-specialist tools, context policy, and squad contracts.
  - regression coverage lives in `test/agent.test.ts`.
- Compliance/data-control recipes are now package-proven:
  - `voiceComplianceRedactionDefaults` captures safe defaults for PII and sensitive keys.
  - `createVoiceZeroRetentionPolicy(...)` returns a dry-run zero-retention policy across runtime stores.
  - `buildVoiceDataControlReport(...)` proves customer-owned storage, retention plans, redaction status, audit export, and provider-key recommendations.
  - `createVoiceDataControlRoutes(...)` exposes HTML/JSON/Markdown reports, redacted audit exports, retention dry-runs, and guarded retention apply.
  - regression coverage lives in `test/dataControl.test.ts`.
- Compliance/data-control proof is now buyer-visible in the example:
  - `absolutejs-voice-example` installs `@absolutejs/voice@0.0.22-beta.195`.
  - the example mounts `/data-control`, `/data-control.json`, `/data-control.md`, audit export routes, and guarded retention routes.
  - the readiness smoke runner checks `/data-control.json` in parallel with the other control-plane endpoints.
  - the demo proof dashboard and README now include `/data-control` in the recommended proof path.
  - smoke proof showed redaction enabled, dry-run retention enabled, storage surfaces detected, and zero-retention available.
- Ops/recovery is now package-proven:
  - `buildVoiceOpsRecoveryReport(...)` summarizes recovered provider fallback, unresolved provider failures, audit and trace delivery failures, handoff delivery failures, retry backlog, operator interventions, failed sessions, and latency SLOs.
  - `createVoiceOpsRecoveryRoutes(...)` exposes JSON, HTML, and Markdown recovery reports.
  - stable issue codes exist for provider, delivery, handoff, and latency recovery issues.
  - `buildVoiceOpsRecoveryReadinessCheck(...)` converts a recovery report into a readiness check.
  - regression coverage lives in `test/opsRecovery.test.ts`.
- Ops/recovery proof is now buyer-visible in the example:
  - `absolutejs-voice-example` installs `@absolutejs/voice@0.0.22-beta.196`.
  - the example mounts `/ops-recovery`, `/api/voice/ops-recovery`, and `/api/voice/ops-recovery.md`.
  - the readiness smoke runner checks `/api/voice/ops-recovery` in parallel with the other control-plane endpoints.
  - the demo proof dashboard and README now include `/ops-recovery` in the recommended proof path.
  - smoke proof showed `opsRecoveryStatus: "pass"`, recovered fallback evidence, zero unresolved provider failures, and zero recovery issues.
- Provider SLO and screenshot proof are now buyer-visible in the example:
  - `absolutejs-voice-example` installs `@absolutejs/voice@0.0.22-beta.217`.
  - the example mounts `/voice/provider-slos`, `/voice/provider-slos.md`, and `/api/voice/provider-slos`.
  - the proof-pack runner seeds provider SLO traces, fetches provider SLO JSON/Markdown, and renders headline LLM/STT/TTS SLO numbers in `latest.md`.
  - `bun run proof:screenshots` runs a fresh proof pack and captures production-readiness, provider-SLO, simulation-suite, and operations-record screenshots.
  - latest verified proof showed provider SLO `pass`, 9 routing events, 9 latency samples, 0 issues, and four screenshot artifacts.

### Tier 1: Core Product Work That Moves The Market

- Run multiple full default long-window passes and promote stable calibrated thresholds into default readiness/profile guidance.
- Promote the reconnect proof runner from example-only release evidence into the broader real-call profile history story so browser reconnect/resume is tracked across repeated proof windows and real app traffic.
- Keep customer-owned observability/export primitives current so traces, audits, operations records, session snapshots, call-debugger reports, SLOs, readiness, recovery, incidents, proof packs, and monitor issues share one export manifest and delivery story.
- Add example specialist flow polish using the new framework-visible Agent Squad status primitives after the monitor/issue core exists.

### Tier 2: Product Cohesion And Docs

- Keep README buyer paths current:
  - browser voice agent
  - phone voice agent
  - provider routing/fallback
  - operations/readiness
  - campaigns
  - simulations/evals
  - compliance/data control
- Keep use-case docs current as primitives change.
- Keep the capability matrix honest with "core package", "example", and "not our lane" columns.

### Tier 3: Example Proof Only After Core Work

- Keep six-framework parity green with `bun run proof:reconnect`, not manual screenshots or stale local state.
- Keep `/demo-proof` green as a package integration proof.
- Add example screens only when they demonstrate new package primitives.
- Keep proof-pack screenshots current for production readiness, provider SLOs, simulation suite, and operations records.
- Keep call-debugger/session-snapshot screenshots current once they are part of the proof-pack artifact list.
- Add longer-running benchmark markdown artifacts for latency, telephony, STT, TTS, duplex, campaigns, and long proof-window history.
- Add source-backed market comparison docs with updated competitor notes once core gaps are closed.

## Source Notes

- Vapi docs: https://docs.vapi.ai/
- Vapi current updates: https://docs.vapi.ai/whats-new
- Vapi assistants quickstart: https://docs.vapi.ai/assistants
- Vapi Squads: https://docs.vapi.ai/squads
- Vapi monitoring quickstart: https://docs.vapi.ai/observability/monitoring-quickstart
- Vapi tools: https://docs.vapi.ai/tools/
- Vapi call analysis: https://docs.vapi.ai/assistants/call-analysis
- Vapi phone calling: https://docs.vapi.ai/phone-calling
- Vapi phone number hooks: https://docs.vapi.ai/phone-numbers/phone-number-hooks
- Retell docs: https://docs.retellai.com/
- Retell pricing: https://www.retellai.com/pricing
- Retell webhooks: https://docs.retellai.com/features/webhook
- Retell batch calls: https://docs.retellai.com/deploy/make-batch-call
- Retell webhook overview: https://docs.retellai.com/features/webhook-overview
- Bland billing/plans: https://docs.bland.ai/platform/billing
- Bland batch calls: https://docs.bland.ai/tutorials/batch-calls
- Bland webhooks: https://docs.bland.ai/tutorials/webhooks
- Bland public product page: https://www.bland.ai/
- Bland conversational pathways: https://www.bland.ai/product/conversational-pathways
- Bland Standards/Outcomes changelog: https://docs.bland.ai/changelog/02_23_2026
- LiveKit Agents: https://docs.livekit.io/agents/
- LiveKit telephony: https://docs.livekit.io/frontends/telephony/agents
- Pipecat overview: https://docs.pipecat.ai/overview/pipecat
- OpenAI Realtime announcement: https://openai.com/index/introducing-gpt-realtime
- OpenAI voice agents docs: https://platform.openai.com/docs/guides/voice-agents
- Deepgram Flux quickstart: https://developers.deepgram.com/docs/flux/quickstart
