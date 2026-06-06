// telegram-connect: links a restaurant to its own Telegram bot.
// POST { restaurant_id, bot_token, action?: "connect" | "disconnect" | "test" }
// Validates the token via getMe, stores it on the restaurant, and registers the
// per-restaurant webhook with a derived secret.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TG_API = "https://api.telegram.org";

async function deriveSecret(token: string): Promise<string> {
  const data = new TextEncoder().encode(`tg-bot-secret:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tgDirect(token: string, method: string, body?: any) {
  const r = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, status: r.status, body: j };
}

function webhookBaseUrl(): string {
  // Public stable URL for the edge function. SUPABASE_URL works for Edge Function endpoints.
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Authenticate the calling user with their JWT.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const userClient = createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const restaurantId = String(body?.restaurant_id || "").trim();
  const action = (body?.action || "connect") as "connect" | "disconnect" | "test";
  if (!restaurantId) return json({ error: "restaurant_id required" }, 400);

  const db = admin();

  // Verify ownership.
  const { data: restaurant, error: rErr } = await db
    .from("restaurants")
    .select("id, owner_id, name, telegram_bot_token, telegram_bot_username, owner_telegram_chat_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (rErr || !restaurant) return json({ error: "restaurant not found" }, 404);
  if (restaurant.owner_id !== user.id) return json({ error: "forbidden" }, 403);

  // === DISCONNECT ===
  if (action === "disconnect") {
    const token = restaurant.telegram_bot_token;
    if (token) {
      // Best-effort: delete webhook on Telegram side.
      try { await tgDirect(token, "deleteWebhook", { drop_pending_updates: true }); } catch (_) {}
    }
    const { error: uErr } = await db
      .from("restaurants")
      .update({
        telegram_bot_token: null,
        telegram_bot_username: null,
        telegram_bot_id: null,
      })
      .eq("id", restaurantId);
    if (uErr) return json({ error: uErr.message }, 500);
    return json({ ok: true, action: "disconnected" });
  }

  // === TEST (sends a test message to owner_telegram_chat_id) ===
  if (action === "test") {
    const token = restaurant.telegram_bot_token;
    const ownerChat = restaurant.owner_telegram_chat_id;
    if (!token) return json({ error: "not_connected" }, 400);
    if (!ownerChat) return json({ error: "no_owner_chat", message: "حدد owner_telegram_chat_id بالإعدادات أولاً" }, 400);
    const res = await tgDirect(token, "sendMessage", {
      chat_id: ownerChat,
      text: `✅ بوت "${restaurant.name}" مربوط وشغّال. هذي رسالة اختبار.`,
    });
    if (!res.ok) return json({ error: "tg_send_failed", details: res.body }, 502);
    return json({ ok: true, action: "tested" });
  }

  // === CONNECT ===
  const rawToken = String(body?.bot_token || "").trim();
  // BotFather tokens look like `123456789:AA...` (digits, colon, 35 chars).
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(rawToken)) {
    return json({ error: "invalid_token_format" }, 400);
  }

  // 1) Verify token via getMe
  const me = await tgDirect(rawToken, "getMe");
  if (!me.ok) return json({ error: "token_rejected_by_telegram", details: me.body }, 400);
  const botId = String(me.body?.result?.id ?? "");
  const botUsername = String(me.body?.result?.username ?? "");
  if (!botId || !botUsername) return json({ error: "bot_info_missing" }, 502);

  // 2) Ensure this bot isn't already linked to another restaurant.
  const { data: clash } = await db
    .from("restaurants")
    .select("id")
    .eq("telegram_bot_id", botId)
    .neq("id", restaurantId)
    .maybeSingle();
  if (clash) return json({ error: "bot_already_linked_to_another_restaurant" }, 409);

  // 3) Register the webhook with a per-restaurant secret + query param.
  const secret = await deriveSecret(rawToken);
  const url = `${webhookBaseUrl()}?r=${restaurantId}`;
  const setRes = await tgDirect(rawToken, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!setRes.ok) return json({ error: "setWebhook_failed", details: setRes.body }, 502);

  // 4) Persist on the restaurant row.
  const { error: uErr } = await db
    .from("restaurants")
    .update({
      telegram_bot_token: rawToken,
      telegram_bot_username: botUsername,
      telegram_bot_id: botId,
    })
    .eq("id", restaurantId);
  if (uErr) return json({ error: uErr.message }, 500);

  return json({
    ok: true,
    action: "connected",
    bot: { id: botId, username: botUsername },
    webhook_url: url,
  });
});
