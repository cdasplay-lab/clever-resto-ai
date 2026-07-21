# Voice ordering — phase 1 foundation

Phase 1 prepares the existing order agent for phone calls without accepting or
placing a real phone order yet. No OpenAI key, SIP trunk, phone number, deploy,
or production migration is part of this branch.

## What this phase adds

- A provider-neutral order tool registry in
  `supabase/functions/_shared/order-contracts.ts`.
- Adapters for the current Chat Completions-style agent and the flat Realtime
  function-tool shape used by `session.tools`.
- Shared cart, delivery, confirmation, fingerprint, and hashing primitives in
  `supabase/functions/_shared/order-domain.ts`.
- Tenant-safe tables for restaurant voice settings, phone-number routing,
  calls, redacted events, transcripts, and tool executions.
- Service-only RPCs that deduplicate inbound calls and claim/complete tool runs.
- Unit and source-contract tests for confirmation, tool schemas, RLS, tenant
  isolation, secret handling, and idempotency.

The current `agent-run` still owns all tool execution. It now consumes the
shared contracts while retaining the same tool order and channel-only tools.
Moving execution behind a shared runtime boundary belongs to shadow-mode work,
where it can be compared against the current agent before real orders are
enabled.

## Data and security guarantees

1. Voice and inbound routing are disabled by default. Recording is also
   disabled by default.
2. A normalized E.164 phone number maps globally to only one restaurant.
3. `(provider, external_call_id)` identifies one call, and a retry cannot bind
   that call to another restaurant.
4. Events are deduplicated by provider event ID. Tool runs are deduplicated by
   both Realtime call ID and an application idempotency key.
5. Composite foreign keys keep events, transcripts, and tool runs in the same
   tenant as their call. Triggers reject cross-tenant conversation/order links.
6. Owners can read only their own call data and change only their own voice
   settings. Phone provisioning and all call/event/tool writes remain
   service-role operations.
7. Provider credentials, authorization headers, and raw audio are not database
   columns. Keep credentials in Supabase secrets/Vault; persist only redacted
   event metadata.

## Tables

- `restaurant_voice_settings`: per-restaurant feature gate and privacy/runtime
  preferences. `transcript_retention_days` is stored now; a purge worker must
  enforce it before transcripts are enabled outside a test environment.
- `restaurant_phone_numbers`: provisioned E.164 number and non-secret routing
  metadata.
- `phone_calls`: provider identity, lifecycle, restaurant/order links, duration,
  and usage totals.
- `phone_call_events`: deduplicated, redacted lifecycle/audit events.
- `phone_call_transcripts`: final or partial customer/assistant/tool text.
- `phone_call_tool_runs`: exactly-once claim record and persisted result for
  each business tool execution.

## Safe deployment and rollback

1. Keep the pre-phase branch
   `checkpoint/before-voice-phase-1-20260721` unchanged.
2. Apply `20260721150000_voice_phase_1_foundation.sql` only to a backed-up
   preview Supabase project.
3. Run the shared Deno tests and verify two restaurants cannot read or bind each
   other's number, call, transcript, order, or tool run.
4. Regenerate `src/integrations/supabase/types.ts` from that preview project
   before adding dashboard UI in a later phase.
5. Do not enable `restaurant_voice_settings.enabled` or
   `restaurant_phone_numbers.inbound_enabled` in phase 1.

Switching Git branches does not undo a database migration. If a preview
migration must be reversed, first export any call audit data, then remove the
three service RPCs/triggers and the six new tables in reverse dependency order.
Production rollback SQL should be prepared and reviewed at deployment time,
when the exact deployed schema is known.

## Phase 2 entry criteria

- Phase 1 CI passes.
- The migration has been verified in preview, not production.
- A single test restaurant and test-only phone number are chosen.
- OpenAI webhook verification, request replay protection, and SIP credentials
  are configured as secrets.
- The first call prototype can greet, transcribe, and hand off, but receives no
  order tools and cannot create an order.

Official references used for the boundary design:

- [Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)
- [Realtime API with SIP](https://developers.openai.com/api/docs/guides/realtime-sip)
