# AbsoluteJS Voice Pickup

Use this when starting the next session:

```text
We are continuing AbsoluteJS Voice from /home/alexkahn/abs/voice. First read VOICE_PLAN.md and PICKUP.md, then inspect git status in the companion repos listed in PICKUP.md. The Vapi-parity audit from earlier sessions is now closed (TTS barge-in cancel, @absolutejs/ai bridge, recording-to-artifact, silence-timeout, cold-transfer, S3 recording, pluggable AMD detector). Next directions are listed in PICKUP under "Suggested next directions" — none are blocking. If core changes are made, typecheck/test/build, publish a beta, install it into the example with --force, run the relevant proof, then commit and push all touched repos.
```

## Current State

- Core repo: `/home/alexkahn/abs/voice`
- Current package: `@absolutejs/voice@0.0.22-beta.479`
- Companion media package: `@absolutejs/media@0.0.1-beta.16`
- Companion AbsoluteJS packages used by the Vapi-parity surface: `@absolutejs/ai@0.0.5` (13 LLM provider adapters, now wired in via `createAIVoiceModel`), `@absolutejs/rag@0.0.10`, `voice-adapters` monorepo (16 adapters, all 8 TTS adapters support `cancel()` for barge-in), `voice-fixtures-multilingual` (23 PCM clips across 7 languages).
- Latest pushed voice commit: `996b8aa test: cover TTS cancel on barge-in at the session level`
- Latest real example proof: `.voice-runtime/proof-pack/runtime/2026-05-19T00-39-01.066Z/proof-pack/latest.json` (NOT re-run against beta.479 — re-run if downstream proof gates need refreshing).
- Voice suite: 979 pass / 1 pre-existing fail (`session snapshot widget summarizes support/debug signals` — flaky/pre-existing, unrelated to recent work).
- Example app at `/home/alexkahn/abs/absolutejs-voice-example-testrun` pinned to voice@0.0.22-beta.479; `/vue` Playwright-verified at 0 console errors/warnings.

## Companion Repos

- Media primitives: `/home/alexkahn/abs/media`
- Voice adapters monorepo: `/home/alexkahn/abs/voice-adapters`
- Real voice example (proof gating): `/home/alexkahn/alex/absolutejs-voice-example`
- Local example used in this session: `/home/alexkahn/abs/absolutejs-voice-example-testrun`
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

- Assistants, sessions, provider routing, realtime adapters, tools, guardrails, reviews, tasks, campaigns, handoffs, operations records, failure replay, incident timelines, observability export, telephony setup/security, readiness gates, proof packs, framework bindings — plus, since the parity audit: TTS barge-in cancel orchestration, ai-package agent-model bridge, audio recording capture, silence-timeout watchdog, cold/warm transfer mode metadata, AMD detector poller.

Voice should not own generic media runtime semantics:

- Media frames, generic media quality calculations, WebRTC stats normalization, telephony stream packet parsing, processor graph lifecycle, and generic media artifact renderers belong in `@absolutejs/media`.

## Vapi-Parity Audit — Closed

Originally five gap areas (see audit run in session preceding 996b8aa). Status now:

| Area | Shipped in |
|---|---|
| TTS barge-in cancel — contract + runtime wiring | voice@.476 |
| TTS cancel impl across all 8 TTS adapters | voice-adapters batch (cartesia .2, elevenlabs .19, azure .3, playht/lmnt/rime/neets/smallest .2) |
| `@absolutejs/ai` bridge to `VoiceAgentModel` | voice@.476 (`createAIVoiceModel`) |
| Audio recording capture + WAV artifact + `recording.ready` event | voice@.477 (file store), voice@.478 (S3 store) |
| Call-level silence timeout end-of-call | voice@.478 (`callSilenceTimeoutMs` option, disposition `silence-timeout`) |
| Cold-transfer mode alongside warm | voice@.478 (`transferMode: "cold" | "warm"` on `api.transfer` + `VoiceTransferCallToolDestination`; `cold-transfer` outcome recipe) |
| Pluggable AMD detector (stream-side, complements existing carrier-AMD webhook routing) | voice@.479 (`VoiceAMDDetector`, `createMonologueAMDDetector`) |
| Session-level barge-in integration test | covered by 996b8aa (the test commit on top of .479) |

Coverage of the technical Vapi-parity surface is now ~85–90%. Remaining 10–15% is SIP REFER signaling (operator concern, lives in telephony adapter implementations) and ML-grade AMD (now a one-function plug-in via `VoiceAMDDetector`).

## New Public Surface Added by the Audit Work

Exported from `@absolutejs/voice`:

- `createAIVoiceModel({ provider, model, signal?, systemPrompt? })` — adapts an `@absolutejs/ai` `AIProviderConfig` to `VoiceAgentModel`. Translates messages (incl. `tool_result` content blocks), tool schemas, accumulates stream chunks. `@absolutejs/ai` is an optional peer dep.
- `ttsAdapterSessionCanCancel(session)` type guard for the optional `TTSAdapterSession.cancel?`.
- Recording: `createVoiceMemoryRecordingStore`, `createVoiceFileRecordingStore` (via `fileStore.ts`), `createVoiceS3RecordingStore` (via `s3Store.ts`), `encodePcmAsWav`, `computePcmDurationMs`. Types: `VoiceRecordingStore`, `VoiceRecordingArtifact`, `StoredVoiceRecordingArtifact`, `VoiceRecordingChannel`. New trace event type: `"recording.ready"` with payload `{ channel, durationMs, recordingUrl, sessionId, sizeBytes }`.
- AMD: `createMonologueAMDDetector({ minMonologueMs?, intervalMs?, reason?, requireFirstAudio? })`, types `VoiceAMDDetector`, `VoiceAMDDetectorInput`, `VoiceAMDVerdict`, `MonologueAMDDetectorOptions`.
- `CreateVoiceSessionOptions` gained: `recording?: { store, channels?, maxBytesPerChannel?, userInputFormat? }`, `callSilenceTimeoutMs?`, `amd?: VoiceAMDDetector`.
- `VoiceSessionHandle.transfer({ ..., transferMode?: "cold" | "warm" })` — flows through to `call.lifecycle` metadata and `VoiceRouteResult.transfer.transferMode`.
- `VoiceCallDisposition` gained `"silence-timeout"`.
- `VoiceOutcomeRecipeName` gained `"cold-transfer"`.

## Prior Tracks (still feature-complete)

1. **Media-pipeline + media-artifact integration** — proof pack, readiness, operations record, failure replay, incident timeline. Helpers: `summarizeVoiceMediaPipelineReport`, `writeVoiceMediaPipelineArtifacts`, `extractVoiceMediaPipelineIssueEntries`, `buildVoiceMediaPipelineReadinessChecks`, `buildVoiceMediaPipelineIncidentEvents`.
2. **Vapi-parity agent surface (Phases 1–3)** — `createVoiceRAGTool`, named tool catalog, `fromVapiAssistantConfig`.
3. **Phase 4 adapter coverage** — 16 adapters in `voice-adapters` (see voice-adapters/README.md for live list and versions).
4. **Phase 5 monitor sockets** — `createVoiceLiveMonitorRoutes` + `createVoiceMonitorRuntimeBinding`.
5. **Phase 6 multilingual proof gate** — `runVoiceMultilingualProof`, `buildVoiceMultilingualProofReadinessCheck`, `renderVoiceMultilingualProofMarkdown`.

## Suggested Next Directions (none blocking)

- **Run a fresh proof-pack against beta.479** in `/home/alexkahn/alex/absolutejs-voice-example` to confirm the audit-driven runtime changes don't shift any proof outputs. Especially worth doing if buyers are about to consume the artifact set.
- **Framework UI surfaces for the new fields**: React/Vue/Svelte/Angular widgets for recording playback (download links from `recording.ready` events), AMD verdict reasons, transfer mode, silence-timeout dispositions. Hooks are already in place; just no widgets yet.
- **Remaining Phase 4 adapters if buyers ask**: Tavus (TTS+video — needs a new adapter category), Talkscriber STT, Cartesia STT/Ink when GA.
- **Telephony-side SIP REFER**: real cold-transfer signaling inside `src/telephony/twilio.ts` / `telnyx.ts`. The voice runtime now propagates `transferMode: "cold"` through metadata; the adapters need to read it and issue REFER vs hold-and-bridge.
- **Stream-side AMD heuristics beyond monologue detection**: beep-frequency analysis, energy-pattern classifiers. The `VoiceAMDDetector` contract supports any implementation; only the monologue detector ships in-tree.
- **`createVoiceAMDWebhookRoute`** wrapper if buyers want a packaged Twilio/Telnyx AMD callback route. Today the carrier-side path goes through `createVoiceTelephonyWebhookRoutes` which already normalizes `AnsweredBy=machine_*` → `api.markVoicemail`; a slimmer dedicated route is sugar, not new capability.
- **Expand `@absolutejs/media`** per the MEDIA_PLAN priorities.

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
- If the change touches the `TTSAdapterSession` / `STTAdapterSession` / `RealtimeAdapterSession` contracts: also bump every adapter in `/home/alexkahn/abs/voice-adapters` that pins voice as a dep, retest, and publish.
