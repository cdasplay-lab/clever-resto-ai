# Agent journey guarantees

- Checkout accepts only the latest real customer message after a fresh preview; tool arguments cannot forge confirmation, corrections/negations are rejected, and previews expire after ten minutes.
- Immediate and scheduled orders each consume the confirmed-order quota exactly once.
- AI quota is charged only when a run reaches the model; deterministic tracking and paused conversations remain free.
- Cancellation is an atomic database transition and restores tracked stock once, even with retries or concurrent status changes.
- Telegram, WhatsApp and scheduled dispatch publish best-effort service heartbeats without blocking customer traffic.

Run live end-to-end tests against preview before production: order, schedule, edit/cancel, stock restoration, tracking/delay, complaint handoff/resume, quota exhaustion and channel outages.
