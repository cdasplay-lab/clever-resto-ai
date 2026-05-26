// menu-embed: generate embeddings for menu items (one or all of a restaurant)
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { embedText } from "../_shared/embed.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { menu_item_id, restaurant_id } = await req.json();
    const db = admin();
    const q = db.from("menu_items").select("id,name,description,category");
    if (menu_item_id) q.eq("id", menu_item_id);
    else if (restaurant_id) q.eq("restaurant_id", restaurant_id);
    else return json({ error: "menu_item_id or restaurant_id required" }, 400);
    const { data: items, error } = await q;
    if (error) return json({ error: error.message }, 500);

    let n = 0;
    for (const item of items ?? []) {
      const text = [item.name, item.category, item.description].filter(Boolean).join(" — ");
      try {
        const vec = await embedText(text);
        // pgvector accepts arrays via string format
        await db.from("menu_items").update({ embedding: vec as any }).eq("id", item.id);
        n++;
      } catch (e) {
        console.error("embed failed for", item.id, e);
      }
    }
    return json({ ok: true, embedded: n });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
