// Public cron endpoint: scans complaints that have been open for >30 min
// and sends a reminder ping to the owner/branch via Telegram.
// Called by pg_cron every 5 minutes.
import { createFileRoute } from "@tanstack/react-router";

const REMINDER_THRESHOLD_MIN = 30;
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tgSend(chatId: string, text: string, lovableKey: string, telegramKey: string) {
  try {
    await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (_) { /* never block */ }
}

const TYPE_AR: Record<string, string> = {
  late: "تأخير", cold: "طعام بارد", missing: "صنف ناقص",
  wrong: "طلب غلط", quality: "جودة سيئة", rude: "سوء معاملة", other: "شكوى عامة",
};

export const Route = createFileRoute("/api/public/check-complaints")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY || "";
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY || "";

        const cutoffIso = new Date(Date.now() - REMINDER_THRESHOLD_MIN * 60 * 1000).toISOString();
        const { data: complaints, error } = await supabaseAdmin
          .from("complaints")
          .select("id,restaurant_id,conversation_id,type,note,customer_name,customer_handle,channel,updated_at")
          .eq("status", "open")
          .lt("updated_at", cutoffIso)
          .limit(100);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        let notified = 0;
        for (const c of complaints || []) {
          // Lookup owner + branches chat ids
          const { data: r } = await supabaseAdmin
            .from("restaurants")
            .select("name,owner_telegram_chat_id")
            .eq("id", c.restaurant_id)
            .maybeSingle();
          const { data: brs } = await supabaseAdmin
            .from("branches")
            .select("telegram_chat_id")
            .eq("restaurant_id", c.restaurant_id)
            .eq("is_active", true);

          const chats = new Set<string>();
          if (r?.owner_telegram_chat_id) chats.add(r.owner_telegram_chat_id);
          (brs || []).forEach((b: any) => { if (b.telegram_chat_id) chats.add(b.telegram_chat_id); });

          if (LOVABLE_API_KEY && TELEGRAM_API_KEY && chats.size) {
            const who = c.customer_name || c.customer_handle || "زبون";
            const typeAr = TYPE_AR[c.type] || "شكوى";
            const text = `⏰ تذكير: شكوى مفتوحة من +${REMINDER_THRESHOLD_MIN} دقيقة\nالمطعم: ${r?.name || ""}\nالزبون: ${who} (${c.channel})\nالنوع: ${typeAr}\nالنص: "${c.note || "—"}"\nافتحها من لوحة التحكم > الشكاوى.`;
            for (const chat of chats) {
              await tgSend(chat, text, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            }
          }

          // Bump updated_at so we don't re-remind for another 30 min
          await supabaseAdmin
            .from("complaints")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", c.id);

          notified++;
        }

        return new Response(
          JSON.stringify({ ok: true, checked: complaints?.length || 0, notified }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () => new Response(
        JSON.stringify({ ok: true, hint: "POST to trigger complaint reminders" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    },
  },
});
