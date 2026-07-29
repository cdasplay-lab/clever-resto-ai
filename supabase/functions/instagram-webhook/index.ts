// instagram-webhook: receives Instagram API with Instagram Login webhook events
// and dispatches direct messages to the existing multi-tenant restaurant agent.
//
// Pilot routing is intentionally explicit:
// - INSTAGRAM_ACCOUNT_ID: Instagram professional account numeric ID
// - INSTAGRAM_RESTAURANT_HANDLE: restaurant.instagram_handle value (without @)
// - INSTAGRAM_ACCESS_TOKEN: token generated from Meta App Dashboard for that account
// - INSTAGRAM_VERIFY_TOKEN: shared value entered in Meta Webhooks setup
// - INSTAGRAM_APP_SECRET: Instagram app secret used to validate X-Hub-Signature-256
//
// This is a one-restaurant pilot adapter. Production onboarding will replace the
// token/handle env mapping with per-restaurant OAuth connections.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { retryFetch } from "../_shared/retry.ts";
import { internalHeaders } from "../_shared/auth.ts";

const GRAPH = "https://graph.instagram.com/v24.0";
const MAX_REPLY_CHUNK = 900;

function safeEqual(a: string | null, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const supplied = header.slice(7).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(supplied, expected);
}

function splitText(text: string): string[] {
  let rest = String(text || "").trim();
  if (!rest) return [];
  const parts: string[] = [];
  while (rest.length > MAX_REPLY_CHUNK) {
    let cut = rest.lastIndexOf("\n\n", MAX_REPLY_CHUNK);
    if (cut < MAX_REPLY_CHUNK * 0.45) cut = rest.lastIndexOf("\n", MAX_REPLY_CHUNK);
    if (cut < MAX_REPLY_CHUNK * 0.45) cut = rest.lastIndexOf(" ", MAX_REPLY_CHUNK);
    if (cut < MAX_REPLY_CHUNK * 0.45) cut = MAX_REPLY_CHUNK;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.slice(0, 8);
}

function cleanMarkdown(text: string): string {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();
}

async function sendInstagramText(accountId: string, recipientId: string, text: string): Promise<void> {
  const token = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";
  if (!token) throw new Error("missing_INSTAGRAM_ACCESS_TOKEN");

  for (const part of splitText(cleanMarkdown(text))) {
    const response = await retryFetch(`${GRAPH}/${accountId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: part },
      }),
    }, { attempts: 3, label: "instagram:send_message" });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`instagram_send_failed:${response.status}:${body.slice(0, 400)}`);
    }
  }
}

async function alreadyProcessed(messageId: string | null): Promise<boolean> {
  if (!messageId) return false;
  const db = admin();
  const { error } = await db.from("processed_updates").insert({
    channel: "instagram",
    update_key: messageId,
  });
  if (!error) return false;
  if ((error as any).code === "23505") return true;
  console.warn("instagram processed_updates insert failed", error);
  return false;
}

function incomingText(event: any): string {
  const message = event?.message || {};
  if (typeof message.text === "string" && message.text.trim()) return message.text.trim();
  if (typeof event?.postback?.payload === "string" && event.postback.payload.trim()) {
    return event.postback.payload.trim();
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.some((a: any) => a?.type === "story_mention")) return "[ذكر المطعم في ستوري]";
  if (message?.reply_to?.story) return "[رد على ستوري المطعم]";
  if (attachments.length) return "[مرفق من الزبون على إنستغرام]";
  return "";
}

async function resolveRestaurantId(): Promise<string | null> {
  const handle = (Deno.env.get("INSTAGRAM_RESTAURANT_HANDLE") || "").trim().replace(/^@/, "");
  if (!handle) return null;
  const db = admin();
  const { data, error } = await db
    .from("restaurants")
    .select("id,is_active")
    .ilike("instagram_handle", handle)
    .maybeSingle();
  if (error || !data?.id || !data.is_active) return null;
  return data.id as string;
}

async function processMessagingEvent(event: any, accountId: string, restaurantId: string): Promise<void> {
  const senderId = String(event?.sender?.id || "").trim();
  const recipientId = String(event?.recipient?.id || "").trim();
  const messageId = String(event?.message?.mid || event?.postback?.mid || "").trim() || null;

  if (!senderId || !recipientId) return;
  if (event?.message?.is_echo || event?.is_self || senderId === accountId) return;
  if (recipientId !== accountId) return;
  if (await alreadyProcessed(messageId)) return;

  const text = incomingText(event);
  if (!text) {
    // Media/sticker DMs aren't readable yet — answer instead of going silent.
    await sendInstagramText(accountId, senderId, "أگدر أقرأ الرسائل النصية هنا 🙏 اكتبلي طلبك وأخدمك فوراً.");
    return;
  }

  const db = admin();
  let conversationId: string;
  const { data: existing, error: lookupError } = await db
    .from("conversations")
    .select("id,last_message_at,cart,state,delivery,meta")
    .eq("restaurant_id", restaurantId)
    .eq("channel", "instagram")
    .eq("external_chat_id", senderId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    conversationId = existing.id;
    const lastAt = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const stale = Date.now() - lastAt > 3 * 60 * 60 * 1000;
    const hasCart = Array.isArray(existing.cart) && existing.cart.length > 0;
    const update: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      customer_handle: `instagram:${senderId}`,
      meta: {
        ...(existing.meta || {}),
        instagram_account_id: accountId,
        instagram_scoped_id: senderId,
      },
    };
    if (stale && hasCart && existing.state !== "submitted") {
      update.cart = [];
      update.delivery = {};
      update.state = "greeting";
      update.meta = { ...(update.meta as any), pending_confirmation: null };
    }
    await db.from("conversations").update(update).eq("id", conversationId);
  } else {
    const { data: created, error: createError } = await db
      .from("conversations")
      .insert({
        restaurant_id: restaurantId,
        channel: "instagram",
        external_chat_id: senderId,
        customer_handle: `instagram:${senderId}`,
        customer_name: "Instagram customer",
        meta: {
          instagram_account_id: accountId,
          instagram_scoped_id: senderId,
          source: "instagram_login",
        },
      })
      .select("id")
      .single();
    if (createError || !created) throw createError || new Error("conversation_create_failed");
    conversationId = created.id;
  }

  const { error: messageError } = await db.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: text,
  });
  if (messageError) throw messageError;

  const baseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!baseUrl) throw new Error("missing_SUPABASE_URL");

  const response = await retryFetch(`${baseUrl}/functions/v1/agent-run`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({ conversation_id: conversationId }),
    // attempts:1 — agent-run is NOT idempotent (consumes quota, can insert an
    // order); retrying a 5xx re-runs the whole turn.
  }, { attempts: 1, label: "instagram:agent-run" });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`agent_run_failed:${response.status}`);
  // bot_paused now carries a throttled "someone is coming" notice — forward it.
  if (data?.reply) await sendInstagramText(accountId, senderId, data.reply);
}

async function processPayload(payload: any): Promise<void> {
  if (payload?.object !== "instagram") return;

  const configuredAccountId = (Deno.env.get("INSTAGRAM_ACCOUNT_ID") || "").trim();
  const restaurantId = await resolveRestaurantId();
  if (!configuredAccountId) throw new Error("missing_INSTAGRAM_ACCOUNT_ID");
  if (!restaurantId) throw new Error("instagram_restaurant_not_found");

  for (const entry of payload?.entry || []) {
    const accountId = String(entry?.id || "").trim();
    if (!accountId || accountId !== configuredAccountId) continue;
    for (const event of entry?.messaging || []) {
      await processMessagingEvent(event, accountId, restaurantId);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    const expected = Deno.env.get("INSTAGRAM_VERIFY_TOKEN") || "";

    if (mode === "subscribe" && expected && safeEqual(token, expected)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET") || "";
  const valid = await verifySignature(rawBody, req.headers.get("X-Hub-Signature-256"), appSecret);
  if (!valid) return json({ error: "invalid_signature" }, 401);

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: true, ignored: "invalid_json" });
  }

  const work = processPayload(payload).catch((error) => {
    console.error("instagram webhook processing failed", (error as Error)?.message || error);
  });

  // @ts-ignore Supabase Edge Runtime provides EdgeRuntime.waitUntil.
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(work);
  } else {
    await work;
  }

  return json({ ok: true });
});
