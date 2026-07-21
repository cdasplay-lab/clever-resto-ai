import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../../migrations/20260721150000_voice_phase_1_foundation.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationUrl);

const voiceTables = [
  "restaurant_voice_settings",
  "restaurant_phone_numbers",
  "phone_calls",
  "phone_call_events",
  "phone_call_transcripts",
  "phone_call_tool_runs",
];

Deno.test("voice foundation is disabled and non-recording by default", () => {
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /recording_enabled boolean not null default false/);
  assert.match(migration, /inbound_enabled boolean not null default false/);
});

Deno.test("every voice table enables RLS and authenticated access is read-mostly", () => {
  for (const table of voiceTables) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
      table,
    );
  }
  assert.match(
    migration,
    /revoke all on public\.restaurant_voice_settings[\s\S]*from anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant insert \([\s\S]*\) on public\.restaurant_voice_settings to authenticated/i,
  );
  assert.match(
    migration,
    /grant update \([\s\S]*\) on public\.restaurant_voice_settings to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete|all) on public\.phone_calls to authenticated/i,
  );
});

Deno.test("call, event and tool identities have database deduplication boundaries", () => {
  assert.match(
    migration,
    /phone_calls_provider_external_uq unique \(provider, external_call_id\)/i,
  );
  assert.match(migration, /phone_call_events_provider_event_uq/i);
  assert.match(
    migration,
    /phone_call_tool_runs_call_key_uq unique \(call_id, idempotency_key\)/i,
  );
  assert.match(
    migration,
    /phone_call_tool_runs_call_tool_id_uq unique \(call_id, tool_call_id\)/i,
  );
  assert.match(migration, /pg_advisory_xact_lock/i);
});

Deno.test("voice service RPCs are service-only and tenant conflicts fail closed", () => {
  for (
    const fn of [
      "register_inbound_phone_call",
      "claim_phone_tool_run",
      "complete_phone_tool_run",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${fn}\\([\\s\\S]*?from public, anon, authenticated`,
        "i",
      ),
      fn,
    );
  }
  assert.match(migration, /service role required/i);
  assert.match(migration, /external_call_tenant_conflict/i);
  assert.match(migration, /phone_number_tenant_mismatch/i);
  assert.match(migration, /phone_number_route_mismatch/i);
  assert.match(migration, /conversation_tenant_mismatch/i);
  assert.match(migration, /order_tenant_mismatch/i);
});

Deno.test("voice metadata contract forbids source-controlled provider secrets", () => {
  assert.match(migration, /Provider credentials belong in secrets\/Vault/i);
  assert.doesNotMatch(
    migration,
    /(api_key|authorization_header|provider_secret)\s+text/i,
  );
});
