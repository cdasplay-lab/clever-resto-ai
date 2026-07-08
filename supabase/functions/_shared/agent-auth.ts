// Pure, testable security helpers for the agent-run edge function.
// Kept dependency-free so they can be unit-tested in CI without secrets/network.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

// Constant-time string comparison — avoids leaking the secret via timing.
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Optional image input. Allow only inline data:image URLs or https URLs,
// capped in size, to avoid SSRF / oversized-payload abuse.
const MAX_IMAGE_LEN = 12_000_000; // ~12MB (base64 data URL)
export function isValidImageUrl(url: unknown): boolean {
  if (url === undefined || url === null || url === "") return true; // optional
  if (typeof url !== "string") return false;
  if (url.length > MAX_IMAGE_LEN) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.length < 2048 && /^https:\/\/[^\s"'<>]+$/i.test(url)) return true;
  return false;
}

export type AuthResult = { ok: true } | { ok: false; status: number; reason: string };

// Shared-secret gate for internal (webhook → agent-run) calls.
// Fail-closed: if the server secret is not configured, deny everything.
export function authorizeAgentRun(
  provided: string | null | undefined,
  expected: string | null | undefined,
): AuthResult {
  if (!expected || expected.length < 16) {
    return { ok: false, status: 503, reason: "secret_not_configured" };
  }
  if (!safeEqual(provided, expected)) {
    return { ok: false, status: 401, reason: "bad_secret" };
  }
  return { ok: true };
}

// Validate the request body shape. Returns a typed payload or a reason.
export type Payload = { conversation_id: string; image_url?: string };
export type PayloadResult =
  | { ok: true; payload: Payload }
  | { ok: false; reason: string };

export function validatePayload(body: unknown): PayloadResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "body_not_object" };
  }
  const b = body as Record<string, unknown>;
  if (!isValidUuid(b.conversation_id)) {
    return { ok: false, reason: "bad_conversation_id" };
  }
  if (!isValidImageUrl(b.image_url)) {
    return { ok: false, reason: "bad_image_url" };
  }
  return {
    ok: true,
    payload: {
      conversation_id: b.conversation_id,
      image_url: typeof b.image_url === "string" && b.image_url ? b.image_url : undefined,
    },
  };
}

// Generic client-facing error — never leaks internal details, but preserves
// the two safe operational signals the webhook already understands.
export function clientErrorFor(message: string): { body: { error: string }; status: number } {
  if (message === "rate_limited") return { body: { error: "rate_limited" }, status: 429 };
  if (message === "payment_required") return { body: { error: "payment_required" }, status: 402 };
  return { body: { error: "internal_error" }, status: 500 };
}
