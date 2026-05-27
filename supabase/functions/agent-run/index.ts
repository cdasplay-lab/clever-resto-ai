// agent-run: core AI agent. Called by channel webhooks (telegram-webhook etc).
// Input: { conversation_id }
// It loads the conversation, builds messages, runs the LLM with tools in a loop,
// persists messages, and returns the final assistant text to send to the user.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { embedText } from "../_shared/embed.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = Deno.env.get("AGENT_MODEL") ?? "google/gemini-3-flash-preview";
const MAX_TOOL_ITERATIONS = 6;
const TOTAL_LOOP_TIMEOUT_MS = 25_000;
const PER_TOOL_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_TOOL_STEPS = 4; // bdoun nass mn al-model

// Promise timeout wrapper - safe utility, doesn't mutate anything
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

type CartItem = {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_price: number;
  notes?: string;
  selected_options?: { group: string; choice: string }[];
};

type Delivery = {
  address?: string;
  phone?: string;
  time?: string;
  area?: string;
};

// ---------- Tool definitions (sent to the model) ----------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_menu",
      description:
        "ابحث في منيو المطعم عن صنف يطلبه الزبون. أرجع لائحة بأقرب الأصناف. استخدمه دائماً قبل ما تضيف للسلة.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "نص بحث (اسم الصنف أو وصف)" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "أضف صنفاً للسلة باستخدام menu_item_id من نتائج search_menu. لا تخمن المعرف. إذا الصنف عنده options (مجموعات خيارات/إضافات) لازم تسأل الزبون أولاً ثم مرر selected_options.",
      parameters: {
        type: "object",
        properties: {
          menu_item_id: { type: "string" },
          qty: { type: "integer", minimum: 1 },
          notes: { type: "string" },
          selected_options: {
            type: "array",
            description: "اختيارات الزبون لمجموعات options. كل عنصر: { group, choice }.",
            items: {
              type: "object",
              properties: {
                group: { type: "string" },
                choice: { type: "string" },
              },
              required: ["group", "choice"],
              additionalProperties: false,
            },
          },
        },
        required: ["menu_item_id", "qty"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "احذف صنف من السلة عبر menu_item_id.",
      parameters: {
        type: "object",
        properties: { menu_item_id: { type: "string" } },
        required: ["menu_item_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart_summary",
      description: "أرجع السلة الحالية مع الإجمالي.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "set_delivery_info",
      description:
        "احفظ معلومات التوصيل بعد ما يأكدها الزبون. تحقق من العنوان والهاتف.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string" },
          phone: { type: "string" },
          time: { type: "string", description: "وقت التوصيل المطلوب (نص حر)" },
          area: { type: "string" },
        },
        required: ["address", "phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_order",
      description:
        "احفظ الطلب نهائياً بعد ما يأكد الزبون صراحة. لا تستخدمه قبل عرض الملخص وأخذ التأكيد.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "حوّل المحادثة لموظف بشري لما تكون غير متأكد أو الزبون يطلب ذلك.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_menu",
      description:
        "اعرض المنيو كاملاً (أو حسب صنف معين) للزبون مع الصور. استخدمه لما الزبون يطلب 'المنيو' أو 'شنو عندكم' أو يسأل عن أصناف فئة معينة. سيدز الصور مباشرة للزبون.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "اختياري: اسم فئة محددة (مثلاً: ساندويش، مشروبات)" },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

// Media to deliver via the channel (filled by show_menu tool)
type MediaItem = { photo_url: string; caption: string };

// ---------- System prompt builder ----------
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function openHoursStatus(open_hours: any): string {
  if (!open_hours || typeof open_hours !== "object" || !Object.keys(open_hours).length) {
    return "أوقات العمل: غير محددة (افترض مفتوح).";
  }
  // Iraq timezone (Asia/Baghdad, UTC+3, no DST)
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const dayKey = DAY_KEYS[now.getUTCDay()];
  const h = open_hours[dayKey];
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const lines = DAY_KEYS.map((k) => {
    const d = open_hours[k];
    if (!d) return `${k}: —`;
    return d.closed ? `${k}: مغلق` : `${k}: ${d.open}-${d.close}`;
  }).join(" | ");
  let status = "أوقات العمل غير محددة لهذا اليوم.";
  if (h) {
    if (h.closed) status = `المطعم اليوم مغلق. الوقت الحالي ${hhmm}.`;
    else if (hhmm >= h.open && hhmm <= h.close) status = `المطعم مفتوح الآن (${h.open}-${h.close}). الوقت ${hhmm}.`;
    else status = `المطعم مغلق الآن. دوام اليوم ${h.open}-${h.close}. الوقت ${hhmm}.`;
  }
  return `${status}\nجدول الأسبوع: ${lines}`;
}

function systemPrompt(restaurant: any, conv: any) {
  const cartLines =
    Array.isArray(conv.cart) && conv.cart.length
      ? conv.cart
          .map((i: CartItem) => `- ${i.qty} × ${i.name} (${i.unit_price} ${restaurant.currency})`)
          .join("\n")
      : "السلة فارغة";

  return `أنت موظف استقبال طلبات لمطعم "${restaurant.name}".
نبرة الرد: ${restaurant.tone}. اللغة: ${restaurant.language === "ar" ? "عربي عراقي بسيط" : restaurant.language}.

${openHoursStatus(restaurant.open_hours)}

قواعد صارمة:
1) لا تخترع أي صنف أو سعر. استخدم أداة search_menu دائماً قبل ما تضيف للسلة.
2) قبل ما تستدعي submit_order، اعرض ملخص الطلب (السلة + العنوان + الإجمالي) واطلب تأكيد صريح ("نعم" / "أكد").
3) لو الزبون طلب صنف غير موجود بالمنيو، اعتذر واقترح بدائل من نتائج search_menu.
4) الحد الأدنى للطلب: ${restaurant.min_order} ${restaurant.currency}.
5) لا تكلم الزبون بأي موضوع خارج طلبات المطعم.
6) لو ما فهمت أو الزبون متضايق، استخدم handoff_to_human.
7) ردودك قصيرة ومباشرة. سؤال واحد بكل رسالة.
8) إذا المطعم مغلق الآن، اعتذر بأدب واذكر وقت الافتتاح القادم. لا تأخذ طلب نهائي خارج أوقات العمل إلا إذا الزبون يطلب جدولته لوقت ضمن الدوام.

السلة الحالية:
${cartLines}

الحالة الحالية: ${conv.state}
معلومات التوصيل: ${JSON.stringify(conv.delivery || {})}`;
}

// ---------- Tool execution ----------
async function runTool(
  db: ReturnType<typeof admin>,
  conv: any,
  restaurant: any,
  name: string,
  args: any,
  media: MediaItem[],
): Promise<any> {
  if (name === "search_menu") {
    const q = String(args.query || "").trim();
    if (!q) return { error: "empty query" };
    let results: any[] = [];
    // Try embedding search first
    try {
      const vec = await embedText(q);
      const { data, error } = await db.rpc("search_menu_items", {
        p_restaurant_id: restaurant.id,
        p_query: vec,
        p_limit: 5,
      });
      if (!error && data && data.length) results = data;
    } catch (_) { /* fall through to text search */ }
    if (!results.length) {
      const { data } = await db
        .from("menu_items")
        .select("id,name,description,price,is_available,category")
        .eq("restaurant_id", restaurant.id)
        .eq("is_available", true)
        .ilike("name", `%${q}%`)
        .limit(5);
      results = data ?? [];
    }
    // Enrich with options
    if (results.length) {
      const ids = results.map((r: any) => r.id);
      const { data: opts } = await db.from("menu_items").select("id,options").in("id", ids);
      const map = new Map((opts || []).map((o: any) => [o.id, o.options]));
      results = results.map((r: any) => ({ ...r, options: map.get(r.id) || [] }));
    }
    return { results };
  }

  if (name === "add_to_cart") {
    const { data: item, error } = await db
      .from("menu_items")
      .select("id,name,price,is_available,options")
      .eq("id", args.menu_item_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (error || !item) return { error: "صنف غير موجود" };
    if (!item.is_available) return { error: "هذا الصنف غير متوفر حالياً" };

    // Validate required option groups
    const groups: any[] = Array.isArray(item.options) ? item.options : [];
    const selected: { group: string; choice: string }[] = Array.isArray(args.selected_options) ? args.selected_options : [];
    for (const g of groups) {
      if (g.required) {
        const has = selected.some((s) => s.group === g.name);
        if (!has) return { error: `لازم تختار من مجموعة "${g.name}" قبل الإضافة`, missing_group: g.name, choices: g.choices };
      }
    }
    // Compute price with deltas
    let unitPrice = Number(item.price);
    for (const s of selected) {
      const g = groups.find((x: any) => x.name === s.group);
      if (!g) return { error: `مجموعة غير معروفة: ${s.group}` };
      const c = (g.choices || []).find((x: any) => x.name === s.choice);
      if (!c) return { error: `خيار غير معروف: ${s.choice} في ${s.group}` };
      unitPrice += Number(c.price_delta || 0);
    }
    const cart: CartItem[] = Array.isArray(conv.cart) ? [...conv.cart] : [];
    // Treat items with different selected_options as distinct lines
    const sigOf = (sel?: { group: string; choice: string }[]) => (sel || []).map((s) => `${s.group}=${s.choice}`).sort().join("|");
    const sig = sigOf(selected);
    const idx = cart.findIndex((c) => c.menu_item_id === item.id && sigOf(c.selected_options) === sig);
    if (idx >= 0) cart[idx].qty += args.qty;
    else
      cart.push({
        menu_item_id: item.id,
        name: item.name,
        qty: args.qty,
        unit_price: unitPrice,
        notes: args.notes,
        selected_options: selected.length ? selected : undefined,
      });
    conv.cart = cart;
    await db.from("conversations").update({ cart, state: "collecting_items" }).eq("id", conv.id);
    return { ok: true, cart, total: cart.reduce((s, i) => s + i.qty * i.unit_price, 0) };
  }


  if (name === "remove_from_cart") {
    const cart: CartItem[] = (Array.isArray(conv.cart) ? conv.cart : []).filter(
      (c: CartItem) => c.menu_item_id !== args.menu_item_id,
    );
    conv.cart = cart;
    await db.from("conversations").update({ cart }).eq("id", conv.id);
    return { ok: true, cart };
  }

  if (name === "get_cart_summary") {
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    const total = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
    return { cart, total, currency: restaurant.currency, min_order: restaurant.min_order };
  }

  if (name === "set_delivery_info") {
    const delivery: Delivery = {
      address: args.address,
      phone: args.phone,
      time: args.time,
      area: args.area,
    };
    conv.delivery = delivery;
    await db
      .from("conversations")
      .update({ delivery, state: "confirm" })
      .eq("id", conv.id);
    return { ok: true, delivery };
  }

  if (name === "submit_order") {
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    if (!cart.length) return { error: "السلة فارغة" };
    const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
    if (subtotal < Number(restaurant.min_order || 0)) {
      return {
        error: `الحد الأدنى للطلب ${restaurant.min_order} ${restaurant.currency}`,
      };
    }
    const delivery = conv.delivery || {};
    if (!delivery.address || !delivery.phone) {
      return { error: "ناقص العنوان أو الهاتف" };
    }
    const { data: order, error } = await db
      .from("orders")
      .insert({
        restaurant_id: restaurant.id,
        conversation_id: conv.id,
        customer_name: conv.customer_name,
        customer_phone: delivery.phone,
        delivery_address: delivery.address,
        items: cart,
        subtotal,
        total: subtotal,
        status: "pending",
      })
      .select()
      .single();
    if (error) return { error: error.message };
    await db
      .from("conversations")
      .update({ state: "submitted", cart: [], delivery: {} })
      .eq("id", conv.id);

    // Fire-and-forget dispatch to platform webhook
    try {
      const baseUrl = Deno.env.get("SUPABASE_URL");
      fetch(`${baseUrl}/functions/v1/orders-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      }).catch(() => {});
    } catch (_) {}

    return { ok: true, order_id: order.id, total: subtotal };
  }

  if (name === "handoff_to_human") {
    await db
      .from("conversations")
      .update({ state: "handoff", meta: { ...(conv.meta || {}), handoff_reason: args.reason } })
      .eq("id", conv.id);
    return { ok: true };
  }

  if (name === "show_menu") {
    let q = db
      .from("menu_items")
      .select("id,name,description,price,category,image_url,is_available")
      .eq("restaurant_id", restaurant.id)
      .eq("is_available", true)
      .order("category", { nullsFirst: false })
      .order("name");
    if (args.category) q = q.ilike("category", `%${args.category}%`);
    const { data: items } = await q;
    const list = items ?? [];
    // Queue media for the channel
    for (const it of list) {
      if (it.image_url) {
        const caption = `${it.name}${it.category ? ` — ${it.category}` : ""}\n${it.price} ${restaurant.currency}${it.description ? `\n${it.description}` : ""}`;
        media.push({ photo_url: it.image_url, caption });
      }
    }
    return {
      ok: true,
      count: list.length,
      with_images: media.length,
      items: list.map((i) => ({ id: i.id, name: i.name, price: i.price, category: i.category })),
      note: media.length
        ? "تم تجهيز صور المنيو وستُرسل للزبون مع ردك. اكتفِ بجملة قصيرة مثل 'تفضل المنيو 👇' ولا تكرر الأسعار."
        : "لا توجد صور للأصناف. اعرض المنيو نصياً.",
    };
  }

  return { error: "unknown tool" };
}

async function callModel(messages: any[]) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("payment_required");
  if (!r.ok) throw new Error(`model error ${r.status}: ${await r.text()}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id required" }, 400);
    const db = admin();

    const { data: conv, error: e1 } = await db
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();
    if (e1 || !conv) return json({ error: "conversation not found" }, 404);

    // Human handoff: if owner paused the bot, don't run the LLM at all.
    if (conv.is_bot_paused) {
      return json({ reply: "", state: conv.state, media: [], skipped: "bot_paused" });
    }

    const { data: restaurant, error: e2 } = await db
      .from("restaurants")
      .select("*")
      .eq("id", conv.restaurant_id)
      .single();
    if (e2 || !restaurant) return json({ error: "restaurant not found" }, 404);

    // Load last 30 messages
    const { data: history } = await db
      .from("messages")
      .select("role,content,tool_calls,tool_call_id,name")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(30);

    const llmMessages: any[] = [
      { role: "system", content: systemPrompt(restaurant, conv) },
      ...(history || []).map((m) => {
        const base: any = { role: m.role, content: m.content };
        if (m.tool_calls) base.tool_calls = m.tool_calls;
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
        if (m.name) base.name = m.name;
        return base;
      }),
    ];

    const media: MediaItem[] = [];
    let finalText = "";
    const loopStartedAt = Date.now();
    // Guardrails: dedup identical consecutive tool calls + loop breaker
    const toolCallCache = new Map<string, any>(); // key: name+args -> last result
    let consecutiveToolSteps = 0;

    for (let step = 0; step < MAX_TOOL_ITERATIONS; step++) {
      if (Date.now() - loopStartedAt > TOTAL_LOOP_TIMEOUT_MS) {
        await db.from("agent_logs").insert({
          conversation_id, restaurant_id: restaurant.id, step,
          kind: "guardrail:total_timeout", payload: { ms: Date.now() - loopStartedAt },
        });
        finalText = finalText || "عذراً، صار تأخير. ممكن تعيد طلبك بشكل أبسط؟";
        break;
      }

      const resp = await callModel(llmMessages);
      const msg = resp.choices?.[0]?.message;
      if (!msg) break;

      // Persist assistant message
      await db.from("messages").insert({
        conversation_id,
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls ?? null,
      });
      llmMessages.push(msg);



      if (msg.tool_calls && msg.tool_calls.length) {
        consecutiveToolSteps++;
        // Loop breaker: too many tool steps without producing user-facing text
        if (consecutiveToolSteps > MAX_CONSECUTIVE_TOOL_STEPS) {
          await db.from("agent_logs").insert({
            conversation_id, restaurant_id: restaurant.id, step,
            kind: "guardrail:loop_break", payload: { consecutiveToolSteps },
          });
          finalText = "خلني أتأكد من شي وأرجعلك بعد لحظة 🙏";
          break;
        }

        for (const tc of msg.tool_calls) {
          const name = tc.function?.name;
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch (_) {}

          // Dedup: same tool + same args called again -> return cached result
          const cacheKey = `${name}:${JSON.stringify(args)}`;
          let result: any;
          let fromCache = false;
          if (toolCallCache.has(cacheKey)) {
            result = toolCallCache.get(cacheKey);
            fromCache = true;
            await db.from("agent_logs").insert({
              conversation_id, restaurant_id: restaurant.id, step,
              kind: `guardrail:dedup:${name}`, payload: { args },
            });
          } else {
            await db.from("agent_logs").insert({
              conversation_id, restaurant_id: restaurant.id, step,
              kind: `tool_call:${name}`, payload: { args },
            });
            try {
              result = await withTimeout(
                runTool(db, conv, restaurant, name, args, media),
                PER_TOOL_TIMEOUT_MS,
                name,
              );
            } catch (err: any) {
              result = { error: err?.message || "tool_failed" };
            }
            toolCallCache.set(cacheKey, result);
            await db.from("agent_logs").insert({
              conversation_id, restaurant_id: restaurant.id, step,
              kind: `tool_result:${name}`, payload: { ...result, _cached: fromCache },
            });
          }

          const toolMsg = {
            role: "tool",
            tool_call_id: tc.id,
            name,
            content: JSON.stringify(result),
          };
          await db.from("messages").insert({
            conversation_id,
            role: "tool",
            content: toolMsg.content,
            tool_call_id: tc.id,
            name,
          });
          llmMessages.push(toolMsg);
        }
        continue; // loop again so the model can see tool results
      }

      // Model produced a text reply -> reset counter and finish
      consecutiveToolSteps = 0;
      finalText = msg.content ?? "";
      break;
    }

    return json({ reply: finalText, state: conv.state, media });
  } catch (e: any) {
    const msg = e?.message || "error";
    if (msg === "rate_limited") return json({ error: "rate_limited" }, 429);
    if (msg === "payment_required") return json({ error: "payment_required" }, 402);
    console.error("agent-run error:", e);
    return json({ error: msg }, 500);
  }
});
