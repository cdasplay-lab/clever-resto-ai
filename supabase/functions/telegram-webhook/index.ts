// telegram-webhook: receives Telegram updates, persists user message, calls agent, replies.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

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

async function tgCall(method: string, body: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  return await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Split long messages on paragraph/line/word boundaries (telegram limit)
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
  const allowedReplies = Array.isArray(replies)
    ? replies.filter((reply) => !/معاينة\s*الطلب|المنيو|\bmenu\b|\bpreview\b|🧾|📋/iu.test(reply))
    : [];
  if (!allowedReplies.length) return undefined;
  // 2 columns layout
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < allowedReplies.length; i += 2) {
    rows.push(
      allowedReplies.slice(i, i + 2).map((t) => ({
        text: t,
        callback_data: t.slice(0, 60), // telegram callback_data limit is 64 bytes
      })),
    );
  }
  return { inline_keyboard: rows };
}

async function tgSend(chatId: number, text: string, replies?: string[]): Promise<boolean> {
  const trimmed = (text || "").trim();
  if (!trimmed) return false; // Never send empty/whitespace-only messages
  const chunks = splitText(trimmed);
  const kb = buildKeyboard(replies || []);
  let allOk = true;
  for (let i = 0; i < chunks.length; i++) {
    const body: any = { chat_id: chatId, text: chunks[i] };
    if (i === chunks.length - 1 && kb) body.reply_markup = kb;
    const r = await tgCall("sendMessage", body);
    if (!r.ok) allOk = false;
  }
  return allOk;
}

async function tgSendTyping(chatId: number) {
  try { await tgCall("sendChatAction", { chat_id: chatId, action: "typing" }); } catch (_) {}
}

async function tgAnswerCallback(callbackId: string) {
  try { await tgCall("answerCallbackQuery", { callback_query_id: callbackId }); } catch (_) {}
}

// Returns count of photos actually delivered (so caller knows truth instead of assuming success).
async function tgSendMedia(chatId: number, items: { photo_url: string; caption: string }[]): Promise<number> {
  let delivered = 0;
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    try {
      let r: Response;
      if (chunk.length === 1) {
        r = await tgCall("sendPhoto", { chat_id: chatId, photo: chunk[0].photo_url, caption: chunk[0].caption });
      } else {
        r = await tgCall("sendMediaGroup", {
          chat_id: chatId,
          media: chunk.map((m) => ({ type: "photo", media: m.photo_url, caption: m.caption })),
        });
      }
      if (r.ok) delivered += chunk.length;
    } catch (_) { /* counted as failed */ }
  }
  return delivered;
}

// Cross-instance idempotency via DB: Telegram retries; multiple worker instances run in parallel.
// In-memory Map is a fast pre-check, but the DB is the source of truth.
const RECENT_UPDATES = new Map<string, number>();
const RECENT_UPDATES_TTL_MS = 120_000;
function memDuplicate(updateId: number | string | undefined): boolean {
  if (updateId === undefined || updateId === null) return false;
  const key = String(updateId);
  const now = Date.now();
  for (const [k, t] of RECENT_UPDATES) if (now - t > RECENT_UPDATES_TTL_MS) RECENT_UPDATES.delete(k);
  if (RECENT_UPDATES.has(key)) return true;
  RECENT_UPDATES.set(key, now);
  return false;
}
async function dbMarkUpdate(db: any, updateId: number | string | undefined): Promise<boolean> {
  if (updateId === undefined || updateId === null) return false;
  try {
    const { data } = await db.rpc("try_mark_update", { _channel: "telegram", _key: String(updateId) });
    // try_mark_update returns true when inserted (fresh). Duplicate => false.
    return data === false;
  } catch (_) { return false; }
}
// Soft per-chat flood protection: > 8 user messages in 30s => silently drop.
async function isFlooding(db: any, convId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 30_000).toISOString();
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId)
      .eq("role", "user")
      .gte("created_at", since);
    return (count ?? 0) > 8;
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return json({ error: "TELEGRAM_API_KEY missing" }, 500);

  const expected = await deriveSecret(TELEGRAM_API_KEY);
  const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

  const update = await req.json();
  if (memDuplicate(update?.update_id)) {
    return json({ ok: true, deduped: "memory" });
  }
  const _db0 = admin();
  if (await dbMarkUpdate(_db0, update?.update_id)) {
    return json({ ok: true, deduped: "db" });
  }

  // === Callback (inline keyboard button press) ===
  const cb = update.callback_query;
  if (cb) {
    await tgAnswerCallback(cb.id);
    const chatId = cb.message?.chat?.id;
    const data: string = cb.data || "";
    if (!chatId || !data) return json({ ok: true });
    // Reuse the standard message flow by synthesizing a "message" event
    update.message = {
      chat: cb.message.chat,
      from: cb.from,
      text: data,
    };
  }

  // Telegram can deliver normal chats as `message`, and business-linked chats as
  // `business_message`. Treat both as customer messages so updates are not marked
  // processed while silently ignored.
  const message = update.message ?? update.edited_message ?? update.business_message ?? update.edited_business_message;
  const chatId = message?.chat?.id;
  const text: string | undefined = message?.text;
  const caption: string | undefined = message?.caption;
  const photos: any[] | undefined = message?.photo;
  const photo = Array.isArray(photos) && photos.length ? photos[photos.length - 1] : null;
  const voice = message?.voice || message?.audio;

  if (!chatId || (!text && !photo && !voice)) return json({ ok: true, ignored: true });

  // Show typing immediately so the user feels the bot is responsive
  await tgSendTyping(chatId);

  // Helper: download a Telegram file to data URL
  async function downloadAsDataUrl(fileId: string, fallbackMime: string): Promise<string | null> {
    try {
      const r = await tgCall("getFile", { file_id: fileId });
      const j = await r.json();
      const filePath = j?.result?.file_path;
      if (!filePath) return null;
      const dl = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_API_KEY}/${filePath}`);
      if (!dl.ok) return null;
      const buf = new Uint8Array(await dl.arrayBuffer());
      const ct = dl.headers.get("content-type") || fallbackMime;
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return `data:${ct};base64,${btoa(bin)}`;
    } catch (_) { return null; }
  }

  // If photo: fetch via Telegram getFile + download to data URL (Vision support)
  let imageDataUrl: string | null = null;
  if (photo?.file_id) imageDataUrl = await downloadAsDataUrl(photo.file_id, "image/jpeg");

  // If voice/audio: transcribe via Lovable AI
  let transcribedText = "";
  if (voice?.file_id) {
    const audioDataUrl = await downloadAsDataUrl(voice.file_id, voice.mime_type || "audio/ogg");
    if (audioDataUrl) {
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
        const mime = audioDataUrl.match(/^data:([^;]+)/)?.[1] || "audio/ogg";
        const fmt = mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("mp4") || mime.includes("m4a") ? "mp4" : "ogg";
        const base64 = audioDataUrl.split(",")[1] || "";
        const tr = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        });
        if (tr.ok) {
          const tj = await tr.json();
          transcribedText = (tj?.choices?.[0]?.message?.content ?? "").toString().trim();
        }
      } catch (_) { /* ignore */ }
    }
    if (!transcribedText) {
      await tgSend(chatId, "ما كدرت أفهم الرسالة الصوتية 🎙️ ممكن تكتبلي النص؟");
      return json({ ok: true });
    }
  }

  const baseText = text ?? caption ?? "";
  const userText = (transcribedText
    ? `[رسالة صوتية] ${transcribedText}`
    : (baseText || (imageDataUrl ? "[صورة من الزبون]" : ""))).toString();

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
    return json({ ok: true });
  }

  const externalChatId = String(chatId);
  const handle = message?.from?.username ? `@${message.from.username}` : String(message?.from?.id ?? "");
  const customerName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ");

  let convId: string;
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("channel", "telegram")
    .eq("external_chat_id", externalChatId)
    .maybeSingle();
  if (existing) {
    convId = existing.id;
    await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convId);
  } else {
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        restaurant_id: restaurant.id,
        channel: "telegram",
        external_chat_id: externalChatId,
        customer_handle: handle,
        customer_name: customerName || handle,
      })
      .select("id")
      .single();
    if (error || !created) return json({ error: error?.message ?? "conv error" }, 500);
    convId = created.id;
  }

  // Per-chat flood guard: if this customer is hammering the bot, drop the request silently
  // (except for the very first overflow message, where we tell them once).
  if (await isFlooding(db, convId)) {
    await tgSend(chatId, "لحظة من فضلك 🙏 وصلتني رسائل كثيرة بنفس الوقت، خليني أجاوب على اللي قبل.");
    return json({ ok: true, throttled: true });
  }

  await db.from("messages").insert({
    conversation_id: convId,
    role: "user",
    content: userText,
  });


  // Keep typing visible during agent call (refresh every ~4s)
  let typingTimer: number | undefined;
  typingTimer = setInterval(() => { void tgSendTyping(chatId); }, 4000) as unknown as number;

  const baseUrl = Deno.env.get("SUPABASE_URL");
  const r = await fetch(`${baseUrl}/functions/v1/agent-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: convId, image_url: imageDataUrl }),
  });
  if (typingTimer !== undefined) clearInterval(typingTimer);
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const errText = data.error === "rate_limited"
      ? "الخدمة مزدحمة شوية، جرب بعد دقيقة من فضلك."
      : data.error === "payment_required"
      ? "النظام يحتاج تجديد الاشتراك. تواصل مع المطعم."
      : "صار خطأ بسيط، جرب مرة ثانية.";
    await tgSend(chatId, errText);
    return json({ ok: true });
  }

  let mediaSent = 0;
  const mediaRequested = Array.isArray(data.media) ? data.media.length : 0;
  if (mediaRequested) {
    mediaSent = await tgSendMedia(chatId, data.media);
  }
  // If model thought it sent images but the channel actually failed, override the reply
  // with an honest message instead of letting the bot lie about delivery.
  let finalReply: string = typeof data.reply === "string" ? data.reply : "";
  if (mediaRequested > 0 && mediaSent === 0) {
    finalReply = "اعتذر، صار خلل بإرسال الصور. أحاول مرة ثانية الحين 🙏";
  }
  if (finalReply && finalReply.trim()) {
    await tgSend(chatId, finalReply, data.quick_replies);
  }
  return json({ ok: true, media_requested: mediaRequested, media_sent: mediaSent });
});
