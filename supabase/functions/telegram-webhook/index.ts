// telegram-webhook: receives Telegram updates and dispatches to the agent.
//
// Two routing modes:
//   A) Per-restaurant (preferred): URL is `/telegram-webhook?r=<restaurant_id>`,
//      registered by telegram-connect with a per-restaurant secret derived from
//      the restaurant's own bot token. Outbound calls use that bot token directly.
//   B) Legacy global: no `?r=`, secret derived from the platform `TELEGRAM_API_KEY`
//      (the workspace connector). The first active restaurant handles all updates.
//      Kept for backwards compatibility with the original single-tenant setup.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { retryFetch } from "../_shared/retry.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const TG_API = "https://api.telegram.org";
const TG_MAX_LEN = 3900;

// --- secret derivation (must match telegram-connect) ---
async function sha256B64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function deriveLegacySecret(apiKey: string): Promise<string> {
  return sha256B64Url(`telegram-webhook:${apiKey}`);
}
async function derivePerBotSecret(token: string): Promise<string> {
  return sha256B64Url(`tg-bot-secret:${token}`);
}

function safeEqual(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// --- Telegram client factory ---
// In per-restaurant mode we call api.telegram.org directly with the bot's own token.
// In legacy mode we keep using the connector gateway with the platform key.
type TgClient = {
  call: (method: string, body: any) => Promise<Response>;
  fileUrl: (filePath: string) => string;
  downloadFile: (filePath: string) => Promise<Response>;
};

function makeDirectClient(token: string): TgClient {
  return {
    call: (method, body) => retryFetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { attempts: 3, label: `tg:${method}` }),
    fileUrl: (fp) => `${TG_API}/file/bot${token}/${fp}`,
    downloadFile: (fp) => retryFetch(`${TG_API}/file/bot${token}/${fp}`, {}, { attempts: 3, label: "tg:file" }),
  };
}

function makeGatewayClient(): TgClient {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const gatewayHeaders = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": TELEGRAM_API_KEY,
  };
  return {
    call: (method, body) => retryFetch(`${GATEWAY}/${method}`, {
      method: "POST",
      headers: {
        ...gatewayHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, { attempts: 3, label: `tg:${method}` }),
    // TELEGRAM_API_KEY is the connector key, not the raw bot token, so legacy
    // downloads must go through the connector gateway's /file/<file_path> path.
    fileUrl: (fp) => `${GATEWAY}/file/${fp}`,
    downloadFile: (fp) => retryFetch(`${GATEWAY}/file/${fp}`, {
      headers: gatewayHeaders,
    }, { attempts: 3, label: "tg:file" }),
  };
}

// --- text utilities ---
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

// Strip LLM markdown that Telegram (no parse_mode) renders literally.
// Removes **bold**, __underline__, and stray leftover * _ markers around words.
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S[^*\n]*\S|\S)\*(?=\s|[.,!?؟،:;)\]]|$)/g, "$1$2")
    .replace(/(^|\s)_(\S[^_\n]*\S|\S)_(?=\s|[.,!?؟،:;)\]]|$)/g, "$1$2");
}

async function tgSend(tg: TgClient, chatId: number, text: string, replies?: string[]) {
  const clean = stripMarkdown(text);
  const chunks = splitText(clean);
  const kb = buildKeyboard(replies || []);
  for (let i = 0; i < chunks.length; i++) {
    const body: any = { chat_id: chatId, text: chunks[i] };
    if (i === chunks.length - 1 && kb) body.reply_markup = kb;
    try { await tg.call("sendMessage", body); } catch (e) { console.error("tgSend failed", e); }
  }
}


async function tgSendTyping(tg: TgClient, chatId: number) {
  try { await tg.call("sendChatAction", { chat_id: chatId, action: "typing" }); } catch (_) {}
}

async function tgAnswerCallback(tg: TgClient, callbackId: string) {
  try { await tg.call("answerCallbackQuery", { callback_query_id: callbackId }); } catch (_) {}
}

async function tgSendMedia(tg: TgClient, chatId: number, items: { photo_url: string; caption: string }[]) {
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    try {
      if (chunk.length === 1) {
        await tg.call("sendPhoto", { chat_id: chatId, photo: chunk[0].photo_url, caption: chunk[0].caption });
      } else {
        await tg.call("sendMediaGroup", {
          chat_id: chatId,
          media: chunk.map((m) => ({ type: "photo", media: m.photo_url, caption: m.caption })),
        });
      }
    } catch (e) { console.error("tgSendMedia failed", e); }
  }
}

async function executeActions(tg: TgClient, chatId: number, actions: any[]) {
  if (!Array.isArray(actions) || !actions.length) return;
  for (const a of actions) {
    try {
      if (a?.type === "send_location" && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
        await tg.call("sendLocation", { chat_id: chatId, latitude: a.lat, longitude: a.lng });
        if (a.title || a.address) {
          await tg.call("sendMessage", {
            chat_id: chatId,
            text: [a.title, a.address].filter(Boolean).join("\n📍 "),
          });
        }
      } else if (a?.type === "request_location") {
        await tg.call("sendMessage", {
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

async function alreadyProcessed(updateId: number | string | undefined): Promise<boolean> {
  if (updateId === undefined || updateId === null) return false;
  const db = admin();
  const { error } = await db.from("processed_updates").insert({
    channel: "telegram",
    update_key: String(updateId),
  });
  if (!error) return false;
  if ((error as any).code === "23505") return true;
  console.warn("processed_updates insert error:", error);
  return false;
}

async function processUpdate(update: any, tg: TgClient, restaurantId: string): Promise<void> {
  const cb = update.callback_query;
  if (cb) {
    await tgAnswerCallback(tg, cb.id);
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
  const location = message?.location;

  if (!chatId || (!text && !photo && !voice && !location)) return;

  await tgSendTyping(tg, chatId);

  async function downloadAsDataUrl(fileId: string, fallbackMime: string): Promise<string | null> {
    try {
      const r = await tg.call("getFile", { file_id: fileId });
      const j = await r.json();
      const filePath = j?.result?.file_path;
      if (!filePath) {
        console.warn("telegram getFile returned no file_path", JSON.stringify(j).slice(0, 300));
        return null;
      }
      const dl = await tg.downloadFile(filePath);
      if (!dl.ok) {
        console.warn(`telegram file download failed status=${dl.status} path=${filePath}`);
        return null;
      }
      const buf = new Uint8Array(await dl.arrayBuffer());
      const ct = dl.headers.get("content-type") || fallbackMime;
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return `data:${ct};base64,${btoa(bin)}`;
    } catch (e) {
      console.warn("telegram file download error", (e as Error)?.message);
      return null;
    }
  }

  let imageDataUrl: string | null = null;
  if (photo?.file_id) imageDataUrl = await downloadAsDataUrl(photo.file_id, "image/jpeg");

  let transcribedText = "";
  if (voice?.file_id) {
    const audioDataUrl = await downloadAsDataUrl(voice.file_id, voice.mime_type || "audio/ogg");
    if (audioDataUrl) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
      const mime = audioDataUrl.match(/^data:([^;]+)/)?.[1] || "audio/ogg";
      const fmt = mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("mp4") || mime.includes("m4a") ? "mp4" : "ogg";
      const base64 = audioDataUrl.split(",")[1] || "";
      const transcribePrompt =
        "مهمتك: تفريغ صوتي حرفي للهجة العراقية/الخليجية في سياق طلبات مطاعم (برجر، بيتزا، شاورما، مشاوي، مشروبات، حلويات). " +
        "اسمع الصوت بدقة واكتب الكلام بالعربية كلمة بكلمة كما نُطق تماماً، حتى لو فيه أخطاء أو تكرار. " +
        "لا تترجم، لا تلخّص، لا تصحّح، لا تضيف شرح أو تعليق. " +
        "أسماء الأكلات والكميات والأرقام مهمة جداً — اكتبها كما سُمعت. " +
        "إذا في كلمة مو واضحة اكتب أقرب تخمين بدون أقواس أو علامات استفهام. " +
        "ممنوع منعاً باتاً ترد بـ 'لا أستطيع' أو 'عذراً' أو أي اعتذار — لازم تعطي نص. " +
        "أخرج النص المفرّغ فقط، بدون أي مقدمة أو 'النص:' أو علامات اقتباس.";
      const tryTranscribe = async (model: string, useAudioPart = true): Promise<string> => {
        try {
          const content: any[] = [{ type: "text", text: transcribePrompt }];
          if (useAudioPart) {
            content.push({ type: "input_audio", input_audio: { data: base64, format: fmt } });
          }
          const tr = await retryFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              messages: [{ role: "user", content }],
            }),
          }, { attempts: 2, label: `ai:transcribe:${model}` });
          if (!tr.ok) {
            const errBody = await tr.text().catch(() => "");
            console.warn(`[transcribe] ${model} status=${tr.status} body=${errBody.slice(0,400)}`);
            return "";
          }
          const tj = await tr.json();
          let t = (tj?.choices?.[0]?.message?.content ?? "").toString().trim();
          if (!t) {
            console.warn(`[transcribe] ${model} empty response, raw=${JSON.stringify(tj).slice(0,400)}`);
          } else {
            console.log(`[transcribe] ${model} OK len=${t.length}: ${t.slice(0,120)}`);
          }
          t = t.replace(/^["'«»""]+|["'«»""]+$/g, "").replace(/^(النص|التفريغ|الكلام)\s*[:：]\s*/i, "").trim();
          if (/^(لا\s+(أستطيع|اكدر|اقدر|أكدر)|عذرا|آسف|sorry|i\s+can'?t|i\s+am\s+unable)/i.test(t)) {
            console.warn(`[transcribe] ${model} refused: ${t.slice(0,80)}`);
            return "";
          }
          return t;
        } catch (e) {
          console.warn(`[transcribe] ${model} error`, (e as Error)?.message);
          return "";
        }
      };
      // Try strongest first; fall back through faster models.
      transcribedText = await tryTranscribe("google/gemini-2.5-pro");
      if (!transcribedText) transcribedText = await tryTranscribe("openai/gpt-5-mini");
      if (!transcribedText) transcribedText = await tryTranscribe("google/gemini-2.5-flash");
    }
    if (!transcribedText) {
      await tgSend(tg, chatId, "ما كدرت أفهم الرسالة الصوتية 🎙️ ممكن تعيدها أوضح أو تكتبلي النص؟");
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

  const externalChatId = String(chatId);
  const handle = message?.from?.username ? `@${message.from.username}` : String(message?.from?.id ?? "");
  const customerName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ");

  let convId: string;
  const { data: existing } = await db
    .from("conversations")
    .select("id, last_message_at, cart, state, delivery, meta")
    .eq("restaurant_id", restaurantId)
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
        restaurant_id: restaurantId,
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

  const typingTimer = setInterval(() => { void tgSendTyping(tg, chatId); }, 4000) as unknown as number;

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
    await tgSend(tg, chatId, errText);
    return;
  }

  if (Array.isArray(data.media) && data.media.length) await tgSendMedia(tg, chatId, data.media);
  if (Array.isArray(data.actions) && data.actions.length) await executeActions(tg, chatId, data.actions);
  if (data.reply) await tgSend(tg, chatId, data.reply, data.quick_replies);
}

// --- routing: figure out which restaurant + bot owns this update ---
async function resolveRoute(req: Request): Promise<
  | { ok: true; tg: TgClient; restaurantId: string }
  | { ok: false; status: number; body: string }
> {
  const url = new URL(req.url);
  const r = url.searchParams.get("r");
  const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");

  // Per-restaurant mode
  if (r) {
    const db = admin();
    const { data: rest } = await db
      .from("restaurants")
      .select("id, telegram_bot_token, is_active")
      .eq("id", r)
      .maybeSingle();
    if (!rest || !rest.telegram_bot_token) {
      return { ok: false, status: 404, body: "restaurant_or_bot_not_found" };
    }
    if (!rest.is_active) {
      return { ok: false, status: 403, body: "restaurant_inactive" };
    }
    const expected = await derivePerBotSecret(rest.telegram_bot_token);
    if (!safeEqual(got, expected)) return { ok: false, status: 401, body: "Unauthorized" };
    return { ok: true, tg: makeDirectClient(rest.telegram_bot_token), restaurantId: rest.id };
  }

  // Legacy global mode (kept for original single-tenant connector workflow).
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return { ok: false, status: 401, body: "Unauthorized" };
  const expected = await deriveLegacySecret(TELEGRAM_API_KEY);
  if (!safeEqual(got, expected)) return { ok: false, status: 401, body: "Unauthorized" };
  const db = admin();
  const { data: first } = await db
    .from("restaurants")
    .select("id")
    .eq("is_active", true)
    .is("telegram_bot_token", null) // skip restaurants that have their own bot
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first) return { ok: false, status: 404, body: "no_legacy_restaurant" };
  return { ok: true, tg: makeGatewayClient(), restaurantId: first.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const route = await resolveRoute(req);
  if (!route.ok) return new Response(route.body, { status: route.status });

  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true, ignored: "invalid_json" }); }

  if (await alreadyProcessed(update?.update_id)) {
    return json({ ok: true, duplicate: true });
  }

  const work = processUpdate(update, route.tg, route.restaurantId).catch((e) => {
    console.error("processUpdate fatal:", e);
  });

  // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(work);
  } else {
    await work;
  }

  return json({ ok: true });
});
