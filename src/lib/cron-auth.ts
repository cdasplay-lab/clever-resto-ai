// Shared-secret gate for the public cron endpoints (check-delays,
// check-complaints). pg_cron can't read env vars, so the secret is hardcoded
// in the scheduling migration; this fallback must match it. Unlike the anon
// key (which ships in every client bundle), this value never reaches the
// browser. Set CRON_SECRET in the server env to rotate it (then update the
// cron job headers to match).

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  const got = request.headers.get("x-cron-secret") ?? "";
  return expected.length >= 32 && got.length > 0 && timingSafeEqual(got, expected);
}

export function cronUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
