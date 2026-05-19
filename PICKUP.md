# AbsoluteJS Voice Pickup

Use this when starting the next session:

```text
We are continuing AbsoluteJS Voice from /home/alexkahn/abs/voice. First read VOICE_PLAN.md and PICKUP.md, then inspect git status in the companion repos listed in PICKUP.md. Audit #1 (5 gap areas) shipped through beta.479; audit #2 (21 more gaps) top-5 shipped through beta.484; second-tier voice gaps from audit #2 shipped through beta.491. The remaining roadmap is in this file. If core changes are made, typecheck/test/build, publish a beta, install it into the example with --force, run the relevant proof, then commit and push all touched repos.
```

## Current State

- Core repo: `/home/alexkahn/abs/voice`
- Current package: `@absolutejs/voice@0.0.22-beta.491`
- Companion media package: `@absolutejs/media@0.0.1-beta.16`
- Companion AbsoluteJS packages: `@absolutejs/ai@0.0.5` (13 LLM provider adapters, wired in via `createAIVoiceModel`), `@absolutejs/rag@0.0.10`, `voice-adapters` monorepo (16 adapters, all 8 TTS adapters support `cancel()` for barge-in), `voice-fixtures-multilingual` (23 PCM clips across 7 languages).
- Latest pushed voice commit: `4d21745 0.0.22-beta.491: outbound campaign retry policy + DNC + window enforcement`
- Latest real example proof: `.voice-runtime/proof-pack/runtime/2026-05-19T00-39-01.066Z/proof-pack/latest.json` (NOT re-run since beta.479).
- Voice suite: 1062 pass / 1 pre-existing fail (`session snapshot widget summarizes support/debug signals`).
- Example app at `/home/alexkahn/abs/absolutejs-voice-example-testrun` pinned to voice@0.0.22-beta.479; needs a `bun add @absolutejs/voice@0.0.22-beta.484 --force` re-pin before next demo run.

## Companion Repos

- Media primitives: `/home/alexkahn/abs/media`
- Voice adapters monorepo: `/home/alexkahn/abs/voice-adapters`
- Real voice example (proof gating): `/home/alexkahn/alex/absolutejs-voice-example`
- Local example used in recent sessions: `/home/alexkahn/abs/absolutejs-voice-example-testrun`
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

- Assistants, sessions, provider routing, realtime adapters, tools, guardrails, reviews, tasks, campaigns, handoffs, operations records, failure replay, incident timelines, observability export, telephony setup/security, readiness gates, proof packs, framework bindings — plus all the audit-driven additions listed in the tables below.

Voice should not own generic media runtime semantics:

- Media frames, generic media quality calculations, WebRTC stats normalization, telephony stream packet parsing, processor graph lifecycle, generic media artifact renderers, **noise suppression** (Krisp / RNNoise), **audio bleep / edit primitives** belong in `@absolutejs/media`.

## Vapi-Parity Audit #1 — Closed

Five gap areas, all shipped through voice@.479:

| Area | Shipped in |
|---|---|
| TTS barge-in cancel — contract + runtime wiring | voice@.476 |
| TTS cancel impl across all 8 TTS adapters | voice-adapters batch (cartesia .2, elevenlabs .19, azure .3, playht/lmnt/rime/neets/smallest .2) |
| `@absolutejs/ai` bridge to `VoiceAgentModel` | voice@.476 (`createAIVoiceModel`) |
| Audio recording capture + WAV artifact + `recording.ready` event | voice@.477 (file store), voice@.478 (S3 store) |
| Call-level silence timeout end-of-call | voice@.478 (`callSilenceTimeoutMs`, disposition `silence-timeout`) |
| Cold-transfer mode alongside warm | voice@.478 (`transferMode: "cold" \| "warm"`; `cold-transfer` outcome recipe) |
| Pluggable AMD detector | voice@.479 (`VoiceAMDDetector`, `createMonologueAMDDetector`) |
| Session-level barge-in integration test | covered by 996b8aa |

## Vapi-Parity Audit #2 — Top-5 Shipped

Second audit against Vapi + Retell + Bland + Pipecat + LiveKit + Hume + Deepgram + OpenAI Realtime identified 21 more gaps. The top-5 picks all shipped this session:

| # | Pick | Beta | Public surface |
|---|---|---|---|
| 1 | Per-call cost reporting | voice@.480 | `createVoiceCostAccountant`, `DEFAULT_VOICE_PRICE_BOOK`, `cost.ready` trace event, `createAIVoiceModel.onUsage` hook, `costAccountant`/`costTelephony` on session options |
| 2 | PII redaction (diarization + keyterms already wired) | voice@.481 | `createVoiceTranscriptRedactor`, `DEFAULT_VOICE_REDACTION_PATTERNS` (CC/SSN/email/phone), `redact?` on session options. Audio-side bleep deferred to `@absolutejs/media` |
| 3 | LLM-as-judge rubric eval | voice@.482 | `createVoiceLLMJudge` + `createVoiceAIJudgeCompletion`, weighted scoring, required-criteria gates, markdown-fence JSON parsing |
| 4 | Semantic turn detection | voice@.483 | `VoiceSemanticTurnDetector` interface, `createPunctuationSemanticTurnDetector`, `createRegexSemanticTurnDetector`, wired into `handleFinal` to commit before silence timer |
| 5 | S2S first-class assistant mode | voice@.484 | `VoiceAssistantMode`, `resolveVoiceAssistantMode`, semanticVAD/modalities/promptCacheKey on `RealtimeAdapterOpenOptions`, mode-tagged trace events |

## Vapi-Parity Audit #2 — Second-Tier Voice Gaps Shipped

| Gap | Beta | Public surface |
|---|---|---|
| Webhook signature verification helper | voice@.485 | `verifyVoiceWebhookSignature`, `signVoiceWebhookBody`, `extractVoiceWebhookSignatureFromHeaders`, `VOICE_WEBHOOK_SIGNATURE_HEADER`/`_TIMESTAMP_HEADER` |
| OTEL exporter for turn-by-turn latency | voice@.486 | `createVoiceOTELHTTPExporter`, `aggregateVoiceTurnLatencySpans`, `buildVoiceOTELPayload`, `buildOTELTraceId`/`SpanId` |
| Per-caller persistent memory | voice@.487 | `createVoiceCallerMemoryNamespace`, `buildVoiceCallerMemoryNamespace`, `summarizeVoiceCallerTranscript`, `VOICE_CALLER_MEMORY_KEY`, types `VoiceCallerIdentity`/`VoiceCallerMemorySnapshot` |
| Pre-agent IVR plan | voice@.488 | `evaluateVoiceIVRPlan`, `createVoiceIVRSession`, `describeVoiceIVRPlan`, types `VoiceIVRPlan`/`VoiceIVRBranch`/`VoiceIVRMatch`/`VoiceIVRDecision`/`VoiceIVRInput`/`VoiceIVRSession` |
| Backchannel injection driver | voice@.489 | `createVoiceBackchannelDriver`, types `VoiceBackchannelCue`/`VoiceBackchannelDriver`/`VoiceBackchannelDriverOptions` |
| Mid-call UI state derivation | voice@.490 | `deriveVoiceAgentUIState`, `describeVoiceAgentUIState`, `voiceAgentUIStateOrder`, types `VoiceAgentUIState`/`VoiceAgentUIInput` |
| Outbound campaign retry/DNC/window | voice@.491 | `shouldRetryCampaignAttempt`, `isWithinCampaignWindow`, `createInMemoryDNCList`, `isPhoneOnDNC`, `normalizePhoneNumber`, `summarizeVoiceCampaignDispositions`, types `VoiceCampaignDisposition`/`VoiceCampaignDispositionRetryPolicy`/`VoiceCampaignDispositionSummary`/`VoiceDNCList` |

## Vapi-Parity Audit #2 — Remaining Roadmap

Organized by package + ordered by leverage. Free to pick any block; each is independent unless noted.

### `@absolutejs/voice` (1 left)

| Gap | Size | Hook |
|---|---|---|
| Framework-specific components on top of `deriveVoiceAgentUIState` | small | `<AgentState>`, `<InterruptButton>`, `<TypingIndicator>` for React/Vue/Svelte/Angular. State derivation already shipped in .490 — these are thin renderers around it |
| Custom LLM endpoint with OAuth2 (OpenAI-compatible) | tiny | Confirm `@absolutejs/ai` openaiCompatible accepts arbitrary base URL + OAuth2; expose as single config knob (mostly an ai-package + docs task) |

### `@absolutejs/media` (2)

| Gap | Size | Hook |
|---|---|---|
| Krisp / RNNoise noise suppression processor | small (RNNoise) / medium (Krisp) | New `NoiseSuppressor` processor in the processor graph; ship `RnnoiseProcessor` (open) + `KrispProcessor` (commercial) adapters. Voice wires it in front of STT adapter sessions |
| Audio bleep primitive | medium | Audio-edit primitive for card-number redaction in recorded artifacts (complements voice's text redaction shipped in .481) |

### `@absolutejs/rag` (2)

| Gap | Size | Hook |
|---|---|---|
| Reranker interface (Cohere/Voyage/BGE) | small | New `Reranker` interface; cross-encoder rerank before LLM |
| Citation IDs propagation | tiny | `ragTool.ts` emits citation IDs into the turn artifact |

### `@absolutejs/ai` (1)

| Gap | Size | Hook |
|---|---|---|
| OpenAI-compatible URL + OAuth2 client-credentials | tiny | Confirm/extend `openaiCompatible` adapter; pair with the voice-side custom-LLM gap above |

### New package

| Gap | Size | Hook |
|---|---|---|
| `@absolutejs/voice-widget` — embeddable browser widget | medium | Drop-in `<VoiceWidget assistantId>` with mic perms, mute, push-to-talk, device picker, theming. Biggest funnel-improvement (most prospects want "paste this snippet"). Lower layers (`browserMediaRoutes`, `react/`, `client/duplex`) already exist |

### Medium-term (2)

| Gap | Size | Hook |
|---|---|---|
| Multimodal image/screen-share mid-call | medium | Frame types in `media`, image-frame on session timeline in voice, `@absolutejs/ai` already supports multimodal LLMs |
| Prosody-aware TTS + sentiment-aware STT | medium | Hume EVI adapter as the marquee surface, ElevenLabs/Cartesia style controls pass-through, sentiment-tag tool via `@absolutejs/ai` |

### Out of scope — adapter-only

These are not gaps to build; we license/integrate via adapters:

- Krisp's BVC model itself (we ship the adapter, license the model)
- Hume's eLLM / 100K custom voices (adapter only)
- OpenAI Realtime / Gemini Live / Deepgram Voice Agent foundation models (adapter only)
- Visual no-code pathway editor competing with Bland Pathways (the DSL is worth it, the polished editor is not)
- Hosted telephony brokerage (stay adapter-layer over Twilio/Telnyx)

## New Public Surface Added by Audit #2 Top-5

Exported from `@absolutejs/voice@0.0.22-beta.484`:

- **Cost (.480)**: `createVoiceCostAccountant({ priceBook?, sessionId? })`, `DEFAULT_VOICE_PRICE_BOOK`, types `VoiceCostAccountant`, `VoiceCostBreakdown`, `VoiceCostLLMRecord`, `VoiceCostTTSRecord`, `VoiceCostSTTRecord`, `VoiceCostTelephonyRecord`, `VoicePriceBook`, `VoiceProviderRates`. `createAIVoiceModel` gained `onUsage?` + `providerName?` options. New trace event `cost.ready`. Session options: `costAccountant?`, `costTelephony?: { provider? }`.
- **Redaction (.481)**: `createVoiceTranscriptRedactor({ patterns? })`, `redactVoiceTranscript`, `DEFAULT_VOICE_REDACTION_PATTERNS`, types `VoiceTranscriptRedactor`, `VoiceRedactionPattern`, `CreateVoiceTranscriptRedactorOptions`. Session options: `redact?: VoiceTranscriptRedactor`.
- **LLM judge (.482)**: `createVoiceLLMJudge({ rubric, completion, systemPrompt? })`, `createVoiceAIJudgeCompletion({ provider, model })`, types `VoiceLLMJudge`, `VoiceLLMJudgeRubric`, `VoiceLLMJudgeRubricCriterion`, `VoiceLLMJudgeVerdict`, `VoiceLLMJudgeCriterionVerdict`, `VoiceLLMJudgeInput`, `VoiceLLMJudgeCompletion`, `CreateVoiceLLMJudgeOptions`, `CreateVoiceAIJudgeCompletionOptions`.
- **Semantic turn (.483)**: `createPunctuationSemanticTurnDetector`, `createRegexSemanticTurnDetector`, types `VoiceSemanticTurnDetector`, `VoiceSemanticTurnInput`, `VoiceSemanticTurnVerdict`, `CreatePunctuationSemanticTurnDetectorOptions`, `CreateRegexSemanticTurnDetectorOptions`. Session options: `semanticTurnDetector?`.
- **S2S mode (.484)**: `resolveVoiceAssistantMode`, `describeVoiceAssistantMode`, types `VoiceAssistantMode`, `VoiceAssistantModality`, `VoiceAssistantModeDescriptor`, `VoiceSemanticVADConfig`. `RealtimeAdapterOpenOptions` gained `semanticVAD?`, `modalities?`, `promptCacheKey?`. Session options: `assistantMode?`, `modalities?`. `turn.assistant` trace payload gained `assistantMode`.

## Prior Tracks (still feature-complete)

1. **Media-pipeline + media-artifact integration** — proof pack, readiness, operations record, failure replay, incident timeline.
2. **Vapi-parity agent surface (Phases 1–3)** — `createVoiceRAGTool`, named tool catalog, `fromVapiAssistantConfig`.
3. **Phase 4 adapter coverage** — 16 adapters in `voice-adapters`.
4. **Phase 5 monitor sockets** — `createVoiceLiveMonitorRoutes` + `createVoiceMonitorRuntimeBinding`.
5. **Phase 6 multilingual proof gate** — `runVoiceMultilingualProof`, `buildVoiceMultilingualProofReadinessCheck`, `renderVoiceMultilingualProofMarkdown`.

## Suggested Next Directions

Pick any block from the audit-2 remaining-16 table above, or:

- **Run a fresh proof-pack against beta.484** in `/home/alexkahn/alex/absolutejs-voice-example` to confirm the audit-driven runtime changes don't shift any proof outputs.
- **Re-pin `/home/alexkahn/abs/absolutejs-voice-example-testrun` to .484** (`bun add @absolutejs/voice@0.0.22-beta.484 --force`) and re-verify `/vue` in Playwright.

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
