# AbsoluteJS Voice Pickup

Use this when starting the next session:

```text
We are continuing AbsoluteJS Voice from /home/alexkahn/abs/voice. First read VOICE_PLAN.md and PICKUP.md, then inspect git status in the companion repos listed in PICKUP.md. Do not start by changing the example unless the task requires proof wiring. The next recommended work is combined voice/media artifact readability: make proof-pack output compact and useful by consuming generic media Markdown/artifact helpers from @absolutejs/media instead of dumping huge realtime-channel internals. Keep @absolutejs/voice focused on voice buyer surfaces: readiness, proof pack, operations records, incident timeline, failure replay, real-call evidence runtime, provider/telephony/session surfaces, and framework bindings. If core changes are made, typecheck/test/build, publish a beta, install it into the real example with --force, run the relevant proof, then commit and push all touched repos.
```

## Current State

- Core repo: `/home/alexkahn/abs/voice`
- Current package: `@absolutejs/voice@0.0.22-beta.463`
- Latest pushed voice commit before this pickup file: `9e06430 Update voice stopping point plan`
- Latest real example proof: `.voice-runtime/proof-pack/runtime/2026-05-03T02-31-37.685Z/proof-pack/latest.json`
- Latest proof status: `ok: true`; six-framework browser proof passed; production readiness passed with 0 failures and 0 warnings; sustained trends passed 6 cycles; real-call evidence runtime had 21 stored evidence records across 21 sessions and 4 profiles.

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

Start with combined voice/media artifact readability.

Voice side:

- Replace verbose proof-pack realtime/media dumps with compact linked artifacts.
- Add proof-pack assertions that summarize media failures by issue code and link to readable media artifacts.
- Surface media quality/transport/graph failures in operations records, incident timelines, production readiness, and failure replay.
- Keep real browser/phone evidence first and deterministic proof envelopes second.

Media side dependency:

- Consume compact media Markdown/artifact helpers from `@absolutejs/media` once they exist.

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
