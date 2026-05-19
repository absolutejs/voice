# @absolutejs/voice starter templates

Four minimal voice-agent shapes. Each is a single TypeScript file that you can
copy into your own Elysia/AbsoluteJS project and adapt.

| File | What it shows |
|---|---|
| [`customer-support.ts`](./customer-support.ts) | Knowledge-base RAG, transfer to human queue, caller memory, PII redaction. |
| [`scheduler.ts`](./scheduler.ts) | Structured-output tool that books an appointment in your calendar. |
| [`sales-qualifier.ts`](./sales-qualifier.ts) | BANT qualification, writes a CRM record via `createVoiceApiRequestTool`. |
| [`intake-form.ts`](./intake-form.ts) | Walks the caller through a structured form with audio recording + redaction. |

Each template assumes you've installed an STT/TTS adapter pair (see the
[`voice-adapters`](https://github.com/absolutejs/voice-adapters) monorepo) and
have an `ANTHROPIC_API_KEY` in env. Swap the model factory if you prefer OpenAI,
Gemini, or any of the other 13 providers in `@absolutejs/ai`.

The templates intentionally use in-memory stores (`createVoiceMemoryStore`,
`createVoiceMemoryAssistantMemoryStore`, `createVoiceMemoryRecordingStore`).
Switch to `createVoiceFileSessionStore` / `createVoiceFileRecordingStore` /
`createVoiceS3RecordingStore` for production persistence.

Each template ends with `app.listen(3000)`; that's the voice runtime ready to
receive a WebSocket from your client (browser, Twilio Media Streams, Telnyx
Media Streams). For browser bring-up, drop in the matching `<VoiceWidget>`
component from `@absolutejs/voice/react|vue|svelte|angular`.
