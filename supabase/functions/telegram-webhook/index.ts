// telegram-webhook: receives Telegram updates, persists user message, calls agent, replies.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { retryFetch } from "../_shared/retry.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const TG_MAX_LEN = 3900; // Telegram hard limit is 4096; leave a small safety margin

async function deriveSecret(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${apiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function tgCall(method: string, body: any): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  return await retryFetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, { attempts: 3, label: `tg:${method}` });
}

function splitText(text: string, max = TG_MAX_LEN): string[] {
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

function buildKeyboard(replies: string[]) {
  if (!Array.isArray(replies) || !replies.length) return undefined;
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < replies.length; i += 2) {
    rows.push(replies.slice(i, i + 2).map((t) => ({ text: t, callback_data: t.slice(0, 60) })));
  }
  return { inline_keyboard: rows };
}

async function tgSend(chatId: number, text: string, replies?: string[]) {
  const chunks = splitText(text);
  const kb = buildKeyboard(replies || []);
  for (let i = 0; i < chunks.length; i++) {
    const body: any = { chat_id: chatId, text: chunks[i] };
    if (i === chunks.length - 1 && kb) body.reply_markup = kb;
    try { await tgCall("sendMessage", body); } catch (e) { console.error("tgSend failed", e); }
  }
}

async function tgSendTyping(chatId: number) {
  try { await tgCall("sendChatAction", { chat_id: chatId, action: "typing" }); } catch (_) {}
}

async function tgAnswerCallback(callbackId: string) {
  try { await tgCall("answerCallbackQuery", { callback_query_id: callbackId }); } catch (_) {}
}

async function tgSendMedia(chatId: number, items: { photo_url: string; caption: string }[]) {
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    try {
      if (chunk.length === 1) {
        await tgCall("sendPhoto", { chat_id: chatId, photo: chunk[0].photo_url, caption: chunk[0].caption });
      } else {
        await tgCall("sendMediaGroup", {
          chat_id: chatId,
          media: chunk.map((m) => ({ type: "photo", media: m.photo_url, caption: m.caption })),
        });
      }
    } catch (e) { console.error("tgSendMedia failed", e); }
  }
}

// Execute agent-produced actions on Telegram.
async function executeActions(chatId: number, actions: any[]) {
  if (!Array.isArray(actions) || !actions.length) return;
  for (const a of actions) {
    try {
      if (a?.type === "send_location" && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
        await tgCall("sendLocation", { chat_id: chatId, latitude: a.lat, longitude: a.lng });
        if (a.title || a.address) {
          await tgCall("sendMessage", {
            chat_id: chatId,
            text: [a.title, a.address].filter(Boolean).join("\n📍 "),
          });
        }
      } else if (a?.type === "request_location") {
        await tgCall("sendMessage", {
          chat_id: chatId,
          text: a.text || "شارك موقعك من الزر اللي تحت 👇",
          reply_markup: {
            keyboard: [[{ text: "📍 شارك موقعي", request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
    } catch (e) {
      console.error("executeActions failed for", a?.type, e);
    }
  }
}

// Idempotency check via processed_updates. Returns true if already seen.
async function alreadyProcessed(updateId: number | string): Promise<boolean> {
  if (updateId === undefined || updateId === null) return false;
  const db = admin();
  const key = String(updateId);
  const { error } = await db.from("processed_updates").insert({
    channel: "telegram",
    update_key: key,
  });
  if (!error) return false;
  // 23505 = unique violation -> already processed
  if ((error as any).code === "23505") return true;
  console.warn("processed_updates insert error:", error);
  return false;
}

async function processUpdate(update: any, telegramApiKey: string): Promise<void> {
  // Callback (inline keyboard button press)
  const cb = update.callback_query;
  if (cb) {
    await tgAnswerCallback(cb.id);
    const chatId = cb.message?.chat?.id;
    const data: string = cb.data || "";
    if (!chatId || !data) return;
    update.message = { chat: cb.message.chat, from: cb.from, text: data };
  }

  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text: string | undefined = message?.text;
  const caption: string | undefined = message?.caption;
  const photos: any[] | undefined = message?.photo;
  const photo = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
  const voice = message?.voice || message?.audio;
  const location = message?.location; // { latitude, longitude }

  if (!chatId || (!text && !photo && !voice && !location)) return;

  await tgSendTyping(chatId);

  async function downloadAsDataUrl(fileId: string, fallbackMime: string): Promise<string | null> {
    try {
      const r = await tgCall("getFile", { file_id: fileId });
      const j = await r.json();
      const filePath = j?.result?.file_path;
      if (!filePath) return null;
      const dl = await fetch(`https://api.telegram.org/file/bot${telegramApiKey}/${filePath}`);
      if (!dl.ok) return null;
      const buf = new Uint8Array(await dl.arrayBuffer());
      const ct = dl.headers.get("content-type") || fallbackMime;
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return `data:${ct};base64,${btoa(bin)}`;
    } catch (_) { return null; }
  }

  let imageDataUrl: string | null = null;
  if (photo?.file_id) imageDataUrl = await downloadAsDataUrl(photo.file_id, "image/jpeg");

  let transcribedText = "";
  if (voice?.file_id) {
    const audioDataUrl = await downloadAsDataUrl(voice.file_id, voice.mime_type || "audio/ogg");
    if (audioDataUrl) {
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
        const mime = audioDataUrl.match(/^data:([^;]+)/)?.[1] || "audio/ogg";
        const fmt = mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("mp4") || mime.includes("m4a") ? "mp4" : "ogg";
        const base64 = audioDataUrl.split(",")[1] || "";
        const tr = await retryFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "حوّل هذه الرسالة الصوتية لنص عربي بالضبط كما قيلت، بدون أي إضافات أو تعليقات. فقط النص المنطوق." },
                { type: "input_audio", input_audio: { data: base64, format: fmt } },
              ],
            }],
          }),
        }, { attempts: 2, label: "ai:transcribe" });
        if (tr.ok) {
          const tj = await tr.json();
          transcribedText = (tj?.choices?.[0]?.message?.content ?? "").toString().trim();
        }
      } catch (_) {}
    }
    if (!transcribedText) {
      await tgSend(chatId, "ما كدرت أفهم الرسالة الصوتية 🎙️ ممكن تكتبلي النص؟");
      return;
    }
  }

  const baseText = text ?? caption ?? "";
  let userText = (transcribedText
    ? `[رسالة صوتية] ${transcribedText}`
    : (baseText || (imageDataUrl ? "[صورة من الزبون]" : ""))).toString();

  if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    const lat = location.latitude;
    const lng = location.longitude;
    const locLine = `[موقع الزبون: lat=${lat}, lng=${lng}] https://maps.google.com/?q=${lat},${lng}`;
    userText = userText ? `${userText}\n${locLine}` : locLine;
  }

  const db = admin();

  const { data: restaurant } = await db
    .from("restaurants")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!restaurant) {
    await tgSend(chatId, "النظام ما عدا مطعم مربوط بعد. الرجاء التواصل مع الإدارة.");
    return;
  }

  const externalChatId = String(chatId);
  const handle = message?.from?.username ? `@${message.from.username}` : String(message?.from?.id ?? "");
  const customerName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ");

  let convId: string;
  const { data: existing } = await db
    .from("conversations")
    .select("id, last_message_at, cart, state, delivery, meta")
    .eq("restaurant_id", restaurant.id)
    .eq("channel", "telegram")
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
    // Persist customer location into delivery
    if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      const baseDelivery = updates.delivery ?? ((existing as any).delivery || {});
      updates.delivery = {
        ...baseDelivery,
        customer_location: { lat: location.latitude, lng: location.longitude },
      };
    }
    await db.from("conversations").update(updates).eq("id", convId);
  } else {
    const initialDelivery = (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
      ? { customer_location: { lat: location.latitude, lng: location.longitude } }
      : {};
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        restaurant_id: restaurant.id,
        channel: "telegram",
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

  // Keep typing indicator alive during agent call
  const typingTimer = setInterval(() => { void tgSendTyping(chatId); }, 4000) as unknown as number;

  const baseUrl = Deno.env.get("SUPABASE_URL");
  let data: any = {};
  let ok = true;
  try {
    const r = await retryFetch(`${baseUrl}/functions/v1/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: convId, image_url: imageDataUrl }),
    }, { attempts: 2, label: "agent-run" });
    data = await r.json().catch(() => ({}));
    ok = r.ok;
  } catch (e) {
    console.error("agent-run call failed", e);
    ok = false;
  } finally {
    clearInterval(typingTimer);
  }

  if (!ok) {
    const errText = data?.error === "rate_limited"
      ? "الخدمة مزدحمة شوية، جرب بعد دقيقة من فضلك."
      : data?.error === "payment_required"
      ? "النظام يحتاج تجديد الاشتراك. تواصل مع المطعم."
      : "صار خطأ بسيط، جرب مرة ثانية.";
    await tgSend(chatId, errText);
    return;
  }

  if (Array.isArray(data.media) && data.media.length) {
    await tgSendMedia(chatId, data.media);
  }
  if (Array.isArray(data.actions) && data.actions.length) {
    await executeActions(chatId, data.actions);
  }
  if (data.reply) await tgSend(chatId, data.reply, data.quick_replies);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return json({ error: "TELEGRAM_API_KEY missing" }, 500);

  const expected = await deriveSecret(TELEGRAM_API_KEY);
  const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

  let update: any;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true, ignored: "invalid_json" });
  }

  // Idempotency: if Telegram retries the same update, ack but skip work.
  const updateId = update?.update_id;
  if (await alreadyProcessed(updateId)) {
    return json({ ok: true, duplicate: true });
  }

  // Reply 200 fast so Telegram doesn't retry; process in background.
  const work = processUpdate(update, TELEGRAM_API_KEY).catch((e) => {
    console.error("processUpdate fatal:", e);
  });

  // @ts-ignore EdgeRuntime is available in Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(work);
  } else {
    // Local fallback: await it
    await work;
  }

  return json({ ok: true });
});
