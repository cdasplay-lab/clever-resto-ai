// marketing-send: Phase 5 — dispatches an APPROVED marketing campaign to its segment.
// Owner-triggered (sends Authorization Bearer of the logged-in owner).
// Idempotent: existing recipient rows are skipped.
//
// Input: { campaign_id: string }
// Output: { ok, recipients, sent, failed, skipped }
//
// Segment logic (reads public.customer_memory + public.conversations):
//   all        -> every memory row for the restaurant on that channel
//   vip        -> total_orders >= segment_params.min_orders (default 3)
//   recent     -> last_order_at >= now() - segment_params.days (default 14)
//   inactive   -> last_order_at <= now() - segment_params.days (default 30)
//   custom_handles -> segment_params.handles: string[]
//
// Templating: {{name}}, {{handle}} placeholders inside message_template.
// Telegram: looks up conversations.external_chat_id by (restaurant, channel, handle).

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY") ?? "";
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function tgSend(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_API_KEY) return { ok: false, error: "telegram_not_configured" };
  try {
    const r = await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!r.ok) return { ok: false, error: `telegram_${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Verify caller is the restaurant owner using their JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) return json({ error: "unauthorized" }, 401);
  const userId = userRes.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId: string | undefined = body?.campaign_id;
  if (!campaignId) return json({ error: "campaign_id required" }, 400);

  const db = admin();

  // Load campaign + verify ownership + status
  const { data: campaign, error: cErr } = await db
    .from("marketing_campaigns")
    .select("*, restaurants!inner(owner_id)")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr || !campaign) return json({ error: "campaign_not_found" }, 404);
  if ((campaign as any).restaurants.owner_id !== userId) return json({ error: "not_authorized" }, 403);
  if (campaign.status !== "approved") return json({ error: `bad_status:${campaign.status}` }, 400);

  // Lock to sending
  await db.from("marketing_campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  // ---- Resolve recipients via customer_memory ----
  const params = (campaign.segment_params ?? {}) as Record<string, any>;
  let q = db.from("customer_memory")
    .select("channel, customer_handle, customer_name, total_orders, last_order_at")
    .eq("restaurant_id", campaign.restaurant_id)
    .eq("channel", campaign.channel);

  if (campaign.segment === "vip") {
    q = q.gte("total_orders", Number(params.min_orders ?? 3));
  } else if (campaign.segment === "recent") {
    const days = Number(params.days ?? 14);
    q = q.gte("last_order_at", new Date(Date.now() - days * 86400000).toISOString());
  } else if (campaign.segment === "inactive") {
    const days = Number(params.days ?? 30);
    q = q.lte("last_order_at", new Date(Date.now() - days * 86400000).toISOString());
  } else if (campaign.segment === "custom_handles") {
    const handles: string[] = Array.isArray(params.handles) ? params.handles : [];
    if (handles.length === 0) {
      await db.from("marketing_campaigns").update({ status: "failed", stats: { error: "no_handles" } }).eq("id", campaignId);
      return json({ error: "no_handles" }, 400);
    }
    q = q.in("customer_handle", handles);
  }

  const { data: customers, error: mErr } = await q.limit(2000);
  if (mErr) {
    await db.from("marketing_campaigns").update({ status: "failed", stats: { error: mErr.message } }).eq("id", campaignId);
    return json({ error: mErr.message }, 500);
  }

  if (!customers || customers.length === 0) {
    await db.from("marketing_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString(), stats: { recipients: 0, sent: 0, failed: 0 } })
      .eq("id", campaignId);
    return json({ ok: true, recipients: 0, sent: 0, failed: 0 });
  }

  // Map handle -> external_chat_id (telegram needs chat id, not @handle)
  const handles = customers.map((c) => c.customer_handle);
  const { data: convs } = await db.from("conversations")
    .select("customer_handle, external_chat_id")
    .eq("restaurant_id", campaign.restaurant_id)
    .eq("channel", campaign.channel)
    .in("customer_handle", handles);
  const chatIdByHandle = new Map<string, string>();
  for (const c of convs ?? []) {
    if (c.customer_handle && c.external_chat_id) chatIdByHandle.set(c.customer_handle, c.external_chat_id);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const cust of customers) {
    const rendered = render(campaign.message_template, {
      name: cust.customer_name ?? cust.customer_handle ?? "",
      handle: cust.customer_handle ?? "",
    });
    const chatId = chatIdByHandle.get(cust.customer_handle);
    let status: "sent" | "failed" | "skipped" = "queued" as any;
    let error: string | null = null;

    if (!chatId) {
      status = "skipped"; error = "no_chat_id"; skipped++;
    } else if (campaign.channel === "telegram") {
      // Quota: count each outgoing marketing message as ai_reply
      const { data: q1 } = await db.rpc("consume_quota", {
        _restaurant_id: campaign.restaurant_id,
        _kind: "ai_reply",
        _ref: `mkt:${campaignId}:${cust.customer_handle}`,
      });
      if ((q1 as any)?.allowed === false) {
        status = "skipped"; error = `quota:${(q1 as any).reason}`; skipped++;
      } else {
        const res = await tgSend(chatId, rendered);
        if (res.ok) { status = "sent"; sent++; }
        else { status = "failed"; error = res.error ?? "send_error"; failed++; }
      }
    } else {
      status = "skipped"; error = `channel_not_supported:${campaign.channel}`; skipped++;
    }

    await db.from("campaign_recipients").upsert({
      campaign_id: campaignId,
      restaurant_id: campaign.restaurant_id,
      channel: campaign.channel,
      customer_handle: cust.customer_handle,
      customer_name: cust.customer_name,
      external_chat_id: chatId ?? null,
      rendered_message: rendered,
      status,
      error,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }, { onConflict: "campaign_id,channel,customer_handle" });
  }

  const stats = { recipients: customers.length, sent, failed, skipped };
  await db.from("marketing_campaigns")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      stats,
    })
    .eq("id", campaignId);

  await db.from("agent_logs").insert({
    restaurant_id: campaign.restaurant_id,
    kind: "run",
    payload: { source: "marketing-send", campaign_id: campaignId, ...stats },
  }).then(() => {}, () => {});

  return json({ ok: true, ...stats });
});
