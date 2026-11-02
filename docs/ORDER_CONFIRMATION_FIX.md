# Order confirmation repair

The checkout could reject an unchanged order after automatically choosing its
branch. The preview saved that branch to conversation metadata but fingerprinted
the old null branch ID. The next `submit_order` then reported a changed order.
Its unstructured error was sanitized to `{ ok: false }`, hiding the recovery
action from the model. Repeated requests for approval could end in human handoff.

## Changes

- Resolve the active branch before preview fingerprinting and include it in the
  saved preview and submitted order.
- Return safe confirmation failure codes, customer messages, and recovery
  actions. Do not automatically pause a conversation for recoverable checkout
  failures unless the customer requested a human.
- Preserve delivery fields and customer coordinates when updating delivery
  details and adding ETA metadata to the order.
- Check preview persistence errors before returning a confirmation token.
- Clear the current run's basket after successful submission or scheduling.
  Return the saved success message immediately without another model turn.
- Invalidate cached previews after successful mutations and do not cache errors.
- Stop a competing run when it cannot claim the conversation lock.

## Verification

`node --test tests/agent-checkout.test.cjs` (Node 24) runs the production entrypoint
with an in-memory database and model responses; it does not call APIs or create
live orders. Fifteen regression cases pass. The original implementation fails
the reproduced covered-branch confirmation scenario.

`deno check supabase/functions/_shared/geo.ts` also passes. The existing shared
test suite could not be run locally because deno.land was unreachable; CI keeps
that suite enabled alongside the new offline checkout tests.

## Deployment and live verification

This change does not deploy Edge Functions or alter live conversation data.

1. Inspect `agent_logs` for the affected Telegram conversation to establish the
   exact failure observed live; the reproduced code bug alone is not proof of
   the specific production error.
2. Verify the existing migration `20260623090000_conversation_lock.sql` is applied
   and `claim_conversation` / `release_conversation` are available before deploy.
3. Apply this change and deploy `agent-run` in the connected Lovable project.
4. In dashboard conversations select the affected chat and click «رجّع للبوت».
   The prior handoff deliberately paused it; deployment does not undo that state.
5. Verify a test order through Telegram: preview -> نعم -> one pending order,
   a success message with order number, saved branch and location, no handoff.
   Repeat confirmation and verify that the same completed checkout is not
   submitted again. Also test changing the address before confirmation.
