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

Vapi-parity adapter coverage progress (Phase 4):
- **`@absolutejs/voice-cartesia@0.0.1-beta.1`** (shipped) — TTS via Cartesia `/tts/sse` and `/tts/bytes`. Sonic-2 + older models, voice-by-id or voice-by-embedding, mulaw/alaw telephony formats. 7 tests.
- **`@absolutejs/voice-azure@0.0.1-beta.2`** (shipped) — Neural TTS via REST + SSML (`azureTTS`) and streaming STT via the WebSocket Unified Speech Protocol (`azureSTT`) with no Microsoft SDK dependency. 18 tests.
- **`@absolutejs/voice-playht@0.0.1-beta.1`** (shipped) — TTS via PlayHT `/api/v2/tts/stream`. Play3.0-mini / PlayDialog / PlayHT2.0-turbo engines, raw PCM s16le or mulaw telephony. 7 tests.
- **`@absolutejs/voice-speechmatics@0.0.1-beta.1`** (shipped) — Streaming STT via Speechmatics' v2 WebSocket protocol. StartRecognition → AddPartialTranscript / AddTranscript → EndOfTranscript / EndOfStream, regional endpoints (eu, eu2, usa), enhanced/standard operating points, diarization, punctuation-token joining. 9 tests.
- **`@absolutejs/voice-gladia@0.0.1-beta.1`** (shipped) — Streaming STT via Gladia's v2 live API (HTTP /v2/live POST + WebSocket binary audio). Solaria-1 model, code-switch language detection, partial/final transcript mapping with per-utterance confidence + start/end timing. 9 tests.
- **`@absolutejs/voice-rime@0.0.1-beta.1`** (shipped) — TTS via Rime `/v1/rime-tts`. mist / mistv2 / arcana voice models, raw PCM or mulaw telephony, speedAlpha / phonemizeBetweenBrackets / reduceLatency controls. 6 tests.
- **`@absolutejs/voice-lmnt@0.0.1-beta.1`** (shipped) — TTS via LMNT `/v1/ai/speech/stream`. aurora / blizzard / mochi models, raw PCM or mulaw, conversational / temperature / topP / seed / speed controls, language detection. 5 tests.
- **`@absolutejs/voice-soniox@0.0.1-beta.1`** (shipped) — Streaming STT via Soniox `/transcribe-websocket`. Token-by-token transcripts with is_final flags bucketed into partial/final events, language hints, speaker diarization, endpoint detection, per-token confidence/timing/language/speaker lifted. 8 tests.
- **`@absolutejs/voice-neets@0.0.1-beta.1`** (shipped) — TTS via Neets `/v1/tts` HTTP, ar-diff-50k / style-tts-2 / vits models, X-API-Key auth, PCM streaming. 5 tests.
- **`@absolutejs/voice-smallest@0.0.1-beta.1`** (shipped) — TTS via Smallest `/api/v1/{model}/get_speech`, lightning + lightning-v2 models, English + Hindi, speed / similarity / consistency / enhancement controls. 5 tests.
- **`@absolutejs/voice-openai-whisper@0.0.1-beta.1`** (shipped) — STT via OpenAI `/v1/audio/transcriptions` in **buffered-batch** mode: accumulate PCM chunks, build a RIFF header on flush(), POST as WAV, emit one final transcript + endOfTurn per flush. Supports whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe. Documented as the turn-based / fallback path; the streaming OpenAI path lives in `voice-openai`. 8 tests.
- **`@absolutejs/voice-google-speech@0.0.1-beta.2`** (shipped) — Google Cloud Speech-to-Text with BOTH modes:
  - `googleSpeech(...)` — buffered-batch via REST `/v1/speech:recognize`. Three auth modes (API key, static OAuth, async refresh). Honors all Google models, alternativeLanguageCodes, speechContexts, useEnhanced, automatic punctuation, speaker diarization. 9 tests.
  - `googleSpeechStream(...)` — **real-time bidirectional streaming via gRPC**. Hand-rolled protobuf wire format for StreamingRecognizeRequest/Response (no `@grpc/grpc-js` dep), gRPC-Web framing, `node:http2` for full-duplex transport (Bun's fetch is half-duplex). Pluggable transport for testability. Emits partial/final transcripts as Google streams them; maps speech_event_type END_OF_UTTERANCE / SPEECH_ACTIVITY_END to endOfTurn. 5 protobuf tests + 4 gRPC frame tests + 11 end-to-end tests via fake transport = 20 new tests.

Provider coverage vs Vapi's list now:
- LLM: 2/7 native + Anthropic in voice + 13 via @absolutejs/ai → effectively complete.
- TTS: **8/12** (ElevenLabs, Cartesia, Azure Neural, PlayHT, Rime, LMNT, Neets, Smallest).
- STT: **8/11 providers, 9 capabilities** (Deepgram, AssemblyAI, Azure, Speechmatics, Gladia, Soniox, OpenAI Whisper-buffered, Google Speech-buffered AND streaming). Google now has the same streaming-quality + buffered-fallback split as voice-openai (realtime) + voice-openai-whisper (buffered).

**Phase 6 shipped (voice@0.0.22-beta.472):** `runVoiceMultilingualProof`, `buildVoiceMultilingualProofReadinessCheck`, and `renderVoiceMultilingualProofMarkdown`. Wires `voice-fixtures-multilingual` through `runSTTAdapterBenchmark`, buckets results by language, applies per-language thresholds (max WER / min WAR / min pass rate / min term recall) layered over caller defaults, and emits a structured report + `VoiceProductionReadinessCheck` for drop-in gating. 7 tests.

**Phase 5 shipped (voice@0.0.22-beta.473):** `createVoiceLiveMonitorRoutes` + `createVoiceInMemoryMonitorRegistry` + `createVoiceMonitorSession` + `buildVoiceMonitorPlan`. Two WebSocket routes per session matching Vapi's `monitorPlan.listenUrl` (binary outbound audio fan-out) + `monitorPlan.controlUrl` (JSON control messages with default handlers wired to `VoiceSessionHandle` verbs: transfer/hangup/escalate/voicemail/no-answer; mute/say/inject are caller-supplied). Pluggable auth hook. Renamed from `createVoiceMonitorRoutes` to `createVoiceLiveMonitorRoutes` to avoid a naming collision with the existing health-monitor module. 11 tests; voice suite now 959 pass / 1 pre-existing fail.

Suggested next directions (none blocking):

- Remaining Phase 4 gaps if buyers ask: Tavus (TTS+video — different shape because Tavus is avatar-first; would need a new adapter category), Talkscriber STT (small player, limited public docs), Cartesia STT/Ink (once their STT GA stabilizes — could land as a second export in the existing `voice-cartesia` package).
- **Phase 5 follow-up**: wire voice's existing `activeSessions` runtime into the monitor registry so live calls auto-register and outbound audio auto-fans-out. Currently the registry is a primitive that callers (or a future runtime hook in `plugin.ts`) populate by hand. Suggested approach: add a `monitorRegistry?: VoiceMonitorMutableRegistry` option to the main voice plugin; on session open, build a `createVoiceMonitorSession` from the new handle and `register()` it; tap the outbound TTS path to call `record.emit()` per audio frame.
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
