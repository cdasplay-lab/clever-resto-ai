/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram/sendMessage";

export const Route = createFileRoute("/api/public/check-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCron, cronUnauthorized } = await import("@/lib/cron-auth");
        if (!isAuthorizedCron(request)) return cronUnauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin.rpc as any)("run_monitoring_sweep");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: critical } = await (supabaseAdmin.from as any)("monitoring_alerts")
          .select("id,title,restaurant_id,last_seen_at")
          .eq("status", "open")
          .eq("severity", "critical")
          .gte("last_seen_at", new Date(Date.now() - 6 * 60_000).toISOString())
          .limit(20);
        const chatId = process.env.PLATFORM_ALERT_CHAT_ID;
        const lovableKey = process.env.LOVABLE_API_KEY;
        const telegramKey = process.env.TELEGRAM_API_KEY;
        if (critical?.length && chatId && lovableKey && telegramKey) {
          const lines = critical.map((a: any) => `• ${a.title} — ${a.restaurant_id ?? "المنصة"}`);
          await fetch(TELEGRAM_GATEWAY, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": telegramKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ chat_id: chatId, text: `🚨 تنبيهات حرجة\n${lines.join("\n")}` }),
          }).catch(() => undefined);
        }
        return Response.json(data ?? { ok: true });
      },
    },
  },
});
