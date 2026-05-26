// notify-order-status: notifies the customer on the original channel when
// the owner changes an order's status from the dashboard.
// Body: { order_id: string }
// Auth: requires owner JWT (RLS check via select on orders).

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tgSend(chatId: string | number, text: string) {
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

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الاستلام",
  confirmed: "تم تأكيد طلبك ✅",
  preparing: "طلبك قيد التحضير 👨‍🍳",
  out_for_delivery: "طلبك بالطريق إليك 🛵",
  completed: "تم تسليم طلبك. شكراً 🙏",
  cancelled: "تم إلغاء طلبك ❌",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const db = admin();
    const { data: order } = await db
      .from("orders")
      .select("id,status,total,restaurant_id,conversation_id")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return json({ error: "order not found" }, 404);

    // Verify ownership
    const { data: rest } = await db
      .from("restaurants")
      .select("id,owner_id,currency,name")
      .eq("id", order.restaurant_id)
      .maybeSingle();
    if (!rest || rest.owner_id !== userData.user.id) return json({ error: "forbidden" }, 403);

    if (!order.conversation_id) return json({ ok: true, skipped: "no_conversation" });
    const { data: conv } = await db
      .from("conversations")
      .select("id,channel,external_chat_id")
      .eq("id", order.conversation_id)
      .maybeSingle();
    if (!conv) return json({ ok: true, skipped: "no_conversation" });

    const label = STATUS_LABELS[order.status] || order.status;
    const text = `📦 تحديث طلبك من ${rest.name}\n${label}\nالإجمالي: ${order.total} ${rest.currency}`;

    if (conv.channel === "telegram") {
      await tgSend(conv.external_chat_id, text);
    }
    // Other channels can be added later (whatsapp/instagram/facebook)

    return json({ ok: true });
  } catch (e: any) {
    console.error("notify-order-status error:", e);
    return json({ error: e?.message || "error" }, 500);
  }
});
