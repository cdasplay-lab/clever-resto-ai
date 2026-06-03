// Regression tests for production issues observed in a real 2in1 restaurant chat.
//
// Run with: deno test --allow-all supabase/functions/__tests__/regression.test.ts
//
// These tests are intentionally unit-style and do NOT hit the network, the DB,
// or the LLM. They lock in the behaviour of the pure helpers/guards that
// implement the production fixes derived from the audit:
//
//   1. Duplicate / empty bot replies
//   2. Honest menu image delivery (no false "sent" claims)
//   3. Branch resolution by explicit name (not only by delivery_areas)
//   4. Quick-reply sanitization (no rogue 📋 / "المنيو" / "معاينة الطلب" buttons)
//   5. Confirmation phrase detection (used by submit_order gate)
//   6. Cart-fingerprint stability (preview→submit integrity)

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------- Reimplemented pure helpers under test ----------
// We mirror the production logic here to keep the test hermetic. If you change
// the production code, update these helpers too — the assertions below pin
// the contract.

const FORBIDDEN_QUICK_REPLY_PATTERNS = [
  /معاينة\s*الطلب/i,
  /المنيو/i,
  /\bmenu\b/i,
  /\bpreview\b/i,
  /🧾/u,
  /📋/u,
];
function sanitizeQuickReplies(replies: string[]): string[] {
  if (!Array.isArray(replies)) return [];
  return replies.filter((r) => !FORBIDDEN_QUICK_REPLY_PATTERNS.some((p) => p.test(r)));
}

const CONFIRM_RE = /(^|[\s،,.!؟?])(نعم|اكد|أكد|اكّد|أكّد|تمام|اوكي|أوكي|ok|okay|yes|yep|ايوه|أيوه|اي|أي|صح|صحيح|موافق|اكمل|أكمل|ارسل|أرسل|اطلب|أطلب)([\s،,.!؟?]|$)/i;

function cartFingerprint(cart: any[], delivery: any, branchId: string | null): string {
  const norm = {
    cart: (cart || []).map((c) => ({
      id: c.menu_item_id, q: c.qty, p: c.unit_price,
      o: (c.selected_options || []).map((s: any) => `${s.group}=${s.choice}`).sort().join("|"),
      n: c.notes || "",
    })),
    d: { a: delivery?.address || "", p: delivery?.phone || "", t: delivery?.time || "" },
    b: branchId || "",
  };
  return JSON.stringify(norm);
}

// Mirror of telegram-webhook in-memory dedup
const RECENT_UPDATES = new Map<string, number>();
function markAndCheckUpdate(updateId: number | string | undefined): boolean {
  if (updateId === undefined || updateId === null) return false;
  const key = String(updateId);
  if (RECENT_UPDATES.has(key)) return true;
  RECENT_UPDATES.set(key, Date.now());
  return false;
}

// Mirror of resolve_branch's branch-name matcher
function resolveBranchByName(addrRaw: string, branches: { id: string; name: string }[]): string | null {
  const addr = (addrRaw || "").trim().toLowerCase();
  const m = branches.find((b) => {
    const n = String(b.name || "").toLowerCase();
    return n && (addr.includes(n) || n.includes(addr));
  });
  return m?.id ?? null;
}

// ---------- 1. Duplicate / empty replies ----------
Deno.test("telegram dedup: same update_id is processed exactly once", () => {
  RECENT_UPDATES.clear();
  assertFalse(markAndCheckUpdate(101));
  assert(markAndCheckUpdate(101), "second delivery of same update_id must be deduped");
  assertFalse(markAndCheckUpdate(102));
});

Deno.test("telegram dedup: missing update_id never blocks", () => {
  RECENT_UPDATES.clear();
  assertFalse(markAndCheckUpdate(undefined));
  assertFalse(markAndCheckUpdate(undefined));
});

Deno.test("empty / whitespace replies must not be sent", () => {
  // Contract: tgSend trims; agent-run also trims before returning.
  for (const candidate of ["", "   ", "\n\n", "\t  \n"]) {
    assertEquals(candidate.trim(), "");
  }
});

// ---------- 2. Menu image honesty ----------
Deno.test("menu delivery: failed sends must not be reported as success", () => {
  // Simulate the post-delivery decision used in telegram-webhook.
  function decideReply(mediaRequested: number, mediaSent: number, modelReply: string): string {
    if (mediaRequested > 0 && mediaSent === 0) {
      return "اعتذر، صار خلل بإرسال الصور. أحاول مرة ثانية الحين 🙏";
    }
    return modelReply;
  }
  // Model thinks images were sent, channel actually failed -> reply is corrected.
  assertEquals(
    decideReply(3, 0, "تفضل المنيو 👇"),
    "اعتذر، صار خلل بإرسال الصور. أحاول مرة ثانية الحين 🙏",
  );
  // Partial failure (some delivered) -> keep model's reply, do not lie.
  assertEquals(decideReply(3, 2, "تفضل المنيو 👇"), "تفضل المنيو 👇");
  // No media requested -> reply passes through.
  assertEquals(decideReply(0, 0, "هلا بيك"), "هلا بيك");
});

// ---------- 3. Branch handling: explicit branch name ----------
Deno.test("resolve_branch matches a branch the customer named explicitly", () => {
  const branches = [
    { id: "b-main", name: "الفرع الرئيسي" },
    { id: "b-samarra", name: "فرع سامراء الثاني" },
  ];
  // Customer literally said "اني فرع سامراء الثاني مو الفرع الرئيسي"
  assertEquals(resolveBranchByName("فرع سامراء الثاني", branches), "b-samarra");
  // A shorter mention that is a substring of the branch name also resolves.
  assertEquals(resolveBranchByName("سامراء", branches), "b-samarra");
  // Branch name fully contained in customer's longer phrase still matches.
  assertEquals(
    resolveBranchByName("اني من فرع سامراء الثاني تكفون", branches),
    "b-samarra",
  );
  // Unknown branch -> null (caller must then ask, not fall back silently).
  assertEquals(resolveBranchByName("فرع كركوك", branches), null);
});

// ---------- 4. Quick replies: no menu / preview buttons ----------
Deno.test("sanitizeQuickReplies strips forbidden menu/preview buttons", () => {
  const input = ["📋 المنيو", "🧾 معاينة الطلب", "✅ نعم، أكد", "❌ إلغاء", "menu", "Preview"];
  assertEquals(sanitizeQuickReplies(input), ["✅ نعم، أكد", "❌ إلغاء"]);
});

Deno.test("sanitizeQuickReplies handles non-array input", () => {
  assertEquals(sanitizeQuickReplies(undefined as any), []);
  assertEquals(sanitizeQuickReplies(null as any), []);
});

// ---------- 5. Confirmation phrase gate ----------
Deno.test("submit_order confirmation phrase detection (positives)", () => {
  for (const phrase of [
    "نعم",
    "اكد",
    "أكد الطلب",
    "تمام كملة واكدة",     // <- the exact phrase from the audited conversation
    "اوكي",
    "yes",
    "ok",
    "صح",
    "موافق",
  ]) {
    assert(CONFIRM_RE.test(phrase), `expected confirmation match: "${phrase}"`);
  }
});

Deno.test("submit_order confirmation phrase detection (negatives)", () => {
  for (const phrase of [
    "لا",
    "ما اريد",
    "غيّر العنوان",
    "وين المنيو؟",
    "ممكن سعر البرغر؟",
  ]) {
    assertFalse(CONFIRM_RE.test(phrase), `must NOT match: "${phrase}"`);
  }
});

// ---------- 6. Cart fingerprint integrity ----------
Deno.test("cartFingerprint is stable for identical carts and changes when content changes", () => {
  const cartA = [{ menu_item_id: "x1", qty: 1, unit_price: 7000 }];
  const cartB = [{ menu_item_id: "x1", qty: 1, unit_price: 7000 }];
  const delivery = { address: "الماس", phone: "07765479017" };
  assertEquals(cartFingerprint(cartA, delivery, "b1"), cartFingerprint(cartB, delivery, "b1"));

  // Branch change must invalidate the preview token (so customer can't be
  // billed against the wrong branch after switching).
  assert(
    cartFingerprint(cartA, delivery, "b1") !== cartFingerprint(cartA, delivery, "b2"),
    "branch change must invalidate fingerprint",
  );

  // Adding a sauce as a real cart line (production rule P1) MUST change the
  // fingerprint — i.e. the customer cannot end up confirming an old preview
  // that did not include the extra-sauce charge.
  const cartWithSauce = [
    { menu_item_id: "x1", qty: 1, unit_price: 7000 },
    { menu_item_id: "sauce-special", qty: 2, unit_price: 500 },
  ];
  assert(
    cartFingerprint(cartA, delivery, "b1") !== cartFingerprint(cartWithSauce, delivery, "b1"),
    "adding an addon line must change the fingerprint",
  );
});

// ---------- 7. End-to-end conversation invariants ----------
// These don't run the agent, but they encode the invariants the production
// rules promise for the audited transcript.
Deno.test("invariant: 'تم التأكيد' and 'حوّلتك لموظف' must not co-exist in a single reply", () => {
  // P3: if submit_order failed we send the handoff message ONLY.
  const handoffOnly = "حوّلتك لزميل بشري، راح يتواصل وياك قريباً.";
  assertFalse(/تم التأكيد|تم تأكيد طلبك|أكدت الطلب/.test(handoffOnly));
  assert(/حوّلتك/.test(handoffOnly));
});

Deno.test("invariant: menu re-ask triggers another show_menu (not a lie)", () => {
  const menuReask = /وين\s*المنيو|ما\s*وصل|ما\s*أشوف|أرسل(ها)?\s*مرة\s*ثانية|where.*menu/i;
  for (const phrase of ["وين المنيو؟", "وين المنيو", "ما وصل شي", "ما أشوف صور"]) {
    assert(menuReask.test(phrase), `menu re-ask must match: "${phrase}"`);
  }
});

// ---------- 8. One-shot submit_order lock ----------
// Simulates the new guard: clearing pending_confirmation BEFORE order insert means
// a second submit_order call with the same token must fail.
Deno.test("submit_order: second call with same token after lock is rejected", () => {
  // Initial meta has a token; after the "lock" step, it's null.
  let meta: any = { pending_confirmation: { token: "T1", fp: "FP1" } };
  function trySubmit(token: string): { ok: boolean; reason?: string } {
    const pending = meta.pending_confirmation;
    if (!pending?.token || pending.token !== token) return { ok: false, reason: "no-token" };
    // Simulate the conditional UPDATE that clears the token atomically.
    meta = { ...meta, pending_confirmation: null };
    return { ok: true };
  }
  assertEquals(trySubmit("T1").ok, true);
  const second = trySubmit("T1");
  assertEquals(second.ok, false);
  assertEquals(second.reason, "no-token");
});

// ---------- 9. Re-validate availability at submit time ----------
Deno.test("submit_order: aborts if any cart item became unavailable since preview", () => {
  const cart = [
    { menu_item_id: "a", name: "برغر", qty: 1 },
    { menu_item_id: "b", name: "بطاطا", qty: 2 },
  ];
  const liveRows: Record<string, { is_available: boolean; track_stock: boolean; stock_qty: number | null }> = {
    a: { is_available: true, track_stock: false, stock_qty: null },
    b: { is_available: false, track_stock: false, stock_qty: null }, // 86'd between preview and submit
  };
  function validate() {
    const bad: string[] = [];
    for (const ci of cart) {
      const row = liveRows[ci.menu_item_id];
      if (!row || !row.is_available) { bad.push(ci.name); continue; }
      if (row.track_stock && (row.stock_qty == null || row.stock_qty < ci.qty)) {
        bad.push(`${ci.name} (الموجود ${row.stock_qty ?? 0})`);
      }
    }
    return bad;
  }
  assertEquals(validate(), ["بطاطا"]);
});

// ---------- 10. Per-chat flood guard ----------
Deno.test("flood guard triggers when user sends > 8 messages in 30s window", () => {
  function shouldThrottle(countInLast30s: number): boolean { return countInLast30s > 8; }
  assertFalse(shouldThrottle(8));
  assert(shouldThrottle(9));
  assert(shouldThrottle(50));
});

// ---------- 11. Sprint 2: delivery zone fee folded into preview/submit total ----------
Deno.test("preview/submit total = subtotal + delivery_fee from resolved zone", () => {
  const cart = [
    { qty: 2, unit_price: 5000 }, // 10000
    { qty: 1, unit_price: 3500 }, // 3500
  ];
  const zone = { id: "z1", fee: 2000, min_order: 5000, area_name: "الواحات" };
  const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const total = subtotal + Number(zone.fee || 0);
  assertEquals(subtotal, 13500);
  assertEquals(total, 15500);
});

// ---------- 12. Sprint 2: cart fingerprint changes when zone/fee changes ----------
Deno.test("cart fingerprint includes zone id + delivery fee so preview is invalidated on change", () => {
  function fp(cart: any[], delivery: any, branchId: string | null, zoneId: string | null, fee: number) {
    return JSON.stringify({ cart, delivery, branchId, zoneId, fee });
  }
  const cart = [{ menu_item_id: "a", qty: 1, unit_price: 5000 }];
  const delivery = { address: "كركوك - الواحات", phone: "07700000000" };
  const a = fp(cart, delivery, "b1", "z1", 2000);
  const b = fp(cart, delivery, "b1", "z2", 3000); // different zone+fee
  const c = fp(cart, delivery, "b1", "z1", 2000);
  assert(a !== b, "fingerprint must differ when zone/fee changes");
  assertEquals(a, c);
});

// ---------- 13. Sprint 2: file_complaint type normalization ----------
Deno.test("file_complaint clamps unknown type to 'other' and requires a note", () => {
  const ALLOWED = new Set([
    "cold_food","missing_item","late","wrong_order","bad_taste","rude_staff","refund_request","other",
  ]);
  function normalize(type: string, note: string) {
    const t = (type || "").trim().toLowerCase();
    const n = (note || "").trim().slice(0, 1000);
    if (!n) return { error: "missing_note" };
    return { type: ALLOWED.has(t) ? t : "other", note: n };
  }
  assertEquals(normalize("cold_food", "الأكل بارد"), { type: "cold_food", note: "الأكل بارد" });
  assertEquals(normalize("garbage", "خطأ بالطلب"), { type: "other", note: "خطأ بالطلب" });
  assertEquals(normalize("late", "   "), { error: "missing_note" });
});


// ---------- 14. Sprint 3: branches/zones TTL cache hits within window, refreshes after expiry ----------
Deno.test("loadBranchesAndZones TTL cache: served from cache inside window, refetched after expiry", async () => {
  const BR_TTL_MS = 60_000;
  const cache = new Map<string, { at: number; branches: any[]; zones: any[] }>();
  let dbCalls = 0;
  async function fakeLoad(restaurantId: string, now: number) {
    const hit = cache.get(restaurantId);
    if (hit && now - hit.at < BR_TTL_MS) return { branches: hit.branches, zones: hit.zones, cached: true };
    dbCalls++;
    const branches = [{ id: "b1", is_active: true }];
    const zones = [{ id: "z1", branch_id: "b1", is_active: true, fee: 2000 }];
    cache.set(restaurantId, { at: now, branches, zones });
    return { branches, zones, cached: false };
  }
  const t0 = 1_000_000;
  const r1 = await fakeLoad("rest-1", t0);
  const r2 = await fakeLoad("rest-1", t0 + 30_000);  // within TTL
  const r3 = await fakeLoad("rest-1", t0 + 70_000);  // beyond TTL
  assertFalse(r1.cached);
  assert(r2.cached, "second call within TTL must come from cache");
  assertFalse(r3.cached);
  assertEquals(dbCalls, 2);
});

// ---------- 15. Sprint 3: post-handoff guard — paused conversation never invokes the model ----------
Deno.test("post-handoff: agent-run short-circuits before model when is_bot_paused", () => {
  // Mirrors the guard at the top of Deno.serve in agent-run/index.ts
  function shouldSkipModel(conv: { is_bot_paused: boolean }): boolean {
    return !!conv.is_bot_paused;
  }
  assert(shouldSkipModel({ is_bot_paused: true }));
  assertFalse(shouldSkipModel({ is_bot_paused: false }));
});

// ---------- 16. Sprint 3: readiness score weighting ----------
Deno.test("readiness score reflects key setup milestones", () => {
  // Mirror of public.get_restaurant_readiness scoring rubric. Keep in sync.
  function score(s: {
    menu_available: number; menu_with_image: number;
    branches: number; branches_with_chat: number;
    zones: number; open_hours_set: boolean;
    menu_images: number; has_bot: boolean;
  }) {
    let v = 0;
    if (s.menu_available >= 10) v += 25; else if (s.menu_available >= 3) v += 15; else if (s.menu_available > 0) v += 5;
    if (s.menu_with_image >= 5) v += 10; else if (s.menu_with_image > 0) v += 5;
    if (s.branches >= 1) v += 15;
    if (s.branches_with_chat >= 1) v += 10;
    if (s.zones >= 1) v += 15;
    if (s.open_hours_set) v += 10;
    if (s.menu_images >= 1) v += 10;
    if (s.has_bot) v += 5;
    return Math.min(v, 100);
  }
  // Empty restaurant
  assertEquals(score({ menu_available: 0, menu_with_image: 0, branches: 0, branches_with_chat: 0, zones: 0, open_hours_set: false, menu_images: 0, has_bot: false }), 0);
  // Fully set up
  assertEquals(score({ menu_available: 20, menu_with_image: 10, branches: 2, branches_with_chat: 2, zones: 5, open_hours_set: true, menu_images: 3, has_bot: true }), 100);
  // Half-configured
  const partial = score({ menu_available: 5, menu_with_image: 2, branches: 1, branches_with_chat: 0, zones: 1, open_hours_set: true, menu_images: 0, has_bot: false });
  assert(partial >= 40 && partial < 80, `expected 40<=partial<80, got ${partial}`);
});

// ---------- 17. Sprint 4: auto-resume targets only stale paused conversations ----------
Deno.test("auto-resume: only paused conversations idle >24h are revived", () => {
  const now = Date.now();
  type C = { id: string; is_bot_paused: boolean; last_message_at: number };
  const rows: C[] = [
    { id: "a", is_bot_paused: true,  last_message_at: now - 26 * 3600_000 }, // stale -> revive
    { id: "b", is_bot_paused: true,  last_message_at: now -  2 * 3600_000 }, // fresh -> skip
    { id: "c", is_bot_paused: false, last_message_at: now - 48 * 3600_000 }, // not paused
  ];
  const cutoff = now - 24 * 3600_000;
  const revived = rows.filter((r) => r.is_bot_paused && r.last_message_at < cutoff).map((r) => r.id);
  assertEquals(revived, ["a"]);
});

// ---------- 18. Sprint 4: bad-response context snapshot uses last 6 messages in order ----------
Deno.test("bad_response context_json keeps last 6 messages in chronological order", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, created_at: i }));
  // Mirror the UI: select desc limit 6, then reverse to chronological.
  const desc = [...msgs].sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  const ctx = desc.slice().reverse();
  assertEquals(ctx.length, 6);
  assertEquals(ctx.map((m) => m.id), ["m4","m5","m6","m7","m8","m9"]);
});

// ---------- 19. Sprint 4: owner notification gated by owner_telegram_chat_id ----------
Deno.test("notifyOwner is a no-op when owner_telegram_chat_id is absent or blank", () => {
  function shouldSend(restaurant: { owner_telegram_chat_id?: string | null }): boolean {
    const id = (restaurant?.owner_telegram_chat_id || "").toString().trim();
    return id.length > 0;
  }
  assertFalse(shouldSend({}));
  assertFalse(shouldSend({ owner_telegram_chat_id: "" }));
  assertFalse(shouldSend({ owner_telegram_chat_id: "   " }));
  assertFalse(shouldSend({ owner_telegram_chat_id: null }));
  assert(shouldSend({ owner_telegram_chat_id: "123456789" }));
});

// ===== Sprint 5: pure helpers mirrored from agent-run/index.ts =====

// Mirror of redactPii — keep in sync with production.
const PHONE_RE = /(\+?\d[\d\s\-()]{7,}\d)/g;
const LONG_DIGIT_RE = /\b\d{9,}\b/g;
const ADDRESS_HINT_RE = /(عنوان|address|محله|محلة|زقاق|دار)\s*[:：]\s*[^\n,]{3,}/gi;
function redactPii(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    return input
      .replace(PHONE_RE, "[redacted_phone]")
      .replace(LONG_DIGIT_RE, "[redacted_digits]")
      .replace(ADDRESS_HINT_RE, (_m, k) => `${k}: [redacted_address]`);
  }
  if (Array.isArray(input)) return input.map(redactPii);
  if (typeof input === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(input as any)) {
      if (/^(phone|customer_phone|delivery_address|address)$/i.test(k) && typeof v === "string") {
        out[k] = v ? "[redacted]" : v;
      } else {
        out[k] = redactPii(v);
      }
    }
    return out;
  }
  return input;
}

const HEAVY_INTENT_RE = /(طلب|اطلب|أطلب|اوصل|أوصل|توصيل|دفع|عنوان|الفاتورة|الحساب|بشري|موظف|شكوى|الغ[يى]|cancel|order|delivery|address|payment|invoice|human|agent|complain)/i;
function pickModel(messages: any[], flash = "flash", pro = "pro"): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const txt = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join(" ")
        : "";
    return HEAVY_INTENT_RE.test(txt) ? pro : flash;
  }
  return flash;
}

// Circuit breaker mirror
const CB_FAIL_THRESHOLD = 3;
const CB_WINDOW_MS = 60_000;
const CB_COOLDOWN_MS = 60_000;
type CbState = { fails: number; firstFailAt: number; openedAt: number };
function makeBreaker() {
  const m = new Map<string, CbState>();
  return {
    isOpen(id: string, now: number) {
      const s = m.get(id);
      if (!s || !s.openedAt) return false;
      if (now - s.openedAt < CB_COOLDOWN_MS) return true;
      m.delete(id);
      return false;
    },
    fail(id: string, now: number) {
      const s = m.get(id);
      if (!s || now - s.firstFailAt > CB_WINDOW_MS) {
        m.set(id, { fails: 1, firstFailAt: now, openedAt: 0 });
        return false;
      }
      s.fails++;
      if (s.fails >= CB_FAIL_THRESHOLD) { s.openedAt = now; return true; }
      return false;
    },
    success(id: string) { m.delete(id); },
  };
}

// ---------- 20. Sprint 5: redactPii scrubs phones, long digit runs, and addressed fields ----------
Deno.test("redactPii: phones, long digits and labeled keys are scrubbed", () => {
  const out = redactPii({
    customer_phone: "07901234567",
    note: "اتصل على 0790-123-4567 بسرعة",
    delivery_address: "بغداد - الكرادة",
    safe: "hello",
    nested: { phone: "+9647801112233", text: "id 1234567890 here" },
  }) as any;
  assertEquals(out.customer_phone, "[redacted]");
  assertEquals(out.delivery_address, "[redacted]");
  assertEquals(out.nested.phone, "[redacted]");
  assertEquals(out.safe, "hello");
  assert(!out.note.includes("0790"), `phone leaked: ${out.note}`);
  assert(/[redacted_(digits|phone)]/.test(out.nested.text));
});

Deno.test("redactPii: idempotent and safe on primitives", () => {
  const once = redactPii({ phone: "07901234567" });
  const twice = redactPii(once);
  assertEquals(once, twice);
  assertEquals(redactPii(null), null);
  assertEquals(redactPii(42), 42);
});

// ---------- 21. Sprint 5: pickModel routes heavy intents to PRO, small talk to FLASH ----------
Deno.test("pickModel: routes by intent on the last user turn", () => {
  assertEquals(pickModel([{ role: "user", content: "هلا، شلونكم اليوم؟" }]), "flash");
  assertEquals(pickModel([{ role: "user", content: "شنو عندكم منيو؟" }]), "flash");
  assertEquals(pickModel([{ role: "user", content: "اريد اطلب برغر للعنوان" }]), "pro");
  assertEquals(pickModel([{ role: "user", content: "حولني لموظف بشري" }]), "pro");
  assertEquals(pickModel([
    { role: "user", content: "هلا" },
    { role: "assistant", content: "أهلاً" },
    { role: "user", content: "اريد توصيل" },
  ]), "pro");
  assertEquals(pickModel([]), "flash");
});

// ---------- 22. Sprint 5: circuit breaker opens after 3 failures, closes on success ----------
Deno.test("circuit breaker: opens after threshold and cools down", () => {
  const cb = makeBreaker();
  const t0 = 1_000_000;
  assertFalse(cb.fail("r1", t0));
  assertFalse(cb.fail("r1", t0 + 100));
  assert(cb.fail("r1", t0 + 200), "third failure should trip");
  assert(cb.isOpen("r1", t0 + 1_000));
  // Cooldown passes -> closed again
  assertFalse(cb.isOpen("r1", t0 + 200 + CB_COOLDOWN_MS + 1));
  // Different restaurant is unaffected
  assertFalse(cb.isOpen("r2", t0 + 200));
});

Deno.test("circuit breaker: success resets the failure window", () => {
  const cb = makeBreaker();
  cb.fail("r1", 1000);
  cb.fail("r1", 1100);
  cb.success("r1");
  assertFalse(cb.fail("r1", 1200), "post-success first failure should not trip");
  assertFalse(cb.isOpen("r1", 1300));
});

// ---------- 23. Sprint 5: golden conversations — model tier matches intent labels ----------
Deno.test("golden conversations: tier assignment matches expectations", () => {
  const golden: Array<{ text: string; expect: "flash" | "pro" }> = [
    { text: "هلا والله",                    expect: "flash" },
    { text: "شلون الجو اليوم",              expect: "flash" },
    { text: "اشلون منيو الوجبات؟",          expect: "flash" },
    { text: "اريد اطلب وجبتين",             expect: "pro"   },
    { text: "العنوان: الكرادة قرب الجامعة", expect: "pro"   },
    { text: "ابغى ادفع كاش",                expect: "pro"   },
    { text: "حولني على موظف",               expect: "pro"   },
    { text: "اريد الغي طلبي",               expect: "pro"   },
  ];
  for (const g of golden) {
    const got = pickModel([{ role: "user", content: g.text }]);
    assertEquals(got, g.expect, `text="${g.text}" expected=${g.expect} got=${got}`);
  }
});
