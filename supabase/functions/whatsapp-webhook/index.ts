// whatsapp-webhook: receives Meta WhatsApp Cloud API events and dispatches
// to the agent (same core as telegram-webhook, different channel).
//
// GET  = Meta verification handshake (hub.mode/hub.verify_token/hub.challenge)
// POST = incoming events; requires valid X-Hub-Signature-256 (HMAC-SHA256 of
//        the raw body using META_APP_SECRET).
//
// Multi-tenant routing: each incoming message carries `metadata.phone_number_id`.
// We look the restaurant up via restaurants.whatsapp_phone_number_id.
//
// Outbound calls use META_WHATSAPP_TOKEN against
// https://graph.facebook.com/v20.0/{phone_number_id}/messages
//
// Responds 200 to Meta ASAP and processes work in the background.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { retryFetch } from "../_shared/retry.ts";
import { internalHeaders } from "../_shared/auth.ts";

const GRAPH = "https://graph.facebook.com/v20.0";
const WA_MAX_LEN = 3900;

// ---------- signature verification ----------
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice(7).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hexEqual(provided, expected);
}

// ---------- WhatsApp Cloud API client ----------
function waHeaders(): Record<string, string> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) throw new Error("missing_META_WHATSAPP_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function waCall(phoneNumberId: string, body: unknown): Promise<Response> {
  return retryFetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: waHeaders(),
    body: JSON.stringify(body),
  }, { attempts: 3, label: "wa:messages" });
}

function splitText(text: string, max = WA_MAX_LEN): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // WA uses single-asterisk for bold
    .replace(/__(.+?)__/g, "_$1_");
}

async function waSendText(phoneNumberId: string, to: string, text: string, quickReplies?: string[]) {
  const clean = stripMarkdown(text);
  const chunks = splitText(clean);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const useButtons = isLast && Array.isArray(quickReplies) && quickReplies.length > 0 && quickReplies.length <= 3;
    try {
      if (useButtons) {
        await waCall(phoneNumberId, {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: chunks[i] },
            action: {
              buttons: quickReplies!.slice(0, 3).map((t, idx) => ({
                type: "reply",
                reply: { id: `qr_${idx}_${t.slice(0, 20)}`, title: t.slice(0, 20) },
              })),
            },
          },
        });
      } else {
        await waCall(phoneNumberId, {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: chunks[i], preview_url: false },
        });
      }
    } catch (e) {
      console.error("waSendText failed", e);
    }
  }
}

async function waSendImage(phoneNumberId: string, to: string, imageUrl: string, caption?: string) {
  try {
    await waCall(phoneNumberId, {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: imageUrl, caption: caption || undefined },
    });
  } catch (e) { console.error("waSendImage failed", e); }
}

async function waSendLocation(phoneNumberId: string, to: string, lat: number, lng: number, name?: string, address?: string) {
  try {
    await waCall(phoneNumberId, {
      messaging_product: "whatsapp",
      to,
      type: "location",
      location: { latitude: lat, longitude: lng, name, address },
    });
  } catch (e) { console.error("waSendLocation failed", e); }
}

async function waRequestLocation(phoneNumberId: string, to: string, text: string) {
  // WhatsApp Cloud interactive location-request message
  try {
    await waCall(phoneNumberId, {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text },
        action: { name: "send_location" },
      },
    });
  } catch (e) {
    console.error("waRequestLocation failed, falling back to text", e);
    await waSendText(phoneNumberId, to, text);
  }
}

async function executeActions(phoneNumberId: string, to: string, actions: any[]) {
  if (!Array.isArray(actions) || !actions.length) return;
  for (const a of actions) {
    try {
      if (a?.type === "send_location" && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
        await waSendLocation(phoneNumberId, to, a.lat, a.lng, a.title, a.address);
      } else if (a?.type === "request_location") {
        await waRequestLocation(phoneNumberId, to, a.text || "شارك موقعك من الزر اللي تحت 👇");
      }
    } catch (e) {
      console.error("executeActions failed for", a?.type, e);
    }
  }
}

// ---------- idempotency ----------
async function alreadyProcessed(messageId: string | undefined): Promise<boolean> {
  if (!messageId) return false;
  const db = admin();
  const { error } = await db.from("processed_updates").insert({
    channel: "whatsapp",
    update_key: String(messageId),
  });
  if (!error) return false;
  if ((error as any).code === "23505") return true;
  console.warn("processed_updates insert error:", error);
  return false;
}

// ---------- media download for image / voice ----------
async function downloadMediaDataUrl(mediaId: string, fallbackMime: string): Promise<string | null> {
  try {
    const meta = await retryFetch(`${GRAPH}/${mediaId}`, { headers: waHeaders() }, { attempts: 2, label: "wa:media_meta" });
    if (!meta.ok) return null;
    const mj = await meta.json();
    const url = mj?.url;
    if (!url) return null;
    const dl = await retryFetch(url, { headers: waHeaders() }, { attempts: 2, label: "wa:media_dl" });
    if (!dl.ok) return null;
    const buf = new Uint8Array(await dl.arrayBuffer());
    const ct = dl.headers.get("content-type") || fallbackMime;
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch (e) {
    console.warn("wa media download error", (e as Error)?.message);
    return null;
  }
}

// ---------- process a single incoming message ----------
async function processMessage(
  message: any,
  contact: any,
  phoneNumberId: string,
  restaurantId: string,
): Promise<void> {
  const from: string = message.from; // customer's WhatsApp phone (E.164 no +)
  if (!from) return;

  const type: string = message.type;
  let userText = "";
  let imageDataUrl: string | null = null;
  let location: { lat: number; lng: number } | null = null;

  if (type === "text") {
    userText = message.text?.body || "";
  } else if (type === "interactive") {
    const i = message.interactive || {};
    if (i.type === "button_reply") userText = i.button_reply?.title || "";
    else if (i.type === "list_reply") userText = i.list_reply?.title || "";
  } else if (type === "button") {
    userText = message.button?.text || "";
  } else if (type === "image") {
    const id = message.image?.id;
    if (id) imageDataUrl = await downloadMediaDataUrl(id, "image/jpeg");
    userText = message.image?.caption || (imageDataUrl ? "[صورة من الزبون]" : "");
  } else if (type === "location") {
    const lat = message.location?.latitude;
    const lng = message.location?.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lng)) location = { lat, lng };
  } else if (type === "voice" || type === "audio") {
    // Voice transcription is handled inside agent-run for telegram via a separate
    // path; for WhatsApp, we send a graceful fallback for now.
    await waSendText(phoneNumberId, from, "الرسائل الصوتية على واتساب لسه ما مدعومة، اكتبلي طلبك نصياً 🙏");
    return;
  } else {
    // unsupported: ignore quietly
    return;
  }

  if (location) {
    const locLine = `[موقع الزبون: lat=${location.lat}, lng=${location.lng}] https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
    userText = userText ? `${userText}\n${locLine}` : locLine;
  }

  if (!userText && !imageDataUrl) return;

  const db = admin();
  const externalChatId = from;
  const handle = from;
  const customerName = contact?.profile?.name || from;

  let convId: string;
  const { data: existing } = await db
    .from("conversations")
    .select("id, last_message_at, cart, state, delivery, meta")
    .eq("restaurant_id", restaurantId)
    .eq("channel", "whatsapp")
    .eq("external_chat_id", externalChatId)
    .maybeSingle();

  if (existing) {
    convId = existing.id;
    const nowIso = new Date().toISOString();
    const lastMs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const ageMs = Date.now() - lastMs;
    const STALE_MS = 3 * 60 * 60 * 1000;
    const cartHasItems = Array.isArray((existing as any).cart) && (existing as any).cart.length > 0;
    const notSubmitted = (existing as any).state !== "submitted";
    const updates: any = { last_message_at: nowIso };
    if (ageMs > STALE_MS && cartHasItems && notSubmitted) {
      const prevMeta = ((existing as any).meta || {}) as Record<string, any>;
      updates.cart = [];
      updates.delivery = {};
      updates.state = "greeting";
      updates.meta = { ...prevMeta, pending_confirmation: null };
    }
    if (location) {
      const baseDelivery = updates.delivery ?? ((existing as any).delivery || {});
      updates.delivery = { ...baseDelivery, customer_location: location };
    }
    await db.from("conversations").update(updates).eq("id", convId);
  } else {
    const initialDelivery = location ? { customer_location: location } : {};
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        restaurant_id: restaurantId,
        channel: "whatsapp",
        external_chat_id: externalChatId,
        customer_handle: handle,
        customer_name: customerName || handle,
        delivery: initialDelivery,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("conversation insert failed:", error);
      return;
    }
    convId = created.id;
  }

  await db.from("messages").insert({
    conversation_id: convId,
    role: "user",
    content: userText,
  });

  const baseUrl = Deno.env.get("SUPABASE_URL");
  let data: any = {};
  let ok = true;
  try {
    const r = await retryFetch(`${baseUrl}/functions/v1/agent-run`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({ conversation_id: convId, image_url: imageDataUrl }),
    }, { attempts: 2, label: "agent-run" });
    data = await r.json().catch(() => ({}));
    ok = r.ok;
  } catch (e) {
    console.error("agent-run call failed", e);
    ok = false;
  }

  if (!ok) {
    const errText = data?.error === "rate_limited"
      ? "الخدمة مزدحمة شوية، جرب بعد دقيقة من فضلك."
      : data?.error === "payment_required"
      ? "النظام يحتاج تجديد الاشتراك. تواصل مع المطعم."
      : "صار خطأ بسيط، جرب مرة ثانية.";
    await waSendText(phoneNumberId, from, errText);
    return;
  }

  if (Array.isArray(data.media) && data.media.length) {
    for (const m of data.media) {
      if (m?.photo_url) await waSendImage(phoneNumberId, from, m.photo_url, m.caption);
    }
  }
  if (Array.isArray(data.actions) && data.actions.length) {
    await executeActions(phoneNumberId, from, data.actions);
  }
  if (data.reply) await waSendText(phoneNumberId, from, data.reply, data.quick_replies);
}

// ---------- restaurant lookup ----------
async function findRestaurantByPhoneId(phoneNumberId: string): Promise<string | null> {
  const db = admin();
  const { data } = await db
    .from("restaurants")
    .select("id, is_active")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data.id;
}

// ---------- top-level entry point ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Meta verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    console.error("missing META_APP_SECRET");
    return new Response("ok", { status: 200 }); // 200 so Meta doesn't retry-storm
  }
  const sigHeader = req.headers.get("x-hub-signature-256") || req.headers.get("X-Hub-Signature-256");
  const valid = await verifyMetaSignature(raw, sigHeader, appSecret);
  if (!valid) {
    console.warn("invalid meta signature");
    return new Response("invalid_signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ ok: true, ignored: "invalid_json" }); }

  // Walk entries → changes → messages
  const work = (async () => {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        if (!value) continue;
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        const contacts: any[] = value?.contacts || [];
        const messages: any[] = value?.messages || [];
        if (!phoneNumberId || messages.length === 0) continue;

        const restaurantId = await findRestaurantByPhoneId(phoneNumberId);
        if (!restaurantId) {
          console.warn("no restaurant for phone_number_id", phoneNumberId);
          continue;
        }

        for (const message of messages) {
          if (await alreadyProcessed(message?.id)) continue;
          const contact = contacts.find((c) => c?.wa_id === message?.from) || null;
          try {
            await processMessage(message, contact, phoneNumberId, restaurantId);
          } catch (e) {
            console.error("processMessage fatal:", e);
          }
        }
      }
    }
  })();

  // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(work);
  } else {
    await work;
  }

  return json({ ok: true });
});
