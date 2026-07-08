// menu-extract: extract menu items from one or more images using Lovable AI (vision)
// then insert them into menu_items for the given restaurant.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { getCallerUserId, internalHeaders, ownsRestaurant } from "../_shared/auth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type ExtractedItem = {
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
};

async function extractFromImages(images: string[]): Promise<ExtractedItem[]> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `أنت مساعد متخصص بقراءة صور قوائم الطعام (المنيو) بدقة عالية.
مهمتك: استخراج كل صنف ظاهر بالصورة (اسم، وصف مختصر إن وجد، فئة/قسم، السعر).
قواعد:
- استخرج كل الأصناف بدون تكرار.
- السعر رقم فقط (بدون عملة). إذا غير واضح اعتبره 0.
- الفئة تكون اسم القسم العام بالمنيو (مثل: برغر، مشروبات، حلويات، وجبات...). إذا غير معروف اتركها null.
- لا تخترع أصناف غير ظاهرة بالصورة.
- استخدم نفس اللغة المكتوبة بالصورة (عربي/إنجليزي).`;

  const userContent: any[] = [
    { type: "text", text: "استخرج كل الأصناف من هذه الصور واستدعِ الأداة save_menu_items." },
  ];
  for (const img of images) {
    userContent.push({ type: "image_url", image_url: { url: img } });
  }

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "save_menu_items",
          description: "حفظ الأصناف المستخرجة من صورة المنيو",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string" },
                    price: { type: "number" },
                  },
                  required: ["name", "price"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "save_menu_items" } },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("تجاوزت الحد المسموح، حاول بعد قليل");
    if (resp.status === 402) throw new Error("نفدت الأرصدة، أضف رصيد لـ Lovable AI");
    throw new Error(`AI error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("لم يتمكن الذكاء من استخراج أي أصناف");
  const args = JSON.parse(call.function.arguments || "{}");
  return (args.items || []) as ExtractedItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { restaurant_id, images, dry_run } = await req.json();
    if (!restaurant_id) return json({ error: "restaurant_id required" }, 400);
    if (!Array.isArray(images) || images.length === 0) return json({ error: "images[] required" }, 400);

    // verify_jwt only proves the caller is *some* logged-in user — make sure
    // they actually own the restaurant they're inserting menu items into.
    const uid = await getCallerUserId(req);
    if (!uid) return json({ error: "unauthorized" }, 401);
    if (!(await ownsRestaurant(uid, restaurant_id))) return json({ error: "forbidden" }, 403);

    const items = await extractFromImages(images);
    if (items.length === 0) return json({ ok: true, inserted: 0, items: [] });

    if (dry_run) return json({ ok: true, items });

    const db = admin();
    const rows = items.map((i) => ({
      restaurant_id,
      name: String(i.name).trim(),
      description: i.description ? String(i.description).trim() : null,
      category: i.category ? String(i.category).trim() : null,
      price: Number(i.price) || 0,
      is_available: true,
    })).filter((r) => r.name);

    const { data: inserted, error } = await db.from("menu_items").insert(rows).select("id");
    if (error) return json({ error: error.message }, 500);

    // fire embeddings async
    const baseUrl = Deno.env.get("SUPABASE_URL");
    fetch(`${baseUrl}/functions/v1/menu-embed`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({ restaurant_id }),
    }).catch(() => {});

    return json({ ok: true, inserted: inserted?.length ?? 0, items });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
