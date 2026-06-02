// social-reply: Phase 4 — generates short marketing replies for Instagram/Facebook
// story replies & comments. Separate from DM agent. Respects feature flags + quotas.
// Input:
//   {
//     restaurant_id: string,
//     platform: "instagram" | "facebook",
//     kind: "story_reply" | "comment" | "mention",
//     external_id: string,         // platform-side id (story_reply id, comment id...)
//     parent_id?: string,          // story/post id when relevant
//     customer_handle?: string,
//     customer_name?: string,
//     incoming_text?: string,
//     meta?: object
//   }
// Output: { ok, reply_text, interaction_id, status }
//
// This endpoint ONLY generates and persists the suggested reply.
// The actual send-to-Instagram/Facebook call happens via the platform
// integration layer (not yet wired). Owners can also see + edit replies
// from the dashboard.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

function buildSystemPrompt(restaurantName: string, tone: string, kind: string, platform: string) {
  const kindAr =
    kind === "story_reply" ? "رد على ستوري المطعم" :
    kind === "comment" ? "تعليق على منشور المطعم" :
    "إشارة (mention) للمطعم";
  return [
    `أنت ممثل تسويقي رسمي لمطعم "${restaurantName}" على ${platform}.`,
    `نبرتك: ${tone}.`,
    `الزبون أرسل: ${kindAr}.`,
    "",
    "قواعد الرد الصارمة:",
    "1) رد قصير جداً (سطر إلى سطرين كحد أقصى، ≤ 220 حرف).",
    "2) باللهجة العراقية الودودة.",
    "3) ممنوع الوعود بأسعار أو عروض غير مذكورة.",
    "4) لا تطلب رقم هاتف أو معلومات حساسة في العلن.",
    "5) إذا الزبون يريد يطلب → وجّهه للرسائل الخاصة (DM) لإكمال الطلب.",
    "6) لا تكتب emojis أكثر من 2.",
    "7) لا تستخدم # ولا روابط.",
    "أعد الرد فقط بدون أي شرح أو تنسيق إضافي.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const {
    restaurant_id,
    platform,
    kind,
    external_id,
    parent_id,
    customer_handle,
    customer_name,
    incoming_text,
    meta,
  } = body ?? {};

  if (!restaurant_id || !platform || !kind || !external_id) {
    return json({ error: "missing_required_fields" }, 400);
  }
  if (!["instagram", "facebook"].includes(platform)) return json({ error: "bad_platform" }, 400);
  if (!["story_reply", "comment", "mention"].includes(kind)) return json({ error: "bad_kind" }, 400);

  const db = admin();

  // Idempotency: dedupe by (restaurant_id, platform, external_id)
  const { data: existing } = await db
    .from("social_interactions")
    .select("id,status,reply_text")
    .eq("restaurant_id", restaurant_id)
    .eq("platform", platform)
    .eq("external_id", external_id)
    .maybeSingle();
  if (existing) {
    return json({ ok: true, deduped: true, interaction_id: existing.id, status: existing.status, reply_text: existing.reply_text });
  }

  // Load restaurant + flags
  const { data: restaurant, error: rErr } = await db
    .from("restaurants")
    .select("id,name,tone,feature_flags,is_active")
    .eq("id", restaurant_id)
    .maybeSingle();
  if (rErr || !restaurant) return json({ error: "restaurant_not_found" }, 404);
  if (!restaurant.is_active) return json({ error: "restaurant_inactive" }, 403);

  const flags = (restaurant.feature_flags && typeof restaurant.feature_flags === "object") ? restaurant.feature_flags as Record<string, any> : {};
  const flagKey = (kind === "story_reply") ? "story_replies_enabled" : "comment_replies_enabled";
  if (!flags[flagKey]) {
    // Log a skipped row so owner can see what we ignored
    const { data: ins } = await db.from("social_interactions").insert({
      restaurant_id, platform, kind, external_id, parent_id,
      customer_handle, customer_name, incoming_text,
      status: "skipped", error: `flag_off:${flagKey}`, meta: meta ?? {},
    }).select("id").maybeSingle();
    return json({ ok: true, skipped: flagKey, interaction_id: ins?.id });
  }

  // Quota gate (counts on ai_replies_used)
  const { data: quotaRes, error: qErr } = await db.rpc("consume_quota", {
    _restaurant_id: restaurant_id,
    _kind: "ai_reply",
    _ref: `social:${platform}:${external_id}`,
  });
  if (qErr || (quotaRes as any)?.allowed === false) {
    const reason = (quotaRes as any)?.reason ?? qErr?.message ?? "quota_blocked";
    const { data: ins } = await db.from("social_interactions").insert({
      restaurant_id, platform, kind, external_id, parent_id,
      customer_handle, customer_name, incoming_text,
      status: "skipped", error: reason, meta: meta ?? {},
    }).select("id").maybeSingle();
    return json({ ok: false, skipped: "quota", reason, interaction_id: ins?.id });
  }

  // Generate reply
  const sys = buildSystemPrompt(restaurant.name, restaurant.tone ?? "ودود ومحترف", kind, platform);
  const userPayload = incoming_text && incoming_text.trim().length > 0
    ? incoming_text.trim()
    : (kind === "story_reply" ? "[رد ستوري بدون نص]" : "[تفاعل بدون نص]");

  let replyText = "";
  let lastError: string | null = null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPayload },
        ],
        temperature: 0.7,
      }),
    });
    if (r.status === 429) lastError = "rate_limited";
    else if (r.status === 402) lastError = "payment_required";
    else if (!r.ok) lastError = `model_error_${r.status}`;
    else {
      const j = await r.json();
      replyText = (j?.choices?.[0]?.message?.content ?? "").toString().trim();
      // Hard cap (safety)
      if (replyText.length > 280) replyText = replyText.slice(0, 277) + "...";
    }
  } catch (e) {
    lastError = (e as Error).message;
  }

  const status = replyText ? "replied" : "failed";
  const { data: ins, error: iErr } = await db.from("social_interactions").insert({
    restaurant_id, platform, kind, external_id, parent_id,
    customer_handle, customer_name, incoming_text,
    reply_text: replyText || null,
    status,
    error: lastError,
    meta: meta ?? {},
  }).select("id").single();
  if (iErr) return json({ error: iErr.message }, 500);

  // Log to agent_logs for the bot health tab
  await db.from("agent_logs").insert({
    restaurant_id,
    kind: "run",
    payload: { source: "social-reply", platform, social_kind: kind, external_id, reply_preview: replyText.slice(0, 120) },
    model: MODEL,
    error: lastError,
  }).then(() => {}, () => {});

  return json({ ok: status === "replied", interaction_id: ins.id, status, reply_text: replyText, error: lastError });
});
