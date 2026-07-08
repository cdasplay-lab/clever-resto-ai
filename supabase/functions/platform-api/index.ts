// platform-api: REST endpoints for the user's external SaaS platform to manage menu, view orders,
// and configure webhook. Authenticated via X-API-Key header (hashed in api_keys table).
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { internalHeaders } from "../_shared/auth.ts";

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authRestaurant(req: Request) {
  const key = req.headers.get("x-api-key");
  if (!key) return null;
  const db = admin();
  const hash = await sha256(key);
  const { data } = await db
    .from("api_keys")
    .select("restaurant_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data) return null;
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash);
  return data.restaurant_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // routes are after /platform-api/...
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("platform-api");
  const route = parts.slice(idx + 1).join("/") || "";
  const db = admin();

  try {
    const restaurantId = await authRestaurant(req);
    if (!restaurantId) return json({ error: "unauthorized" }, 401);

    // GET menu
    if (req.method === "GET" && route === "menu") {
      const { data, error } = await db
        .from("menu_items")
        .select("id,name,description,category,price,is_available,image_url,options")
        .eq("restaurant_id", restaurantId);
      if (error) return json({ error: error.message }, 500);
      return json({ items: data });
    }

    // PUT menu (bulk replace)
    if (req.method === "PUT" && route === "menu") {
      const body = await req.json();
      if (!Array.isArray(body.items)) return json({ error: "items[] required" }, 400);
      await db.from("menu_items").delete().eq("restaurant_id", restaurantId);
      const rows = body.items.map((i: any) => ({
        restaurant_id: restaurantId,
        name: String(i.name),
        description: i.description ?? null,
        category: i.category ?? null,
        price: Number(i.price),
        is_available: i.is_available ?? true,
        image_url: i.image_url ?? null,
        options: i.options ?? [],
      }));
      const { error } = await db.from("menu_items").insert(rows);
      if (error) return json({ error: error.message }, 500);
      // fire embed
      const baseUrl = Deno.env.get("SUPABASE_URL");
      fetch(`${baseUrl}/functions/v1/menu-embed`, {
        method: "POST",
        headers: internalHeaders(),
        body: JSON.stringify({ restaurant_id: restaurantId }),
      }).catch(() => {});
      return json({ ok: true, count: rows.length });
    }

    // POST menu (single add)
    if (req.method === "POST" && route === "menu") {
      const i = await req.json();
      const { data, error } = await db
        .from("menu_items")
        .insert({
          restaurant_id: restaurantId,
          name: String(i.name),
          description: i.description ?? null,
          category: i.category ?? null,
          price: Number(i.price),
          is_available: i.is_available ?? true,
          image_url: i.image_url ?? null,
          options: i.options ?? [],
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      const baseUrl = Deno.env.get("SUPABASE_URL");
      fetch(`${baseUrl}/functions/v1/menu-embed`, {
        method: "POST",
        headers: internalHeaders(),
        body: JSON.stringify({ menu_item_id: data.id }),
      }).catch(() => {});
      return json({ item: data });
    }

    // GET orders
    if (req.method === "GET" && route === "orders") {
      const status = url.searchParams.get("status");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      let q = db.from("orders").select("*").eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status as any);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ orders: data });
    }

    // PATCH order status
    if (req.method === "PATCH" && route.startsWith("orders/")) {
      const id = route.split("/")[1];
      const body = await req.json();
      const { error } = await db.from("orders")
        .update({ status: body.status, external_order_id: body.external_order_id })
        .eq("id", id).eq("restaurant_id", restaurantId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // GET conversations
    if (req.method === "GET" && route === "conversations") {
      const { data, error } = await db.from("conversations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("last_message_at", { ascending: false }).limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ conversations: data });
    }

    // GET conversation messages
    if (req.method === "GET" && route.startsWith("conversations/")) {
      const id = route.split("/")[1];
      const { data: conv } = await db.from("conversations").select("id").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
      if (!conv) return json({ error: "not found" }, 404);
      const { data } = await db.from("messages").select("*").eq("conversation_id", id).order("created_at");
      return json({ messages: data });
    }

    return json({ error: "not found" }, 404);
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
