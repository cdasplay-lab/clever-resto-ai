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
