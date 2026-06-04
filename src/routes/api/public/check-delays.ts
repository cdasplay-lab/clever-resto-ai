// Public cron endpoint: scans active orders past their ETA + 15 min,
// notifies the customer via Telegram, and alerts the branch/owner.
// Called by pg_cron every 5 minutes via net.http_post.
import { createFileRoute } from "@tanstack/react-router";

const DELAY_THRESHOLD_MIN = 15;
const ACTIVE_STATUSES = ["confirmed", "preparing", "out_for_delivery"];
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function tgSend(
  chatId: string,
  text: string,
  lovableKey: string,
  telegramKey: string,
) {
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

export const Route = createFileRoute("/api/public/check-delays")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY || "";
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY || "";

        // Fetch recent active orders (last 6h) to keep the scan cheap
        const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id,status,restaurant_id,conversation_id,branch_id,meta,created_at,customer_name")
          .in("status", ACTIVE_STATUSES)
          .gte("created_at", sinceIso)
          .limit(200);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{ id: string; notified: boolean }> = [];
        for (const o of orders || []) {
          const meta = (o.meta as any) || {};
          if (meta.delay_notified) continue;
          const etaTotal = Number(meta.eta_minutes) || 45;
          const confirmedAt = meta.confirmed_at || o.created_at;
          const elapsedMin = Math.floor(
            (Date.now() - new Date(confirmedAt).getTime()) / 60000,
          );
          const overdueMin = elapsedMin - etaTotal;
          if (overdueMin < DELAY_THRESHOLD_MIN) continue;

          const shortId = String(o.id).slice(0, 8);
          const newEta = Math.max(10, Math.ceil(overdueMin / 5) * 5);

          // Notify the customer (via their conversation channel)
          if (o.conversation_id && LOVABLE_API_KEY && TELEGRAM_API_KEY) {
            const { data: conv } = await supabaseAdmin
              .from("conversations")
              .select("channel,external_chat_id")
              .eq("id", o.conversation_id)
              .maybeSingle();
            if (conv?.channel === "telegram" && conv.external_chat_id) {
              await tgSend(
                conv.external_chat_id,
                `🙏 نعتذر، طلبك #${shortId} يحتاج وقت إضافي.\nراح يوصلك خلال ~${newEta} دقيقة. شكراً على صبرك 🌹`,
                LOVABLE_API_KEY,
                TELEGRAM_API_KEY,
              );
            }
          }

          // Notify branch (or owner as fallback)
          if (LOVABLE_API_KEY && TELEGRAM_API_KEY) {
            let notifyChat: string | null = null;
            if (o.branch_id) {
              const { data: b } = await supabaseAdmin
                .from("branches")
                .select("telegram_chat_id")
                .eq("id", o.branch_id)
                .maybeSingle();
              notifyChat = b?.telegram_chat_id || null;
            }
            if (!notifyChat) {
              const { data: r } = await supabaseAdmin
                .from("restaurants")
                .select("owner_telegram_chat_id")
                .eq("id", o.restaurant_id)
                .maybeSingle();
              notifyChat = r?.owner_telegram_chat_id || null;
            }
            if (notifyChat) {
              await tgSend(
                notifyChat,
                `⚠️ تأخير طلب #${shortId}\nالزبون: ${o.customer_name || "—"}\nالحالة: ${o.status}\nمضى ${elapsedMin} دقيقة (ETA كان ${etaTotal} دقيقة).`,
                LOVABLE_API_KEY,
                TELEGRAM_API_KEY,
              );
            }
          }

          // Mark notified so we don't spam
          await supabaseAdmin
            .from("orders")
            .update({
              meta: {
                ...meta,
                delay_notified: true,
                delay_notified_at: new Date().toISOString(),
                is_delayed: true,
              },
            })
            .eq("id", o.id);

          results.push({ id: o.id, notified: true });
        }

        return new Response(
          JSON.stringify({ ok: true, checked: orders?.length || 0, notified: results.length }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () => {
        // Allow GET for manual testing
        return new Response(
          JSON.stringify({ ok: true, hint: "POST to trigger delay check" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
