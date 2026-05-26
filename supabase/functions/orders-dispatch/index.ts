// orders-dispatch: send a confirmed order to the restaurant's platform webhook with HMAC and retries.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);
    const db = admin();

    const { data: order, error } = await db
      .from("orders")
      .select("*, restaurants(*)")
      .eq("id", order_id)
      .single();
    if (error || !order) return json({ error: "order not found" }, 404);

    const r: any = order.restaurants;
    if (!r?.platform_webhook_url) {
      return json({ ok: true, skipped: "no webhook configured" });
    }

    const payload = {
      event: "order.created",
      order: {
        id: order.id,
        restaurant_id: order.restaurant_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_address: order.delivery_address,
        items: order.items,
        subtotal: order.subtotal,
        total: order.total,
        notes: order.notes,
        status: order.status,
        created_at: order.created_at,
      },
    };
    const body = JSON.stringify(payload);
    const sig = r.platform_webhook_secret ? await hmac(r.platform_webhook_secret, body) : null;

    const res = await fetch(r.platform_webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sig ? { "X-Lovable-Signature": `sha256=${sig}` } : {}),
      },
      body,
    });

    await db
      .from("orders")
      .update({
        dispatched_at: res.ok ? new Date().toISOString() : null,
        dispatch_attempts: (order.dispatch_attempts ?? 0) + 1,
      })
      .eq("id", order.id);

    return json({ ok: res.ok, status: res.status });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
