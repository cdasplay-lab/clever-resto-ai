// manychat-webhook: bridges Manychat Messenger/Instagram automations to the
// existing multi-tenant Clever restaurant agent.
//
// Manychat Dynamic Block / External Request calls:
//   POST /functions/v1/manychat-webhook?channel=facebook|instagram
//   Header: X-API-Key: <restaurant platform API key>
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
// the network layer; every request must pass a restaurant-scoped API key.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { internalHeaders } from "../_shared/auth.ts";
import { retryFetch } from "../_shared/retry.ts";

const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_CHUNK = 1800;
const MAX_OUTPUT_MESSAGES = 8;
const AGENT_TIMEOUT_MS = 9_000; // Manychat DevTools timeout is 10 seconds.

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authenticateRestaurant(req: Request): Promise<string | null> {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) return null;

  const db = admin();
  const keyHash = await sha256(apiKey);
  const { data, error } = await db
    .from("api_keys")
    .select("restaurant_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data?.restaurant_id) return null;
  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash);
  return data.restaurant_id as string;
}

function normalizeChannel(raw: string | null): "facebook" | "instagram" | null {
  const value = (raw || "").trim().toLowerCase();
  if (["facebook", "messenger", "fb"].includes(value)) return "facebook";
  if (["instagram", "ig"].includes(value)) return "instagram";
  return null;
}

function cleanText(value: unknown, max = MAX_INPUT_LENGTH): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function splitOutput(value: unknown): string[] {
  let remaining = cleanText(value, MAX_OUTPUT_CHUNK * MAX_OUTPUT_MESSAGES);
  if (!remaining) remaining = "صار تأخير بسيط، ممكن تعيد رسالتك؟";

  const parts: string[] = [];
  while (remaining.length > MAX_OUTPUT_CHUNK && parts.length < MAX_OUTPUT_MESSAGES - 1) {
    let cut = remaining.lastIndexOf("\n\n", MAX_OUTPUT_CHUNK);
    if (cut < MAX_OUTPUT_CHUNK * 0.45) cut = remaining.lastIndexOf("\n", MAX_OUTPUT_CHUNK);
    if (cut < MAX_OUTPUT_CHUNK * 0.45) cut = remaining.lastIndexOf(" ", MAX_OUTPUT_CHUNK);
    if (cut < MAX_OUTPUT_CHUNK * 0.45) cut = MAX_OUTPUT_CHUNK;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean).slice(0, MAX_OUTPUT_MESSAGES);
}

function manychatTextResponse(channel: "facebook" | "instagram", text: unknown) {
  const content: Record<string, unknown> = {
    messages: splitOutput(text).map((part) => ({ type: "text", text: part })),
    actions: [],
    quick_replies: [],
  };

  // Instagram Dynamic Blocks require an explicit channel type.
  if (channel === "instagram") content.type = "instagram";
  return { version: "v2", content };
}

function userFacingResponse(
  channel: "facebook" | "instagram",
  message: string,
  status = 200,
) {
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

async function alreadyProcessed(channel: string, eventId: string | null): Promise<boolean> {
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
  const channel = normalizeChannel(url.searchParams.get("channel"));
  if (!channel) return json({ error: "unsupported_channel" }, 400);

  const restaurantId = await authenticateRestaurant(req);
  if (!restaurantId) return json({ error: "unauthorized" }, 401);

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

  if (!subscriberId) return userFacingResponse(channel, "تعذر تحديد حساب الزبون. حاول مرة ثانية.");
  if (!userText) return userFacingResponse(channel, "دزلي طلبك برسالة حتى أساعدك 🌹");

  if (await alreadyProcessed(channel, eventId)) {
    return userFacingResponse(channel, "وصلتني رسالتك، لحظة وأكمل وياك 🌹");
  }

  const db = admin();
  const { data: restaurant } = await db
    .from("restaurants")
    .select("id,is_active,name")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!restaurant || !restaurant.is_active) {
    return userFacingResponse(channel, "خدمة الطلبات متوقفة مؤقتاً عند المطعم.");
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
    return userFacingResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
  }

  if (existing) {
    conversationId = existing.id;
    const nowIso = new Date().toISOString();
    const lastMs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const stale = Date.now() - lastMs > 3 * 60 * 60 * 1000;
    const cartHasItems = Array.isArray(existing.cart) && existing.cart.length > 0;
    const updates: Record<string, unknown> = {
      last_message_at: nowIso,
      customer_handle: `${channel}:${subscriberId}`,
      meta: {
        ...(existing.meta || {}),
        manychat_page_id: pageId || undefined,
        manychat_subscriber_id: subscriberId,
        source: "manychat",
      },
    };
    if (customerName) updates.customer_name = customerName;
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
      return userFacingResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
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
    return userFacingResponse(channel, "صار خطأ بسيط، جرب مرة ثانية.");
  }

  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) return userFacingResponse(channel, "الخدمة غير جاهزة حالياً، حاول بعد قليل.");

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
      return userFacingResponse(channel, "صار تأخير بسيط، ممكن تعيد رسالتك؟");
    }

    if (data?.skipped === "bot_paused") {
      return userFacingResponse(channel, "وصلت رسالتك للمطعم وراح يرد عليك الموظف بأقرب وقت 🌹");
    }

    return json(manychatTextResponse(channel, data?.reply));
  } catch (error) {
    console.error("manychat agent request failed", (error as Error)?.message || error);
    return userFacingResponse(channel, "صار تأخير بسيط، ممكن تعيد رسالتك؟");
  }
});
