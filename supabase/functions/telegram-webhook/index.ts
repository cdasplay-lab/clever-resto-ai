// telegram-webhook: receives Telegram updates, persists user message, calls agent, replies.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

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

async function tgSend(chatId: number, text: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  await fetch(`${GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return json({ error: "TELEGRAM_API_KEY missing" }, 500);

  // Verify secret token
  const expected = await deriveSecret(TELEGRAM_API_KEY);
  const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

  const update = await req.json();
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text;
  if (!chatId || !text) return json({ ok: true, ignored: true });

  const db = admin();

  // For now, pick the first active restaurant. Multi-bot routing comes later
  // (mapping bot username -> restaurant_id).
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

  // Upsert conversation
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

  // Save user message
  await db.from("messages").insert({
    conversation_id: convId,
    role: "user",
    content: text,
  });

  // Call agent
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const r = await fetch(`${baseUrl}/functions/v1/agent-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: convId }),
  });
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

  if (data.reply) await tgSend(chatId, data.reply);
  return json({ ok: true });
});
