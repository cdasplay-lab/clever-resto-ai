// Caller authentication helpers for edge functions.
//
// Two legitimate caller types:
//  1. Internal server-to-server calls (telegram-webhook → agent-run,
//     menu-extract → menu-embed, ...). These authenticate with the project's
//     service-role key, which every function already has in its env — no new
//     secrets to provision.
//  2. Dashboard calls made with the owner's session JWT
//     (supabase.functions.invoke attaches it automatically).
import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { admin } from "./supabase.ts";

function bearerToken(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.replace(/^Bearer\s+/i, "").trim();
}

// Constant-time comparison — avoids leaking key prefixes via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function isInternalCall(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = bearerToken(req);
  return key.length > 0 && token.length > 0 && timingSafeEqual(token, key);
}

// Validates the caller's user JWT and returns the user id, or null.
export async function getCallerUserId(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export async function ownsRestaurant(userId: string, restaurantId: string): Promise<boolean> {
  if (!userId || !restaurantId) return false;
  const db = admin();
  const { data } = await db
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

// Header set for internal function-to-function fetches.
export function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
  };
}
