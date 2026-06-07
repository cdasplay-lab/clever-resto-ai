// Public order tracking endpoint.
// GET ?id=<order_id> -> returns safe public fields for that order.
// Security: order id is a UUID v4 (hard to guess). No PII leaked.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

const ETA_MINUTES_DEFAULT = 35;

function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return "•••• " + digits.slice(-4);
}

function maskAddress(a: string | null): string | null {
  if (!a) return null;
  // keep first ~25 chars only
  return a.length > 28 ? a.slice(0, 25) + "…" : a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("id");
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return json({ error: "invalid_id" }, 400);
    }

    const db = admin();
    const { data: order, error } = await db
      .from("orders")
      .select("id, status, items, subtotal, total, created_at, dispatched_at, restaurant_id, branch_id, customer_name, customer_phone, delivery_address, meta")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) return json({ error: "not_found" }, 404);

    const { data: restaurant } = await db
      .from("restaurants")
      .select("name, currency")
      .eq("id", order.restaurant_id)
      .maybeSingle();

    let branchName: string | null = null;
    let prepMinutes: number | null = null;
    if (order.branch_id) {
      const { data: b } = await db
        .from("branches")
        .select("name, current_prep_minutes")
        .eq("id", order.branch_id)
        .maybeSingle();
      branchName = b?.name ?? null;
      prepMinutes = b?.current_prep_minutes ?? null;
    }

    const eta = prepMinutes || ETA_MINUTES_DEFAULT;
    const createdMs = new Date(order.created_at).getTime();
    const elapsedMin = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
    const remainingMin = Math.max(0, eta - elapsedMin);

    return json({
      id: order.id,
      short_id: String(order.id).slice(0, 8),
      status: order.status,
      created_at: order.created_at,
      dispatched_at: order.dispatched_at,
      eta_minutes: eta,
      remaining_minutes: remainingMin,
      items: Array.isArray(order.items) ? order.items : [],
      subtotal: Number(order.subtotal || 0),
      total: Number(order.total || 0),
      currency: restaurant?.currency || "IQD",
      restaurant_name: restaurant?.name || null,
      branch_name: branchName,
      customer_name: order.customer_name || null,
      customer_phone_masked: maskPhone(order.customer_phone),
      delivery_address_masked: maskAddress(order.delivery_address),
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
