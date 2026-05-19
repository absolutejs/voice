# AbsoluteJS Voice Pickup

Use this when starting the next session:

```text
We are continuing AbsoluteJS Voice from /home/alexkahn/abs/voice. First read VOICE_PLAN.md and PICKUP.md, then inspect git status in the companion repos listed in PICKUP.md. Audit #1 (5 gap areas) shipped through beta.479; audit #2 (21 more gaps) top-5 shipped through beta.484; second-tier voice gaps from audit #2 shipped through beta.491; cross-platform competitive gaps shipped through beta.509; outbound + compliance kit shipped through beta.510; supervisor / live-coaching kit shipped through beta.511. The remaining roadmap is in this file. If core changes are made, typecheck/test/build, publish a beta, install it into the example with --force, run the relevant proof, then commit and push all touched repos.
```

## Current State

- Core repo: `/home/alexkahn/abs/voice`
- Current package: `@absolutejs/voice@0.0.22-beta.511` (supervisor / live-coaching kit: whisper channel, live coach nudges, transcript annotator, supervisor presence, permission tiers)
- Companion media package: `@absolutejs/media@0.0.1-beta.18` (audio redaction + noise suppression contract + ffmpeg adapter)
- Companion AbsoluteJS packages: `@absolutejs/ai@0.0.6` (sampling params, tool-choice, JSON mode, OAuth tokenSource, onUsage/onSpan instrumentation), `@absolutejs/rag@0.0.10`, `voice-adapters` monorepo (16 adapters, all 8 TTS adapters support `cancel()` for barge-in), `voice-fixtures-multilingual` (23 PCM clips across 7 languages).
- Latest pushed voice commit: `0d7809c 0.0.22-beta.511: supervisor / live-coaching kit (whisper, live coach, annotator, presence, permissions)`
- Latest real example proof: `.voice-runtime/proof-pack/runtime/2026-05-19T00-39-01.066Z/proof-pack/latest.json` (NOT re-run since beta.479).
- Voice suite: **1314 pass / 0 fail** on last run (flaky `fileStore.test.ts` filesystem-mtime test passed cleanly).
- Example app at `/home/alexkahn/abs/absolutejs-voice-example-testrun` pinned to voice@0.0.22-beta.505; typecheck passes; `/vue` Playwright-verified at 0 console errors/warnings against .505.

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
| RAG citation extractor (reranker already in `@absolutejs/rag`) | voice@.492 | `extractVoiceRAGCitations`, type `VoiceRAGCitationSummary` |
| OAuth2 token source for custom LLM endpoints | voice@.493 | `createVoiceOAuth2TokenSource`, types `VoiceOAuth2TokenSource`/`VoiceOAuth2TokenResponse`/`CreateVoiceOAuth2TokenSourceOptions` |

## Vapi-Parity Audit #2 — Remaining Roadmap

Organized by package + ordered by leverage. Free to pick any block; each is independent unless noted.

### `@absolutejs/voice` (0 left — voice surface done for audit #2)

The framework-specific `<AgentState>`/`<InterruptButton>`/`<TypingIndicator>` components on top of `deriveVoiceAgentUIState` (.490) can be added as thin renderers if buyers ask; the state derivation is the harder half and is done.

### `@absolutejs/ai@0.0.6` — Shipped this session

| Gap | Surface |
|---|---|
| Sampling parameters | `temperature`, `topP`, `maxTokens`, `stopSequences`, `seed`, `frequencyPenalty`, `presencePenalty` on `AIProviderStreamParams`, wired through all 5 native providers |
| toolChoice + parallelToolCalls | `AIProviderToolChoice = 'auto' \| 'none' \| 'required' \| { name }` |
| JSON mode / structured output | `AIProviderResponseFormat = { type: 'text' \| 'json_object' } \| { type: 'json_schema', name, schema, strict? }` |
| OAuth `tokenSource` | `openai({ tokenSource })` + `openaiCompatible({ tokenSource })`. Composes with `createVoiceOAuth2TokenSource` from voice@.493 |
| `onUsage` + `onSpan` instrumentation | New `providers/instrumentation.ts` wraps every provider to tap `AIDoneChunk.usage`; cost + OTEL flow into operator callbacks |

### `@absolutejs/media@0.0.1-beta.17` — Shipped this session

| Gap | Surface |
|---|---|
| Audio bleep primitive | `applyAudioRedaction(pcm, format, ranges, options?)` with silence or tone fill; `mergeAudioRedactionRanges`. Pairs with voice's text redaction (.481) |
| Noise suppression contract | `NoiseSuppressor` interface; `createPassThroughNoiseSuppressor`, `createEnergyGateNoiseSuppressor`, `composeNoiseSuppressors`. Third-party Krisp/RNNoise adapters slot in via the interface |

### voice@0.0.22-beta.494/.495 — Embeddable widget shipped (all 4 frameworks)

| Gap | Surface |
|---|---|
| Shared view-model | `createVoiceWidgetViewModel`, `renderVoiceWidgetHTML`, `DEFAULT_VOICE_WIDGET_THEME`, `DEFAULT_VOICE_WIDGET_LABELS` in `src/client/voiceWidgetView.ts`. Derives agent state, merges theme/labels with defaults, picks status label, computes `canStart/canMute/canEnd`. HTML rendering escapes user-controlled strings. All framework wrappers route through it. |
| React (.494/.495) | `<VoiceWidget />` from `@absolutejs/voice/react` |
| Vue (.495) | `<VoiceWidget />` from `@absolutejs/voice/vue` |
| Svelte (.495) | `createVoiceWidget(path, options)` from `@absolutejs/voice/svelte`. Returns `{ startCall, mute, endCall, subscribe, getSnapshot, getViewModel, getHTML }` |
| Angular (.495) | `VoiceWidgetService.connect(path, options)` from `@absolutejs/voice/angular` |

### voice@0.0.22-beta.496 — Multimodal mid-call attachments

| Gap | Surface |
|---|---|
| Image / document attachments | `VoiceAgentMessageAttachment = { kind: 'image' \| 'document', ... }`, `VoiceAgentMessage.attachments?`, `VoiceTurnRecord.attachments?`. `VoiceSessionHandle.attachUserMedia(attachment)` buffers until next turn commit. `createAIVoiceModel` translates into `AIProviderContentBlock` arrays so Anthropic / OpenAI / Gemini receive them via the multimodal content surface |

### voice@0.0.22-beta.497 — Prosody / sentiment adapter pass-throughs

| Gap | Surface |
|---|---|
| TTS prosody | `VoiceTTSProsody { style?, speed?, pitch?, emphasis? }`. `TTSAdapterOpenOptions.prosody?`. `CreateVoiceSessionOptions.prosody?` flows through to `ttsAdapter.open()`. Adapters that support style/speed/pitch (ElevenLabs, Cartesia, OpenAI tts-1, Azure Neural, Hume EVI when added) opt in |
| STT sentiment | `VoiceTranscriptSentiment { label, score?, metadata? }`. `Transcript.sentiment?` — STT adapters that emit sentiment (Hume EVI, AssemblyAI sentiment-analysis) populate it |

### voice@0.0.22-beta.498 — Three follow-up buckets closed

**Bucket 3 — operator-config defaults:**

| Gap | Surface |
|---|---|
| `defineVoiceAssistant` unified factory | `defineVoiceAssistant({ id, agent, voice, prosody, recording, redact, amd, semanticTurnDetector, callSilenceTimeoutMs, ops, guardrails, memory, route?, tools? })` returns `{ assistant, definition, toSessionOptions(input) }`. Collapses the 12-object wiring sprawl into a 30-line config blob |
| Audit retention policy | `createVoiceRetentionScheduler`, `purgeVoiceRetentionStore`, types `VoiceRetentionPolicyOptions`/`VoicePurgeReport`/`VoiceRetentionStore` |
| Per-customer call quota | `createInMemoryVoiceCallQuota({ tiers, strict? })`. Reservation lifecycle with concurrency + monthly-minutes caps. Rejection reasons: `concurrency-exceeded`, `monthly-minutes-exceeded`, `customer-not-found` |
| Route auth middleware | `createVoiceRouteAuth({ verify, bypassPaths? })` Elysia plugin + `createVoiceBearerAuthVerifier` + `createVoiceHMACAuthVerifier` (uses the verifyVoiceWebhookSignature primitive from .485) |

**Bucket 1 — redaction end-to-end:**

| Gap | Surface |
|---|---|
| Text-redaction → audio-bleep coupling | `deriveVoiceRecordingRedactionRanges({ transcripts, patterns?, paddingMs?, recordingStartedAtEpochMs? })`. Walks final transcripts, matches DEFAULT_VOICE_REDACTION_PATTERNS, emits AudioRedactionRange[] ready for media's `applyAudioRedaction` (.17). End-to-end: voice redacts transcript text (.481) → derive ranges → media bleeps recording (.17) |

**Bucket 2 — dashboard view models (framework-agnostic):**

| Gap | Surface |
|---|---|
| Cost dashboard | `buildVoiceCostDashboardReport({ events, bucketBy?, fromMs?, toMs? })` rolls up cost.ready trace events into per-bucket + grand-total breakdowns |
| Live call viewer | `createLiveCallViewer({ sessionId, bufferLimit?, startedAt? })` returns an observable view-state. Consumer wires monitor-socket events to applyMonitorEvent/noteTranscript/notePartial/noteAgentAudio |
| Replay UI | `buildReplayTimelineReport({ artifact })` flattens a `VoiceCallReviewArtifact` timeline into categorized events + turn-count summary |

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

### voice@0.0.22-beta.509 — 5 more pragmatic pieces

| Gap | Surface |
|---|---|
| Hold-audio / wait-filler injection | `createVoiceHoldAudioDriver({ onCue, cues?, thinkingThresholdMs?, cooldownMs? })` returns `{ noteThinking, noteResponse, reset }`. Fires "let me check" cues when the agent thinks too long. Default cues, configurable threshold + cooldown |
| Prompt-injection / adversarial input guard | `createVoicePromptInjectionGuard({ rules?, sanitizedReplacement? })` returns `{ evaluate, sanitize, rules }`. `DEFAULT_VOICE_PROMPT_INJECTION_RULES` covers ignore-prior-instructions, role-override, system-prompt-leak, developer-impersonation, jailbreak-persona, tool-misuse-request |
| Live-agent console UI (all 4 frameworks) | `VoiceLiveAgentConsole` React component + `VoiceLiveAgentConsoleProps`; Vue `VoiceLiveAgentConsole` defineComponent; Svelte `createVoiceLiveAgentConsole` + `renderVoiceLiveAgentConsoleHTML`; Angular `VoiceLiveAgentConsoleService`. All route through the existing `createLiveAgentConsole` view-model |
| In-call NPS / CSAT collector | `createVoicePostCallSurvey({ sessionId, questions?, now? })` returns `{ next, record, skip, complete, getResponse, questions }`. `DEFAULT_VOICE_POST_CALL_SURVEY_QUESTIONS` (NPS 0–10, resolved bool, free-text comment). `summarizeVoicePostCallSurveys(responses)` rolls up NPS / promoters / detractors / completion |
| DTMF input collector | `collectVoiceDTMFInput({ prompt, minLength?, maxLength?, terminator?, timeoutMs?, interDigitTimeoutMs?, validator?, now? })` returns `{ feed, tick, cancel, getState, subscribe }`. `validateVoiceDTMFLuhn` ships as a built-in validator for card numbers. Rejection reasons: `invalid`, `timeout`, `too-short` |

### voice@0.0.22-beta.510 — Outbound campaign + compliance kit

| Gap | Surface |
|---|---|
| TCPA Do-Not-Call registry | `createVoiceDNCRegistry({ entries?, externalLookup?, now? })` returns `{ check, checkSync, block, unblock, has, snapshot }`. Phone normalization, expiring entries, internal/regulatory/imported sources, pluggable external lookup for FTC/state lists. `importVoiceDNCFromCSV(csv, options)` for bulk loads |
| Time-of-day calling windows | `createVoiceCallingWindow({ timezone, allowedHours, allowedDays, blockedDates?, perDayHours?, now? })` returns `{ canCallNow, nextWindowOpensAt }`. Timezone-aware via `Intl.DateTimeFormat`, holiday block dates, per-day hour overrides (e.g., Saturday extended hours). `VOICE_TCPA_DEFAULT_WINDOW` ships the 8 AM–9 PM weekday default |
| Call disposition tagging | `createVoiceCallDispositionTagger({ taxonomy?, allowMultiple?, now? })` returns `{ tag, untag, listForSession, listAll, summarize, definitionFor, definitions }`. `DEFAULT_VOICE_CALL_DISPOSITIONS` covers 13 codes across sales/support/collections taxonomies. `summarize()` rolls up by outcome + retryable percentage |
| Retry / cooldown policy engine | `createVoiceRetryPolicy({ maxAttempts?, defaultCooldownMs?, jitterMs?, backoffMultiplier?, rules?, escalateAfterAttempts?, now? })` returns `{ decide, updateRule, rules, maxAttempts }`. Per-disposition rules with retry/abandon/escalate actions, exponential backoff, jitter, escalation triggers. Default rules cover voicemail/no-answer/busy/callback/DNC/sale |
| Campaign template resolver | `resolveVoiceCampaignTemplate(template, { scope, filters?, fallback?, strict? })` returns `{ output, missingVariables }`. `{{var \| filter1 \| filter2:arg }}` syntax, dotted-path lookups, missing-variable collection, strict mode. `DEFAULT_VOICE_CAMPAIGN_TEMPLATE_FILTERS`: upper/lower/capitalize/currency/date/phone/ssml/default. `collectVoiceCampaignTemplateVariables(template)` extracts variable list |

### voice@0.0.22-beta.511 — Supervisor / live-coaching kit

| Gap | Surface |
|---|---|
| Whisper channel (agent-only audio) | `createVoiceWhisperChannel({ sessionId, defaultRoute?, duckCallerToLevel?, maxConcurrentWhispers?, now? })` returns `{ start, stop, pushFrame, setRoute, routeFor, activeSupervisors, isWhispering, subscribe }`. Routes: `agent-only` (default, ducks caller audio), `agent-and-caller`, `drop`. Concurrent-watcher cap, ducking event on start |
| Live coach nudges | `createVoiceLiveCoach({ sessionId, injectionRole?, templateForKind?, defaultExpiryMs?, generateId?, now? })` returns `{ push, pending, consumeForInjection, acknowledge, history, subscribe }`. Kinds: `hint`/`correction`/`warning`/`script-line`/`knowledge`. `consumeForInjection()` drains to system/developer messages for next agent turn. Custom templates per kind |
| Transcript annotator | `createVoiceTranscriptAnnotator({ sessionId, generateId?, now? })` returns `{ add, remove, list, summarize }`. Kinds: `great-recovery`/`missed-objection`/`compliance-concern`/`tone-issue`/`knowledge-gap`/`follow-up-needed`/`custom`. `DEFAULT_VOICE_ANNOTATION_KIND_SEVERITY` defaults severity (info/minor/major). `list({ kind, supervisorId, severity, fromMs, toMs })` filters; `summarize()` rolls up |
| Supervisor presence | `createVoiceSupervisorPresence({ staleAfterMs?, now? })` returns `{ join, leave, heartbeat, setRole, list, sessionsWatchedBy, subscribe }`. Per-session watcher map, automatic stale-pruning, role tracking (`viewer`/`coach`/`whisperer`/`owner`), `join`/`leave`/`role-change`/`heartbeat` events |
| Permission tiers | `createVoiceSupervisorPermissions({ defaultTier?, permissions?, now? })` returns `{ can, capabilitiesFor, enforce, grant, revoke, get, tiers }`. Tiers: `monitor-only`/`annotate`/`coach`/`whisper`/`full-control`. 10 capabilities (monitor, annotate, coach, whisper, barge, takeover, release, end-call, view-pii, export-recording). Expiry, extra/denied capability overrides, `enforce` throws on deny |

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
