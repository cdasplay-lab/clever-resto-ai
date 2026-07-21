import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

Deno.test("agent confirmation is derived from the latest persisted customer message", async () => {
  const source = await read("agent-run/index.ts");
  const domain = await read("_shared/order-domain.ts");
  assert.match(source, /latestExplicitConfirmation/);
  assert.match(source, /isConfirmationFresh/);
  assert.match(source, /isExplicitOrderConfirmation/);
  assert.match(domain, /CONFIRMATION_TTL_MS/);
  assert.match(domain, /REJECT_CONFIRM_RE/);
  assert.doesNotMatch(
    source,
    /const userOk = typeof args\.user_confirmation_text/,
  );
});

Deno.test("the current agent consumes the shared order contract registry", async () => {
  const source = await read("agent-run/index.ts");
  assert.match(source, /replaceSharedOrderTools\(AGENT_TOOL_LAYOUT\)/);
  assert.match(source, /\.\.\/_shared\/order-contracts\.ts/);
});

Deno.test("AI quota is consumed only after deterministic journeys", async () => {
  const source = await read("agent-run/index.ts");
  assert.ok(
    source.indexOf("// Charge only when this run really needs the model") >
      source.indexOf("tracking / status question shortcut"),
  );
  assert.match(source, /quotaErr \|\| !quotaRes/);
});

Deno.test("order cancellation uses the atomic transition RPC", async () => {
  const source = await read("agent-run/index.ts");
  assert.match(source, /rpc\("transition_order_status"/);
});

Deno.test("cron authentication has no source-controlled fallback secret", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../src/lib/cron-auth.ts", import.meta.url),
  );
  assert.doesNotMatch(source, /FALLBACK_CRON_SECRET|crn_[a-z0-9]{16}/i);
  assert.match(source, /expected\.length >= 32/);
});

Deno.test("quota RPC is service-only and idempotent", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260721140000_subscription_monitoring_completion.sql",
      import.meta.url,
    ),
  );
  assert.match(migration, /service role required/);
  assert.match(migration, /usage_events_dedupe_ref_uq/);
  assert.match(migration, /revoke all on function public\.consume_quota/);
});
