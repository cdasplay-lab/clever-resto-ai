// manychat-webhook: bridges Manychat Messenger/Instagram automations to the
// existing multi-tenant Clever restaurant agent.
//
// Manychat Dynamic Block / External Request calls:
//   POST /functions/v1/manychat-webhook?r=<restaurant_id>&channel=facebook|instagram
//   Header: X-Clever-Manychat-Secret: <MANYCHAT_WEBHOOK_SECRET>
//
// Expected body (use Manychat variables):
// {
//   "subscriber_id": "{{user_id}}",
//   "page_id": "{{page_id}}",
//   "first_name": "{{first_name}}",
//   "last_name": "{{last_name}}",
//   "text": "{{last_input_text}}",
//   "event_id": "optional stable event id"
// }
//
// Response is Manychat Dynamic Block v2 JSON. The endpoint is public only at
// the network layer; every request must pass the shared secret and an active
// restaurant id.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { internalHeaders } from "../_shared/auth.ts";
import { retryFetch } from "../_shared/retry.ts";

const MAX_TEXT_LENGTH = 4000;
const AGENT_TIMEOUT_MS = 9_000; // Manychat DevTools timeout is 10 seconds.

function safeEqual(a: string | null, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeChannel(raw: string | null): "facebook" | "instagram" | null {
  const value = (raw || "").trim().toLowerCase();
  if (["facebook", "messenger", "fb"].includes(value)) return "facebook";
  if (["instagram", "ig"].includes(value)) return "instagram";
  return null;
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function manychatTextResponse(
  channel: "facebook" | "instagram",
  text: string,
  quickReplies: string[] = [],
) {
  const safeText = cleanText(text) || "صار تأخير بسيط، ممكن تعيد رسالتك؟";
  const content: Record<string, unknown> = {
    messages: [{ type: "text", text: safeText }],
    actions: [],
  };

  // Instagram's Dynamic Block response requires an explicit channel type.
  if (channel === "instagram") content.type = "instagram";

  // A content quick reply can carry its caption as the next user message.
  // Keep the set deliberately small to stay within Manychat/Meta limits.
  const replies = Array.isArray(quickReplies)
    ? quickReplies.map(cleanText).filter(Boolean).slice(0, 6)
    : [];
  if (replies.length) {
    content.quick_replies = replies.map((caption) => ({
      type: "content",
      caption: caption.slice(0, 20),
      content: {
        messages: [{ type: "text", text: caption }],
      },
    }));
  }

  return { version: "v2", content };
}

function errorResponse(channel: "facebook" | "instagram", message: string, status = 200) {
  return json(manychatTextResponse(channel, message), status);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("agent_timeout")), ms)
    ),
  ]);
}

async function markProcessed(channel: string, eventId: string | null): Promise<boolean> {
  if (!eventId) return false;
  const db = admin();
  const { error } = await db.from("processed_updates").insert({
    channel: `manychat:${channel}`,
    update_key: eventId,
  });
  if (!error) return false;
  if ((error as any).code === "23505") return true;
  console.warn("manychat processed_updates insert failed", error);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const restaurantId = cleanText(url.searchParams.get("r"));
  const channel = normalizeChannel(url.searchParams.get("channel"));
  if (!channel) return json({ error: "unsupported_channel" }, 400);

  const configuredSecret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET") ?? "";
  const suppliedSecret = req.headers.get("X-Clever-Manychat-Secret");
  if (!configuredSecret || !safeEqual(suppliedSecret, configuredSecret)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!restaurantId) return json({ error: "restaurant_id_required" }, 400);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const subscriberId = cleanText(
    body?.subscriber_id ?? body?.user_id ?? body?.id ?? body?.contact_id,
  );
  const pageId = cleanText(body?.page_id);
  const firstName = cleanText(body?.first_name);
  const lastName = cleanText(body?.last_name);
  const customerName = cleanText(body?.name) || [firstName, lastName].filter(Boolean).join(" ");
  const userText = cleanText(body?.text ?? body?.last_input_text ?? body?.message);
  const eventId = cleanText(body?.event_id ?? body?.message_id ?? body?.request_id) || null;

  if (!subscriberId) return errorResponse(channel, "تعذر تحديد حساب الزبون. حاول مرة ثانية.");
  if (!userText) return errorResponse(channel, "دزلي طلبك برسالة حتى أساعدك 🌹");

  if (await markProcessed(channel, eventId)) {
    // Manychat expects a valid Dynamic Block payload even for retries.
    return errorResponse(channel, "وصلتني رسالتك، لحظة وأكمل وياك 🌹");
  }

  const db = admin();
  const { data: restaurant } = await db
    .from("restaurants")
    .select("id,is_active,name")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!restaurant || !restaurant.is_active) {
    return errorResponse(channel, "خدمة الطلبات متوقفة مؤقتاً عند المطعم.");
  }

  const externalChatId = subscriberId;
  let conversationId: string;

  const { data: existing, error: existingError } = await db
    .from("conversations")
    .select("id,last_message_at,cart,state,delivery,meta")
    .eq("restaurant_id", restaurantId)
    .eq("channel", channel)
    .eq("external_chat_id", externalChatId)
    .maybeSingle();

  if (existingError) {
    console.error("manychat conversation lookup failed", existingError);
    return errorResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
  }

  if (existing) {
    conversationId = existing.id;
    const nowIso = new Date().toISOString();
    const lastMs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const stale = Date.now() - lastMs > 3 * 60 * 60 * 1000;
    const cartHasItems = Array.isArray(existing.cart) && existing.cart.length > 0;
    const updates: Record<string, unknown> = {
      last_message_at: nowIso,
      customer_name: customerName || undefined,
      customer_handle: `${channel}:${subscriberId}`,
      meta: {
        ...(existing.meta || {}),
        manychat_page_id: pageId || undefined,
        manychat_subscriber_id: subscriberId,
      },
    };
    if (stale && cartHasItems && existing.state !== "submitted") {
      updates.cart = [];
      updates.delivery = {};
      updates.state = "greeting";
      updates.meta = { ...(updates.meta as any), pending_confirmation: null };
    }
    await db.from("conversations").update(updates).eq("id", conversationId);
  } else {
    const { data: created, error: createError } = await db
      .from("conversations")
      .insert({
        restaurant_id: restaurantId,
        channel,
        external_chat_id: externalChatId,
        customer_handle: `${channel}:${subscriberId}`,
        customer_name: customerName || `${channel} customer`,
        meta: {
          manychat_page_id: pageId || undefined,
          manychat_subscriber_id: subscriberId,
          source: "manychat",
        },
      })
      .select("id")
      .single();

    if (createError || !created) {
      console.error("manychat conversation create failed", createError);
      return errorResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
    }
    conversationId = created.id;
  }

  const { error: messageError } = await db.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userText,
  });
  if (messageError) {
    console.error("manychat message insert failed", messageError);
    return errorResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
  }

  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) return errorResponse(channel, "الخدمة غير جاهزة حالياً، حاول بعد قليل.");

  try {
    const agentResponse = await withTimeout(
      retryFetch(`${baseUrl}/functions/v1/agent-run`, {
        method: "POST",
        headers: internalHeaders(),
        body: JSON.stringify({ conversation_id: conversationId }),
      }, { attempts: 1, label: "manychat:agent-run" }),
      AGENT_TIMEOUT_MS,
    );

    const data = await agentResponse.json().catch(() => ({}));
    if (!agentResponse.ok) {
      console.error("manychat agent-run failed", agentResponse.status, data);
      return errorResponse(channel, "صار تأخير بسيط، ممكن تعيد رسالتك؟");
    }

    if (data?.skipped === "bot_paused") {
      return errorResponse(channel, "وصلت رسالتك للمطعم وراح يرد عليك الموظف بأقرب وقت 🌹");
    }

    return json(manychatTextResponse(channel, data?.reply, data?.quick_replies));
  } catch (error) {
    console.error("manychat agent request failed", (error as Error)?.message || error);
    return errorResponse(channel, "صار تأخير بسيط، ممكن تعيد رسالتك؟");
  }
});
