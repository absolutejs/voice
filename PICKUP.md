# AbsoluteJS Voice Pickup

Use this when starting the next session:

```text
We are continuing AbsoluteJS Voice from /home/alexkahn/abs/voice. First read VOICE_PLAN.md and PICKUP.md, then inspect git status in the companion repos listed in PICKUP.md. Do not start by changing the example unless the task requires proof wiring. The next recommended work is combined voice/media artifact readability: make proof-pack output compact and useful by consuming generic media Markdown/artifact helpers from @absolutejs/media instead of dumping huge realtime-channel internals. Keep @absolutejs/voice focused on voice buyer surfaces: readiness, proof pack, operations records, incident timeline, failure replay, real-call evidence runtime, provider/telephony/session surfaces, and framework bindings. If core changes are made, typecheck/test/build, publish a beta, install it into the real example with --force, run the relevant proof, then commit and push all touched repos.
```

## Current State

- Core repo: `/home/alexkahn/abs/voice`
- Current package: `@absolutejs/voice@0.0.22-beta.471`
- Companion media package: `@absolutejs/media@0.0.1-beta.16`
- Companion AbsoluteJS packages used by the Vapi-parity surface (no hard runtime deps from voice): `@absolutejs/ai@0.0.5` (13 LLM provider adapters), `@absolutejs/rag@0.0.10` (in-memory/SQLite/pgvector stores, 11 embedding providers, hybrid search, evaluation, connectors), `voice-adapters` monorepo (OpenAI Realtime / Gemini Live / Deepgram / ElevenLabs / AssemblyAI), `voice-fixtures-multilingual` (23 PCM clips across 7 languages incl. code-switch).
- Latest pushed voice commit: `edf3d00 Add fromVapiAssistantConfig adapter for mechanical Vapi migration`
- Latest real example proof: `.voice-runtime/proof-pack/runtime/2026-05-19T00-39-01.066Z/proof-pack/latest.json` (`failureReplayEvidenceAssertion.summary.media` now carries `pipelineIssueCodes` and `pipelineStatus`)
- Latest proof status: `ok: true`; mediaPipelineCalibrationAssertion summary trimmed from ~35 KB to ~1.7 KB (95% reduction); total proof JSON dropped from ~170 KB to ~114 KB; per-report media artifacts (`media-quality.{json,md}`, `media-transport.{json,md}`, `media-processor-graph.{json,md}`) persisted in the proof-pack run directory and linked from the assertion's `artifacts` field.
- Stable issue codes now exposed: `summary.issueCodes` aggregates calibration/quality/interruption/processor-graph codes; `summary.calibration.issueCodes` and `summary.processorGraph.issueCodes` are also present for per-category gating.
- Media issue codes are now projected into buyer-facing voice surfaces:
  - `VoiceProductionReadinessReport.checks` gets 5 granular media checks (overall, quality, transport, processor graph, interruption) on top of the existing aggregate "Media pipeline quality" check, via `buildVoiceMediaPipelineReadinessChecks`.
  - `VoiceOperationsRecord.mediaPipeline` (new optional field) carries `{ status, qualityStatus, transportStatus, processorGraphStatus, issueCodes, jitterMs, frames, surface }`; populated by passing `mediaPipeline` to either `buildVoiceOperationsRecord` or `createVoiceOperationsRecordRoutes` (the route accepts a sessionId-keyed resolver).
  - `VoiceFailureReplayReport.media.{pipelineIssueCodes,pipelineStatus}` reads from the record; status demotes to `failed`/`degraded` when the pipeline is `fail`/`warn`; incident markdown gets a new "Media Pipeline" section.
  - `VoiceIncidentTimelineOptions.extraEvents` accepts any custom event source; the example feeds `buildVoiceMediaPipelineIncidentEvents` into it so media-pipeline issues appear in `/api/voice/incident-timeline`.

## Companion Repos

- Media primitives: `/home/alexkahn/abs/media`
- Voice adapters monorepo: `/home/alexkahn/abs/voice-adapters`
- Real voice example: `/home/alexkahn/alex/absolutejs-voice-example`
- AbsoluteJS core, only if framework/build issues require it: `/home/alexkahn/abs/absolutejs`

Before doing new work, check:

```sh
git -C /home/alexkahn/abs/voice status --short
git -C /home/alexkahn/abs/media status --short
git -C /home/alexkahn/abs/voice-adapters status --short
git -C /home/alexkahn/alex/absolutejs-voice-example status --short
```

## Boundary

Voice owns product-level voice-agent primitives:

- Assistants, sessions, provider routing, realtime adapters, tools, guardrails, reviews, tasks, campaigns, handoffs, operations records, failure replay, incident timelines, observability export, telephony setup/security, readiness gates, proof packs, and framework bindings.

Voice should not own generic media runtime semantics:

- Media frames, generic media quality calculations, WebRTC stats normalization, telephony stream packet parsing, processor graph lifecycle, and generic media artifact renderers belong in `@absolutejs/media`.

## Next Recommended Work

Compact-artifact readability AND issue-code surfacing are both shipped end-to-end. Helpers now in place:

- `summarizeVoiceMediaPipelineReport(report, { artifacts })` — compact proof envelope, accepts artifact hrefs.
- `writeVoiceMediaPipelineArtifacts({ dir, report, hrefBase })` — persists media-{quality,transport,processor-graph}.{json,md}.
- `extractVoiceMediaPipelineIssueEntries(report)` — flat list of media issues with source attribution.
- `buildVoiceMediaPipelineReadinessChecks(report, { baseHref, label })` — drop-in `VoiceProductionReadinessCheck[]`.
- `buildVoiceMediaPipelineIncidentEvents(report, { now, source, category })` — drop-in `VoiceIncidentTimelineEvent[]`.

Both major tracks are feature-complete:

1. **Media-pipeline + media-artifact integration** — proof pack, readiness, operations record, failure replay, incident timeline.
2. **Vapi-parity agent surface** (Phases 1–3 of the plan in [[project-vapi-parity]]):
   - `createVoiceRAGTool(collection, options)` (beta.469) — wraps any `@absolutejs/rag`-shaped `VoiceRAGCollectionLike` into a Vapi-Query-Tool-shaped agent tool with `searchKnowledgeBase` default name, allowedFilterKeys gating, fixedFilter merging, score thresholding, and grounded-citations formatter.
   - Named tool catalog (beta.470) — `createVoiceEndCallTool`, `createVoiceTransferCallTool`, `createVoiceDTMFTool`, `createVoiceVoicemailDetectionTool`, `createVoiceApiRequestTool` map Vapi `tools[].type` 1:1 onto `VoiceSessionHandle` verbs.
   - `fromVapiAssistantConfig(json, options)` (beta.471) — takes a Vapi Assistant JSON, a caller-supplied `modelFactory`, and optional `knowledgeBase` / `dtmfSendFactory` / `customToolFactory` / `variableResolver`; returns `{ assistant, tools, routeHints, unsupported }`. `{{var}}` templates auto-compile with built-ins (now/date/time) + caller resolver; LiquidJS filters, monitorPlan, startSpeakingPlan, voicemailDetection ML, and toolIds are surfaced in `unsupported` with concrete migration instructions.

Suggested next directions (none blocking):

- Phase 4 of the Vapi plan: write adapter packages for TTS/STT providers the company decides to prioritize (Cartesia, PlayHT, Azure, Speechmatics, Gladia). Each is ~1 day in the voice-adapters monorepo.
- Phase 5: build a `voiceListenAndControlSocket` primitive equivalent to Vapi's `monitorPlan.listenUrl` + `controlUrl` (supervisor barge-in over WebSocket).
- Phase 6: wire `voice-fixtures-multilingual` into a Vapi-parity proof gate (run the corpus against several STT adapters, assert WER < threshold per language).
- Expand `@absolutejs/media` per the MEDIA_PLAN priorities (browser/server WebSocket transport helpers, richer WebRTC inbound/outbound timing, more carrier serializer coverage, processor-graph drain/flush tests).
- Surface the new `record.mediaPipeline` / `media.pipelineIssueCodes` fields in the framework UI helpers (React/Vue/Svelte/Angular ops-record widgets) if/when buyers ask to see media health inside their support consoles.

## Verification Expectations

For voice-only changes:

```sh
bun run typecheck
bun test
bun run build
```

For changes that affect the example or proof surfaces:

```sh
bun run typecheck
bun run proof:pack:server
```

Run example commands from `/home/alexkahn/alex/absolutejs-voice-example`.

If publishing a new voice beta:

- Bump/publish from `/home/alexkahn/abs/voice`.
- Install into the example with `bun add @absolutejs/voice@<version> --force`.
- Run the targeted proof.
- Commit and push core plus example.
