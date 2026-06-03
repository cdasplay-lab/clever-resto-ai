// scheduled-dispatch: cron-driven. Promotes scheduled orders due within 30 min
// to "pending", decrements stock, then fires orders-dispatch for each.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const db = admin();
    const cutoff = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: orders, error } = await db
      .from("orders")
      .select("id,restaurant_id,items,scheduled_for")
      .eq("status", "scheduled")
      .lte("scheduled_for", cutoff)
      .limit(50);
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const o of orders ?? []) {
      // Decrement stock for any tracked items (best effort)
      try {
        const stockItems = (Array.isArray(o.items) ? o.items : []).map((c: any) => ({
          menu_item_id: c.menu_item_id, qty: c.qty,
        }));
        if (stockItems.length) await db.rpc("decrement_stock", { _items: stockItems });
      } catch (_) { /* don't block dispatch */ }

      // Promote to pending so the kitchen flow treats it normally
      await db.from("orders").update({ status: "pending" }).eq("id", o.id);

      // Fire dispatch (fire-and-forget)
      try {
        const baseUrl = Deno.env.get("SUPABASE_URL");
        fetch(`${baseUrl}/functions/v1/orders-dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: o.id }),
        }).catch(() => {});
      } catch (_) {}

      results.push({ id: o.id, scheduled_for: o.scheduled_for });
    }
    // Auto-resume paused bots that have been idle for >24h with no staff reply.
    // Defensive: only the paused-state flag is touched; no message is sent here.
    let resumed = 0;
    try {
      const cutoffResume = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: revived, error: rErr } = await db
        .from("conversations")
        .update({ is_bot_paused: false })
        .eq("is_bot_paused", true)
        .lt("last_message_at", cutoffResume)
        .select("id");
      if (!rErr && revived) resumed = revived.length;
    } catch (_) { /* never block dispatch */ }

    return json({ ok: true, dispatched: results.length, orders: results, auto_resumed: resumed });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
