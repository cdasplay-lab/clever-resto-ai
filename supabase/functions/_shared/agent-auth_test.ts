// Unit tests for agent-run security helpers. No secrets/network — CI-safe.
// Run: deno test supabase/functions/_shared/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isValidUuid,
  safeEqual,
  isValidImageUrl,
  authorizeAgentRun,
  validatePayload,
  clientErrorFor,
} from "./agent-auth.ts";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const SECRET = "s3cr3t-shared-key-abcdef0123456789";

Deno.test("isValidUuid: accepts a real uuid, rejects junk", () => {
  assert(isValidUuid(UUID));
  assert(!isValidUuid("not-a-uuid"));
  assert(!isValidUuid(""));
  assert(!isValidUuid(123 as unknown));
  assert(!isValidUuid("3f2504e0-4f89-41d3-9a0c"));
});

Deno.test("safeEqual: equal strings true, different/length-mismatch false", () => {
  assert(safeEqual(SECRET, SECRET));
  assert(!safeEqual(SECRET, SECRET + "x"));
  assert(!safeEqual(SECRET, "wrong"));
  assert(!safeEqual(null, null));
  assert(!safeEqual(undefined, SECRET));
});

Deno.test("isValidImageUrl: data/https ok, junk + oversized rejected", () => {
  assert(isValidImageUrl(undefined), "optional");
  assert(isValidImageUrl(""), "empty allowed");
  assert(isValidImageUrl("data:image/png;base64,AAAA"));
  assert(isValidImageUrl("https://api.telegram.org/file/abc.jpg"));
  assert(!isValidImageUrl("javascript:alert(1)"));
  assert(!isValidImageUrl("http://insecure.example/x.jpg"), "no plain http");
  assert(!isValidImageUrl("data:image/png;base64," + "A".repeat(13_000_000)), "size cap");
  assert(!isValidImageUrl(42 as unknown));
});

Deno.test("authorizeAgentRun: TEST #1 — unauthorized requests fail", () => {
  // no secret provided
  assertEquals(authorizeAgentRun(null, SECRET).ok, false);
  // wrong secret
  assertEquals(authorizeAgentRun("wrong", SECRET).ok, false);
  // server misconfigured (no expected secret) => fail-closed
  const r = authorizeAgentRun(SECRET, undefined);
  assertEquals(r.ok, false);
  assertEquals((r as { status: number }).status, 503);
});

Deno.test("authorizeAgentRun: correct secret passes", () => {
  assertEquals(authorizeAgentRun(SECRET, SECRET).ok, true);
});

Deno.test("validatePayload: TEST #4 — missing/fake payload fails", () => {
  assertEquals(validatePayload(null).ok, false);
  assertEquals(validatePayload({}).ok, false);
  assertEquals(validatePayload({ conversation_id: "nope" }).ok, false);
  assertEquals(validatePayload({ conversation_id: UUID, image_url: "javascript:x" }).ok, false);
});

Deno.test("validatePayload: TEST #6 — valid request parses cleanly", () => {
  const r = validatePayload({ conversation_id: UUID });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.payload.conversation_id, UUID);
    assertEquals(r.payload.image_url, undefined);
  }
  const r2 = validatePayload({ conversation_id: UUID, image_url: "data:image/png;base64,AAAA" });
  assert(r2.ok);
});

Deno.test("clientErrorFor: TEST #8 — never leaks internals", () => {
  // an internal message with table names / stack must collapse to generic
  const e = clientErrorFor('relation "orders" does not exist at line 42');
  assertEquals(e.status, 500);
  assertEquals(e.body.error, "internal_error");
  assert(!JSON.stringify(e.body).includes("orders"));
  // operational signals preserved
  assertEquals(clientErrorFor("rate_limited").status, 429);
  assertEquals(clientErrorFor("payment_required").status, 402);
});
