// extract-preferences: after a confirmed order, mine the recent conversation
// for stable customer preferences (dislikes/likes/allergies/diet) and merge
// them into customer_memory.auto_preferences (union, no overwrites).
//
// Fire-and-forget. Input: { conversation_id, order_id }

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash-lite";

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "record_customer_preferences",
    description: "Record stable preferences for this customer based on their messages and order.",
    parameters: {
      type: "object",
      properties: {
        dislikes: {
          type: "array",
          items: { type: "string" },
          description: "أصناف/مكونات الزبون لا يحبها بشكل ثابت (مثلاً: بصل، مايونيز، خيار). فقط ما تكرر أو ذكره صراحة.",
        },
        likes: {
          type: "array",
          items: { type: "string" },
          description: "تفضيلات ثابتة يحبها (مثلاً: حار، مشوي، إضافة جبن). فقط الواضحة.",
        },
        allergies: {
          type: "array",
          items: { type: "string" },
          description: "حساسيات مذكورة صراحة (مكسرات، غلوتين، ألبان…). لا تستنتج، فقط ما صرّح به.",
        },
        diet: {
          type: "string",
          enum: ["", "vegetarian", "vegan", "halal-strict", "none"],
          description: "نظام غذائي ثابت إن وُجد. فارغ إذا غير معروف.",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "ثقتك بأن هذه التفضيلات ثابتة وليست لمرة واحدة فقط.",
        },
      },
      required: ["dislikes", "likes", "allergies", "diet", "confidence"],
      additionalProperties: false,
    },
  },
};

function uniqMerge(a: any, b: any): string[] {
  const arr = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return Array.from(new Set(arr));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { conversation_id, order_id } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id required" }, 400);

    const db = admin();
    const { data: conv } = await db
      .from("conversations")
      .select("id, restaurant_id, channel, customer_handle")
      .eq("id", conversation_id)
      .single();
    if (!conv?.customer_handle) return json({ skipped: "no_customer_handle" });

    // Pull last 30 messages of the conversation
    const { data: msgs } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(30);
    const history = (msgs || []).slice().reverse()
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
      .map((m) => `${m.role === "user" ? "زبون" : m.role === "assistant" ? "بوت" : m.role}: ${m.content}`)
      .join("\n");

    let orderSummary = "";
    if (order_id) {
      const { data: ord } = await db
        .from("orders")
        .select("items, total")
        .eq("id", order_id)
        .maybeSingle();
      if (ord && Array.isArray(ord.items)) {
        orderSummary = ord.items.map((i: any) => `${i.qty || 1}×${i.name || ""}${i.notes ? ` (${i.notes})` : ""}`).join(" + ");
      }
    }

    const systemMsg = `أنت محلّل تفضيلات. مهمتك: من محادثة الزبون مع البوت والطلب الأخير، استخرج التفضيلات الثابتة فقط (المتكررة أو المذكورة صراحة كتفضيل دائم). لا تستنتج بناءً على طلب واحد عابر. إذا ما اكو دليل واضح، رجّع قوائم فارغة. استدعِ record_customer_preferences دائماً.`;
    const userMsg = `المحادثة:\n${history || "(فارغة)"}\n\nالطلب الأخير: ${orderSummary || "(لا يوجد)"}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "record_customer_preferences" } },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("extract-preferences AI error:", r.status, t);
      return json({ error: "ai_error", status: r.status }, 200);
    }
    const j = await r.json();
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ skipped: "no_tool_call" });
    let extracted: any = {};
    try { extracted = JSON.parse(call.function.arguments || "{}"); } catch { extracted = {}; }

    // Only persist if confidence high or medium
    if (extracted.confidence === "low") return json({ skipped: "low_confidence" });

    // Load existing memory row
    const { data: mem } = await db
      .from("customer_memory")
      .select("id, auto_preferences")
      .eq("restaurant_id", conv.restaurant_id)
      .eq("channel", conv.channel)
      .eq("customer_handle", conv.customer_handle)
      .maybeSingle();
    if (!mem?.id) return json({ skipped: "no_memory_row" });

    const prev = (mem.auto_preferences && typeof mem.auto_preferences === "object") ? mem.auto_preferences : {};
    const merged = {
      dislikes: uniqMerge(prev.dislikes, extracted.dislikes),
      likes: uniqMerge(prev.likes, extracted.likes),
      allergies: uniqMerge(prev.allergies, extracted.allergies),
      diet: extracted.diet && extracted.diet !== "none" && extracted.diet !== "" ? extracted.diet : (prev.diet || ""),
      updated_at: new Date().toISOString(),
    };

    await db.from("customer_memory").update({ auto_preferences: merged }).eq("id", mem.id);
    return json({ ok: true, merged });
  } catch (err: any) {
    console.error("extract-preferences error:", err);
    return json({ error: err?.message || "unknown" }, 200);
  }
});
