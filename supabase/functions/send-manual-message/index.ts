// send-manual-message: owner sends a manual reply to a conversation through its channel.
// Auth: requires the caller's Supabase JWT (Authorization: Bearer <token>) so RLS is enforced.
import { corsHeaders, json } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GATEWAY = "https://connector-gateway.lovable.dev";

async function sendTelegram(chatId: string, text: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const r = await fetch(`${GATEWAY}/telegram/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: Number(chatId), text }),
  });
  if (!r.ok) throw new Error(`telegram ${r.status}: ${await r.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: ue } = await userClient.auth.getUser();
    if (ue || !userData.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const conversation_id = String(body.conversation_id || "");
    const text = String(body.text || "").trim();
    if (!conversation_id || !text) return json({ error: "conversation_id and text required" }, 400);
    if (text.length > 4000) return json({ error: "text too long" }, 400);

    // Load conversation via RLS-scoped client (owner-only via SELECT policy)
    const { data: conv, error: ce } = await userClient
      .from("conversations")
      .select("id, channel, external_chat_id, restaurant_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (ce || !conv) return json({ error: "conversation not found or forbidden" }, 404);

    // Send via the right channel
    if (conv.channel === "telegram") {
      await sendTelegram(conv.external_chat_id, text);
    } else {
      return json({ error: `channel ${conv.channel} not supported yet` }, 400);
    }

    // Persist as assistant/human (RLS: owners insert own messages)
    const { error: me } = await userClient.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: text,
      name: "human",
    });
    if (me) return json({ error: me.message }, 500);

    await userClient
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return json({ ok: true });
  } catch (e: any) {
    console.error("send-manual-message error:", e);
    return json({ error: e?.message || "error" }, 500);
  }
});
