// agent-run: core AI agent. Called by channel webhooks (telegram-webhook etc).
// Input: { conversation_id }
// It loads the conversation, builds messages, runs the LLM with tools in a loop,
// persists messages, and returns the final assistant text to send to the user.

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { embedText } from "../_shared/embed.ts";
import { retryFetch } from "../_shared/retry.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = Deno.env.get("AGENT_MODEL") ?? "google/gemini-3-flash-preview";
const FALLBACK_MODEL = Deno.env.get("AGENT_FALLBACK_MODEL") ?? "google/gemini-2.5-flash";
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

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

const CONFIRM_RE = /(^|[\s،,.!؟?])(نعم|اكد|أكد|اكّد|أكّد|تمام|اوكي|أوكي|ok|okay|yes|yep|ايوه|أيوه|اي|أي|صح|صحيح|موافق|اكمل|أكمل|ارسل|أرسل|اطلب|أطلب)([\s،,.!؟?]|$)/i;

// Arabic text normalizer: strips diacritics, unifies alef/ya/ta, collapses repeats.
// Mirrors public.normalize_ar() in SQL for consistent matching client/edge side.
function normalizeArabic(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // Remove diacritics (tashkeel)
  s = s.replace(/[\u064B-\u0652\u0670]/g, "");
  // Unify alef variants
  s = s.replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627");
  // Alef maksura -> ya
  s = s.replace(/\u0649/g, "\u064A");
  // Ta marbuta -> ha
  s = s.replace(/\u0629/g, "\u0647");
  // Remove tatweel
  s = s.replace(/\u0640/g, "");
  // Collapse 3+ repeats of any char to 2
  s = s.replace(/(.)\1{2,}/g, "$1$1");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
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
        "احفظ معلومات التوصيل بعد ما يأكدها الزبون. لازم تتضمن اسم الزبون + العنوان + الهاتف.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "اسم الزبون كما ذكره (مطلوب)" },
          address: { type: "string" },
          phone: { type: "string" },
          time: { type: "string", description: "وقت التوصيل المطلوب (نص حر)" },
          area: { type: "string" },
        },
        required: ["customer_name", "address", "phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_order",
      description:
        "اعرض ملخّص الطلب النهائي على الزبون قبل الإرسال (الأصناف + الفرع + العنوان + الهاتف + الإجمالي). يرجع لك confirmation_token ونص ملخّص جاهز. لازم تستخدمه قبل submit_order. اعرض الملخّص للزبون واسأله بصراحة: 'أأكد الطلب؟ (نعم/لا)'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_order",
      description:
        "أرسل الطلب نهائياً للنظام. ممنوع استدعاؤه إلا بعد: (1) preview_order، و(2) موافقة صريحة من الزبون بكلمة مثل 'نعم/أكد/تمام/أوكي'. مرّر confirmation_token اللي رجع من preview_order ونص موافقة الزبون كما كتبها في user_confirmation_text.",
      parameters: {
        type: "object",
        properties: {
          confirmation_token: { type: "string", description: "التوكن اللي رجع من preview_order" },
          user_confirmation_text: { type: "string", description: "نص موافقة الزبون الحرفي (مثلاً: نعم، أكد، تمام)" },
        },
        required: ["confirmation_token", "user_confirmation_text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_order",
      description:
        "احجز الطلب لوقت لاحق (مو الآن). نفس شروط submit_order: لازم preview_order أولاً + موافقة صريحة من الزبون + scheduled_for بصيغة ISO 8601 (مع المنطقة الزمنية). الطلب يُخزن بحالة scheduled ويُرسل للفرع تلقائياً قبل نصف ساعة من الموعد. لا ينقص المخزون الآن.",
      parameters: {
        type: "object",
        properties: {
          confirmation_token: { type: "string", description: "التوكن اللي رجع من preview_order" },
          user_confirmation_text: { type: "string", description: "نص موافقة الزبون الحرفي" },
          scheduled_for: { type: "string", description: "موعد الطلب بصيغة ISO 8601 (مثلاً 2026-06-02T19:00:00+03:00 لبغداد). لازم يكون بعد 15 دقيقة على الأقل من الآن وضمن أسبوعين." },
          scheduled_for_human: { type: "string", description: "تمثيل بشري للموعد كما تفهمه (مثلاً: اليوم الساعة 7 مساءً، بكرة الظهر)" },
        },
        required: ["confirmation_token", "user_confirmation_text", "scheduled_for", "scheduled_for_human"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_order",
      description:
        "ألغِ آخر طلب للزبون. يشتغل فقط لو الطلب لسه بحالة pending (ما تأكد من الفرع) أو scheduled (مجدول لوقت لاحق). يرجّع المخزون ويخبر الفرع تلقائياً. ممنوع استدعاؤه لطلبات confirmed/preparing/out_for_delivery — بهاي الحالة استخدم handoff_to_human.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "سبب الإلغاء كما ذكره الزبون (اختياري)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_order",
      description:
        "عدّل آخر طلب للزبون: يلغي الطلب الحالي ويرجّع أصنافه للسلة عشان الزبون يقدر يضيف/يحذف/يغيّر. بعدها لازم تعيد preview_order ثم submit_order/schedule_order حسب الحالة. يشتغل فقط لو الطلب pending/scheduled. للطلبات اللي تأكدت من الفرع استخدم handoff_to_human.",
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
  {
    type: "function",
    function: {
      name: "resolve_branch",
      description:
        "حدد أنسب فرع للزبون بناءً على عنوانه أو منطقته. استدعِ هذه الأداة قبل set_delivery_info لما المطعم يكون عنده أكثر من فرع. ترجع الفرع المختار + أوقاته + الحد الأدنى.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "العنوان أو اسم المنطقة اللي قاله الزبون" },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_last",
      description:
        "أعد إضافة آخر طلب للزبون كاملاً إلى السلة. استخدمها لما الزبون يقول 'نفس آخر طلب'، 'زي المرة الماضية'، 'كرر الطلب السابق'، أو 'مثل طلبتي الأخيرة'. تتحقق تلقائياً من توفر الأصناف الحالي وتتخطى أي صنف غير متوفر. بعدها استدعِ preview_order مباشرة.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },

  {
    type: "function",
    function: {
      name: "show_combos",
      description:
        "اعرض الكومبوهات (الوجبات المجمّعة بسعر خاص). استخدمها لما الزبون يسأل عن العروض أو الكومبوهات، أو لما تحب تقترح عرض أوفر. الصور تُرسل تلقائياً للزبون.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "add_combo_to_cart",
      description:
        "أضف كومبو كامل للسلة بسعر الكومبو (مو مجموع الأصناف). مرّر combo_id من نتائج show_combos.",
      parameters: {
        type: "object",
        properties: {
          combo_id: { type: "string" },
          qty: { type: "integer", minimum: 1, default: 1 },
        },
        required: ["combo_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_upsell",
      description:
        "اقترح صنف مكمّل للسلة بشكل ذكي (مثلاً مشروب مع البرغر). استدعها مرة واحدة فقط بعد add_to_cart لصنف رئيسي. ترجع 2-3 اقتراحات لطيفة.",
      parameters: {
        type: "object",
        properties: {
          for_menu_item_id: { type: "string", description: "معرّف الصنف اللي توّه أُضيف للسلة" },
        },
        required: ["for_menu_item_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_complaint",
      description:
        "افتح شكوى رسمية لما الزبون يشتكي من جودة/تأخير/نقص/خطأ بالطلب أو سوء معاملة. الأداة توقف البوت تلقائياً، تنبّه المدير والفرع، وترد على الزبون. استخدمها فوراً ولا تعد بأي تعويض من جهتك.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["late", "cold", "missing", "wrong", "quality", "rude", "other"],
            description: "نوع الشكوى",
          },
          note: { type: "string", description: "تلخيص قصير جداً لما قاله الزبون" },
        },
        required: ["type", "note"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_restaurant_location",
      description: "أرسل موقع المطعم (أو الفرع المختار إذا تم تحديده) للزبون كنقطة جغرافية حقيقية. استخدمها لما يسأل الزبون 'وين موقعكم'، 'دزلي اللوكيشن'، 'فين المطعم'، أو يطلب يجي بنفسه (pickup).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "request_customer_location",
      description: "اطلب من الزبون يشارك موقعه الجغرافي. استخدمها لما تحتاج عنوان التوصيل ولم يعطه الزبون أو لما يصعب وصفه نصياً. على Telegram يظهر للزبون زر مباشر لمشاركة موقعه.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
] as const;

// ---------- Complaint keyword detection ----------
const COMPLAINT_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /(تأخ?ر|متأخ?ر|ما\s*وصل|ما\s*جاني|late|never\s*arrived|delay)/i, type: "late" },
  { re: /(بارد|cold)/i, type: "cold" },
  { re: /(ناقص|نسيتو[ام]?|missing|forgot)/i, type: "missing" },
  { re: /(غلط|غير\s*صحيح|خطأ|wrong\s*order)/i, type: "wrong" },
  { re: /(سيء|سيئ|قذر|عفن|منته[يى]|حشرة|spoiled|disgusting|rotten|bug)/i, type: "quality" },
  { re: /(مهين|قليل\s*أدب|rude|insult)/i, type: "rude" },
  { re: /(شكوى|أشتكي|اشتكي|راح\s*أبلّ?غ|راح\s*ابلغ|نصب|مسروق|complaint|complain|refund|scam)/i, type: "other" },
];

function detectComplaint(text: string): string | null {
  if (!text || text.length < 3) return null;
  for (const p of COMPLAINT_PATTERNS) if (p.re.test(text)) return p.type;
  return null;
}

const COMPLAINT_TYPE_AR: Record<string, string> = {
  late: "تأخير", cold: "طعام بارد", missing: "صنف ناقص",
  wrong: "طلب غلط", quality: "جودة سيئة", rude: "سوء معاملة", other: "شكوى عامة",
};

async function escalateComplaint(
  db: ReturnType<typeof admin>,
  conv: any,
  restaurant: any,
  type: string,
  note: string,
): Promise<{ ok: true; complaint_id: string }> {
  const typeAr = COMPLAINT_TYPE_AR[type] || "شكوى";

  // Find last order if any
  const { data: lastOrder } = await db
    .from("orders")
    .select("id,total,status,branch_id")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Insert complaint
  const { data: comp } = await db
    .from("complaints")
    .insert({
      restaurant_id: restaurant.id,
      conversation_id: conv.id,
      order_id: lastOrder?.id ?? null,
      type,
      note: note || typeAr,
      status: "open",
      channel: conv.channel,
      customer_name: conv.customer_name,
      customer_handle: conv.customer_handle,
    })
    .select("id")
    .single();

  // Pause bot + flag handoff
  await db.from("conversations").update({
    is_bot_paused: true,
    state: "handoff",
    meta: {
      ...(conv.meta || {}),
      handoff_reason: `complaint:${type}`,
      handoff_at: new Date().toISOString(),
      complaint_id: comp?.id,
    },
  }).eq("id", conv.id);

  // Telegram notify owner + branch
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (LOVABLE_API_KEY && TELEGRAM_API_KEY) {
      const branches: any[] = (restaurant.__branches || []).filter((b: any) => b.is_active && b.telegram_chat_id);
      const branchChat = lastOrder?.branch_id
        ? branches.find((b: any) => b.id === lastOrder.branch_id)?.telegram_chat_id
        : null;
      const chats = new Set<string>();
      if (restaurant.owner_telegram_chat_id) chats.add(restaurant.owner_telegram_chat_id);
      if (branchChat) chats.add(branchChat);
      else branches.forEach((b: any) => chats.add(b.telegram_chat_id));

      const who = conv.customer_name || conv.customer_handle || "زبون";
      const orderLine = lastOrder
        ? `\nالطلب: #${String(lastOrder.id).slice(0, 8)} — ${lastOrder.total} ${restaurant.currency} (${lastOrder.status})`
        : "";
      const text = `🚨 شكوى جديدة — ${restaurant.name}\nالزبون: ${who} (${conv.channel} ${conv.customer_handle || ""})\nالنوع: ${typeAr}${orderLine}\nالنص: "${note || "—"}"\n— البوت متوقّف. افتحها من لوحة التحكم > الشكاوى.`;

      await Promise.all(Array.from(chats).map((chat) =>
        fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TELEGRAM_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chat_id: chat, text }),
        }).catch(() => {}),
      ));
    }
  } catch (_) { /* never block */ }

  return { ok: true, complaint_id: comp?.id || "" };
}


// Media to deliver via the channel (filled by show_menu tool)
type MediaItem = { photo_url: string; caption: string };

// ---------- System prompt builder ----------
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_AR: Record<string, string> = {
  sun: "الأحد", mon: "الإثنين", tue: "الثلاثاء", wed: "الأربعاء",
  thu: "الخميس", fri: "الجمعة", sat: "السبت",
};
const MONTH_AR = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];

function baghdadNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

function nowContextLine(): string {
  const now = baghdadNow();
  const day = DAY_AR[DAY_KEYS[now.getUTCDay()]];
  const date = `${day} ${now.getUTCDate()} ${MONTH_AR[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  return `الوقت الحالي: ${hhmm} (بتوقيت بغداد +03:00) — ${date}`;
}

function minsBetween(fromHHMM: string, toHHMM: string): number {
  const [fh, fm] = fromHHMM.split(":").map(Number);
  const [th, tm] = toHHMM.split(":").map(Number);
  return (th * 60 + tm) - (fh * 60 + fm);
}
function fmtDur(mins: number): string {
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
}

function openHoursStatus(open_hours: any): string {
  if (!open_hours || typeof open_hours !== "object" || !Object.keys(open_hours).length) {
    return "ساعات الدوام: غير معرّفة. لا تذكر للزبون أوقات محددة. إذا سأل عن الدوام، قل: 'دوامنا عادة من الصباح للمساء، أأكدلك بثانية' ولا ترفض طلب على أساس الوقت.";
  }
  const now = baghdadNow();
  const todayIdx = now.getUTCDay();
  const dayKey = DAY_KEYS[todayIdx];
  const h = open_hours[dayKey];
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const lines = DAY_KEYS.map((k) => {
    const d = open_hours[k];
    if (!d) return `${DAY_AR[k]}: —`;
    return d.closed ? `${DAY_AR[k]}: مغلق` : `${DAY_AR[k]}: ${d.open}-${d.close}`;
  }).join(" | ");

  let status = "ساعات الدوام لهذا اليوم غير محددة.";
  if (h) {
    if (h.closed) {
      let found = false;
      for (let i = 1; i <= 7; i++) {
        const k = DAY_KEYS[(todayIdx + i) % 7];
        const d = open_hours[k];
        if (d && !d.closed && d.open) {
          status = `🔴 المطعم اليوم مغلق. أقرب يوم فتح: ${DAY_AR[k]} الساعة ${d.open}.`;
          found = true; break;
        }
      }
      if (!found) status = `🔴 المطعم اليوم مغلق.`;
    } else if (hhmm < h.open) {
      status = `🔴 المطعم مغلق الآن. يفتح اليوم الساعة ${h.open} (بعد ${fmtDur(minsBetween(hhmm, h.open))}).`;
    } else if (hhmm > h.close) {
      let found = false;
      for (let i = 1; i <= 7; i++) {
        const k = DAY_KEYS[(todayIdx + i) % 7];
        const d = open_hours[k];
        if (d && !d.closed && d.open) {
          status = `🔴 المطعم مغلق الآن (انتهى دوام اليوم ${h.open}-${h.close}). يفتح ${DAY_AR[k]} الساعة ${d.open}.`;
          found = true; break;
        }
      }
      if (!found) status = `🔴 المطعم مغلق الآن. انتهى دوام اليوم ${h.open}-${h.close}.`;
    } else {
      const left = minsBetween(hhmm, h.close);
      status = `🟢 المطعم مفتوح الآن (${h.open}-${h.close}). متبقي على الإغلاق: ${fmtDur(left)}.`;
    }
  }
  return `${status}\nجدول الأسبوع: ${lines}`;
}

function buildCustomerProfileBlock(profile: any): string {
  if (!profile || profile.found !== true) {
    return "# ملف الزبون\nزبون جديد — رحّب به بحرارة واطلب اسمه بأدب لو ما ذكره.";
  }
  const lines: string[] = ["# ملف الزبون"];
  if (profile.name) lines.push(`- الاسم: ${profile.name}`);
  if (profile.total_orders) lines.push(`- عدد الطلبات السابقة: ${profile.total_orders}`);
  if (profile.last_address) lines.push(`- آخر عنوان: ${profile.last_address}`);
  if (profile.last_phone) lines.push(`- آخر هاتف: ${profile.last_phone}`);

  const ap = profile.auto_preferences || {};
  const apParts: string[] = [];
  if (Array.isArray(ap.dislikes) && ap.dislikes.length) apParts.push(`ما يحب: ${ap.dislikes.join("، ")}`);
  if (Array.isArray(ap.likes) && ap.likes.length) apParts.push(`يفضّل: ${ap.likes.join("، ")}`);
  if (Array.isArray(ap.allergies) && ap.allergies.length) apParts.push(`⚠️ حساسية: ${ap.allergies.join("، ")}`);
  if (ap.diet) apParts.push(`نظام غذائي: ${ap.diet}`);
  if (apParts.length) lines.push(`- تفضيلات مستخرجة: ${apParts.join(" | ")}`);
  if (profile.preferences) lines.push(`- ملاحظات الزبون: ${profile.preferences}`);

  const favs = Array.isArray(profile.favorites) ? profile.favorites : [];
  if (favs.length) {
    lines.push(`- المفضّلات: ${favs.map((f: any) => `${f.name} (طلبها ${f.total_qty})`).join("، ")}`);
  }

  const recent = Array.isArray(profile.recent_orders) ? profile.recent_orders : [];
  if (recent.length) {
    const last = recent[0];
    const items = Array.isArray(last.items) ? last.items : [];
    const itemSummary = items.map((i: any) => `${i.qty || 1}×${i.name || ""}`).join(" + ");
    lines.push(`- آخر طلب: ${itemSummary} — ${last.total || 0} (${new Date(last.created_at).toLocaleDateString("ar-IQ")})`);
    if (recent.length > 1) {
      lines.push(`- طلبات سابقة: ${recent.length} طلب محفوظ`);
    }
  }

  lines.push("");
  lines.push("**استفد من هذي المعلومات:**");
  lines.push("- رحّب بالزبون باسمه (لو معروف) ولا تسأله عن اسمه من جديد.");
  lines.push("- إذا قال 'نفس آخر مرة' أو 'كرر الطلب' → استدعِ reorder_last فوراً.");
  lines.push("- اقترح آخر عنوان وهاتف بدل ما تسأله من جديد — أكّد فقط: 'نوصّل على نفس العنوان (…)؟'.");
  lines.push("- احترم الحساسيات والتفضيلات — لا تضيف ولا تغيّر أي صنف بسببها؛ استخدمها فقط حتى تتجنب اقتراح شيء ما يحبه.");
  lines.push("- المفضّلات والطلبات السابقة معلومات داخلية للاستئناس فقط. ممنوع تضيف منها للسلة إلا إذا الزبون طلبها صراحة بكلام واضح.");
  lines.push("- ملاحظات المالك (notes) للاستئناس الداخلي فقط — لا تكشفها للزبون.");

  return lines.join("\n");
}

function systemPrompt(restaurant: any, conv: any, branches: any[], customerProfile?: any) {
  const cartItemsArr = Array.isArray(conv.cart) ? conv.cart : [];
  // Detect stale carry-over cart (returning customer with items left from previous session)
  const lastMsgMs = conv.last_message_at ? new Date(conv.last_message_at).getTime() : Date.now();
  const cartAgeMin = Math.floor((Date.now() - lastMsgMs) / 60000);
  const isStaleCart = cartItemsArr.length > 0 && cartAgeMin >= 60;
  const stalePrefix = isStaleCart
    ? `⚠️ تنبيه: هذه السلة من جلسة سابقة (آخر نشاط قبل ${cartAgeMin} دقيقة، ما تأكد طلبها). قبل ما تضيف أي شي جديد للزبون، اسأله بوضوح: "تكمّل طلبك السابق لو نبدأ من جديد؟". إذا قال جديد، استدعِ remove_from_cart لكل صنف أو وجّهه لقول "طلب جديد".\n`
    : "";
  const cartLines = stalePrefix + (
    cartItemsArr.length
      ? cartItemsArr.map((i: CartItem) => `- ${i.qty} × ${i.name} (${i.unit_price} ${restaurant.currency})`).join("\n")
      : "السلة فارغة"
  );


  const defaultLang = restaurant.language === "ar"
    ? "عربي عراقي بسيط ومحكي"
    : restaurant.language === "en"
    ? "English"
    : restaurant.language;
  const lang = `طابق لغة الزبون تلقائياً في كل رسالة (Auto-detect & mirror the customer's language on every single reply). اكتشف لغة آخر رسالة من الزبون (عربي فصحى، عربي عراقي/خليجي/مصري/شامي/مغاربي، English، Français، Español، Deutsch، Türkçe، Kurdî، فارسی، Italiano، Português، Русский، 中文، 日本語، हिन्दी، اردو، أي لغة أخرى…) ورد بنفسها بنفس اللهجة والنبرة. إذا كانت رسالة الزبون مزيج لغات (code-switching) رد بنفس المزيج. إذا لم تستطع التحديد بثقة، استخدم: ${defaultLang}. أسماء الأصناف بالمنيو لا تُترجم — اذكرها كما هي. حافظ على نفس النبرة (${restaurant.tone}) بأي لغة.`;

  // Resolve current branch (if delivery info has branch_id stored in meta)
  const selectedBranchId = conv.meta?.branch_id;
  const selectedBranch = selectedBranchId ? branches.find((b: any) => b.id === selectedBranchId) : null;
  const effectiveHours = selectedBranch?.open_hours && Object.keys(selectedBranch.open_hours).length
    ? selectedBranch.open_hours
    : restaurant.open_hours;
  const effectiveMinOrder = selectedBranch?.min_order ?? restaurant.min_order;

  const activeBranches = branches.filter((b: any) => b.is_active);
  const branchesBlock = activeBranches.length === 0
    ? "هذا المطعم بدون فروع مسجلة."
    : activeBranches.length === 1
    ? `الفرع الوحيد: ${activeBranches[0].name}${activeBranches[0].address ? ` — ${activeBranches[0].address}` : ""}`
    : `الفروع المتاحة (${activeBranches.length}):\n${activeBranches.map((b: any) => {
        const areas = Array.isArray(b.delivery_areas) && b.delivery_areas.length ? b.delivery_areas.join("، ") : "—";
        return `- ${b.name}${b.address ? ` (${b.address})` : ""} | مناطق التوصيل: ${areas}`;
      }).join("\n")}`;

  const branchRule = activeBranches.length > 1
    ? `8) المطعم عنده عدة فروع. لازم تستدعي resolve_branch(address) أول ما الزبون يعطي عنوانه/منطقته، قبل set_delivery_info و submit_order. إذا منطقته ما مخدومة من أي فرع، اعتذر بلطف واذكر المناطق المخدومة.`
    : `8) المطعم عنده فرع واحد فقط.`;

  return `# الهوية (Identity)
أنت موظف استقبال طلبات لمطعم "${restaurant.name}". شغلتك الوحيدة: تساعد الزبون يطلب أكل بسرعة وبدون لف.
- نبرة: ${restaurant.tone}
- لغة الرد: ${lang}
- ${nowContextLine()}
- ${openHoursStatus(effectiveHours)}

${buildCustomerProfileBlock(customerProfile)}


# الفروع (Branches)
${branchesBlock}
${selectedBranch ? `\nالفرع المختار حالياً: ${selectedBranch.name}` : ""}

# الأسلوب (Style)
- ردود قصيرة جداً (سطر أو سطرين). بدون مقدمات طويلة.
- سؤال واحد بس بكل رسالة.
- استخدم الإيموجي بهدوء (🍔 🥤 ✅ 📍) لما يناسب — مو بكل رسالة.
- خاطب الزبون باسمه إذا تعرفه.
- لا تكرر نفس الجملة الترحيبية أكثر من مرة بنفس المحادثة.

# قواعد صارمة (Rules)
1) ممنوع تخترع صنف أو سعر — استدعِ search_menu قبل أي add_to_cart.
1.1) ممنوع تضيف أي صنف "من يمك" أو من المفضّلات/الطلبات السابقة/التوقعات/العادات. add_to_cart فقط للأصناف التي ذكرها الزبون صراحة في آخر طلبه، أو إذا وافق صراحة على اقتراح منك. لا تضيف بطاطس/صوص/مشروب/إضافات لأنّها "شائعة" أو "ضمن تفضيلاته" أو "طلبها قبل". إذا غير متأكد اسأل سؤال واحد.
1.2) إذا الزبون اعترض مثل "ما طلبت بطاطس"، "من وين جبتها؟"، "شنو هاي؟" → اعتذر فوراً، استدعِ remove_from_cart للصنف الزائد إن كان موجوداً، ولا تضيف بدله أي شيء.
2) تأكيد الطلب (إلزامي وبخطوتين):
   أ) قبل المعاينة لازم تجمع: **اسم الزبون** + السلة + العنوان + الهاتف (+ الفرع لو متعدد). إذا الاسم محفوظ في ملف الزبون أعلاه، استعمله مباشرة بدون ما تسأل. إذا ما تعرفه، اسأله بصراحة: "حضرتك تشرّفنا، اسمك الكريم؟" ثم مرّره في set_delivery_info ضمن customer_name.
   ب) بعد ما تكتمل البيانات استدعِ preview_order. سيرجع لك confirmation_token ونص ملخّص كامل. اعرض الملخّص للزبون حرفياً واسأله: "أأكد الطلب؟ (نعم/لا)".
   ج) لا تستدعِ submit_order إلا بعد ما الزبون يرد بصراحة بـ نعم/أكد/تمام/أوكي. عند الاستدعاء مرّر confirmation_token كما هو ونص موافقة الزبون الحرفي في user_confirmation_text.
   د) لو الزبون عدّل السلة أو العنوان أو الاسم بعد المعاينة — استدعِ preview_order من جديد قبل submit_order.
3) صنف مو موجود بالمنيو؟ اعتذر باختصار واقترح أقرب بديل من search_menu.
4) الحد الأدنى للطلب: ${effectiveMinOrder} ${restaurant.currency}. لو السلة أقل، خبّر الزبون قبل ما يأكد.
5) ممنوع الكلام بأي موضوع خارج طلبات المطعم. إذا سألك عن شي غير مرتبط، رجّعه للطلب بلطف.
6) استخدم handoff_to_human **فقط** في حالتين: (أ) الزبون طلبها صراحة بكلمات مثل "موظف"، "إنسان"، "حولني"، "بشري"، أو (ب) فشلت أداة حرجة (submit_order/preview_order) بعد محاولة واحدة على الأقل. **ممنوع** استخدامها لمجرد إن الزبون متضايق أو سأل سؤال غريب — أول رد على الانزعاج اعتذار قصير + سؤال محدد لفهم المشكلة. وممنوع تكرر رسالة "حوّلت لموظف" أكثر من مرة بنفس المحادثة.
14) **ممنوع نهائياً** تذكر أي تفاصيل تقنية للزبون: لا أسماء جداول، لا "قاعدة بيانات"، لا "invalid input"، لا أكواد أخطاء، لا JSON، لا tokens، لا "خلل بالسيستم". إذا أداة رجعت \`error\`، خذ \`user_message\` منها (إن وُجد) أو اعتذر بسطر عام مثل: "صار خلل بسيط، ممكن نعيد المحاولة؟". اعتبر تفاصيل الـ error سرّية بالكامل.
15) **ممنوع تخترع وجود موظف بشري**: لا تقول "الموظف كدامه"، "يثبّت يدوي"، "يراجع الآن"، "بشري دخل بالمحادثة" — إلا إذا استدعيت \`handoff_to_human\` بنفس هذا الـ run. لا تمثيل ولا أكاذيب تطمين.
7) **ساعات الدوام (إلزامي):** عندك الوقت الحالي وحالة المطعم في أعلى البرومبت. إذا الحالة 🔴 مغلق:
   • **ممنوع** تستدعي submit_order لطلب فوري.
   • اعتذر بسطر قصير واذكر بالضبط متى يفتح (من السطر أعلاه).
   • اعرض على الزبون الجدولة لأقرب وقت دوام: "تحب أجدوله لـ [الوقت]؟" — لو وافق، اتبع المسار 13 (schedule_order).
   • إذا الزبون سأل "شكد الساعة؟" أو "متى تفتحون؟" أو "دا تشتغلون؟" — جاوب مباشرة من المعلومات أعلاه بدون أي أداة.
   إذا الحالة 🟢 مفتوح: اشتغل عادي. إذا الساعات غير معرّفة: لا ترفض ولا تذكر أوقات.
13) الطلبات المجدولة (لوقت لاحق):
   • إذا الزبون قال "بكرة"، "بعد ساعة"، "الساعة كذا"، "للغداء"، "للعشاء" أو أي وقت مستقبلي — اسأله عن الوقت المحدد، ثم بعد preview_order وموافقة الزبون استدعِ schedule_order بدل submit_order.
   • مرّر scheduled_for بصيغة ISO 8601 بمنطقة بغداد (+03:00). الوقت الحالي الآن (UTC): ${new Date().toISOString()}. لازم الموعد يكون بعد 15 دقيقة على الأقل وخلال أسبوعين، وضمن دوام الفرع.
   • مرّر scheduled_for_human بنفس الكلمات اللي قالها الزبون.
${branchRule}
9) المخزون:
   • الأصناف الناضبة لا تظهر أصلاً في show_menu — لا تذكرها بالقوائم العامة.
   • إذا الزبون طلب صنفاً بالاسم وكان out_of_stock في نتائج search_menu، قل بإيجاز "خلصان حالياً" واقترح بديلاً واحداً من نفس الفئة فوراً عبر search_menu. لا تكرر الاعتذار.
   • إذا add_to_cart رجع خطأ بسبب نقص الكمية، اعرض المتوفر واسأل: "تكتفي بـ X لو نختار بديل؟"
10) الكومبوهات (Combos):
   • إذا الزبون سأل عن "العروض" أو "الكومبوهات" أو "وجبة"، استدعِ show_combos أولاً.
   • لما الزبون يقتنع، استدعِ add_combo_to_cart بـ combo_id.
11) الـ Upsell الذكي:
   • بعد add_to_cart ناجح وُلّد hint بـ upsell_category، استدعِ suggest_upsell مرة واحدة فقط لهذا الصنف.
   • اعرض اقتراحاً واحداً بسطر مهذّب: "تحب نضيفلك [اسم] بـ [سعر]؟". إذا الزبون رفض، لا تلحّ ولا تكرر.
   • لا تستدعِ suggest_upsell أكثر من مرة بالمحادثة الواحدة لنفس الفئة.
12) معالجة الصور (Vision):
   • افحص الصورة بدقّة واستخرج: رقم الطلب، الأصناف والكميات والإضافات، العنوان/الهاتف/الاسم.
   • طابق الأصناف عبر search_menu قبل add_to_cart.
   • لخّص ما فهمت بسطر واحد ثم اطلب توضيحاً واحداً فقط للمعلومة الناقصة الأهم.
16) إلغاء وتعديل الطلب:
   • إذا الزبون قال "ألغي الطلب"، "ما أريده"، "اشطب الطلب" → استدعِ cancel_order مباشرة (آخر طلب فقط). إذا الأداة رجعت خطأ يقول إن الطلب صار بالتحضير، اعتذر واستدعِ handoff_to_human.
   • إذا الزبون قال "أريد أعدّل الطلب"، "زيدلي شي"، "غيّر صنف"، "احذف صنف بعد ما أكدت" → استدعِ modify_order. الأداة ترجّع أصناف الطلب للسلة وتلغي الطلب الأصلي. بعدها ساعد الزبون يضيف/يحذف اللي يريد، ثم preview_order من جديد ثم submit_order أو schedule_order حسب الحالة.
   • لا تعد الزبون بأي إلغاء/تعديل بدون ما تستدعي الأداة فعلاً.
17) الشكاوى:
   • إذا الزبون اشتكى من جودة/تأخير/نقص/خطأ بالطلب أو سوء معاملة → استدعِ create_complaint مباشرة مع type مناسب وnote مختصر. لا تعتذر طويلاً ولا تعد بتعويض من نفسك ولا تحاول تحلّها لحالك.
   • الأداة راح توقف البوت تلقائياً وتنبّه المدير، فاكتفِ برد قصير جداً واحد بعدها.
18) الموقع الجغرافي:
   • إذا الزبون سأل "وين موقعكم"، "دزلي اللوكيشن"، "فين المطعم"، أو يبي يجي بنفسه (pickup) → استدعِ send_restaurant_location مباشرة. لا تكتب الرابط بنفسك.
   • إذا تحتاج عنوان توصيل ولم يعطك الزبون موقعاً واضحاً، أو وصفه النصي ناقص → استدعِ request_customer_location مرة واحدة فقط بدل ما تسأله سؤال نصي.
   • إذا الزبون شارك موقعه فعلاً (راح يجيك بصيغة "[موقع الزبون: lat=.., lng=..]") اعتبره عنوان التوصيل واستخدمه مع set_delivery_info كنص العنوان.
19) الرسائل الصوتية (قاعدة صارمة جداً):
   • كل ما يوصلك من الزبون هو "كلامه"، سواء كتبه أو حجاه بفويس. عاملها نفس الشي تماماً.
   • ممنوع منعاً باتاً تذكر كلمات: "فويس"، "صوتية"، "تفريغ"، "قرأت"، "قريت"، "ما سمعت"، "النص المكتوب"، "تحت الفويس"، "مرافقة للفويس"، "أحلل النصوص"، أو أي إشارة إنك ما تسمع الصوت. لا تشرح طريقة عملك أبداً.
   • إذا سألك الزبون "سمعت الفويس؟" / "وصلك الفويس؟" / "تكدر تسمع؟" → جاوب فقط: "إي سمعتك حبيبي" أو "إي واضح" ثم رجع للطلب فوراً. لا تضيف أي تبرير.
   • إذا الزبون كال "اني ما كتبت شي" → اعتذر بإيجاز ("آسف للخربطة") وكمّل من آخر طلب فهمته بدون شرح.
   • أمثلة صح ❌ غلط:
     ❌ "لا والله ما سمعته بس قرأت كلامك تحت الفويس" 
     ❌ "أنا أحلل النصوص المرافقة للفويس بس ما أسمع الصوت"
     ✅ "إي سمعتك كاك محمد، تريد البرجر دجاج لو لحم؟"


# السياق الحالي (Context)
السلة:
${cartLines}

الحالة: ${conv.state}
التوصيل: ${JSON.stringify(conv.delivery || {})}`;
}

// ---------- Tool execution ----------
// ---- Frequently-bought-together cache (module-scope, 10-min TTL) ----
type FBTEntry = { sourceCounts: Map<string, number>; coCounts: Map<string, Map<string, number>>; expiresAt: number };
const fbtCache = new Map<string, FBTEntry>();
const FBT_TTL_MS = 10 * 60 * 1000;

async function loadFBT(db: any, restaurantId: string): Promise<FBTEntry | null> {
  const cached = fbtCache.get(restaurantId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const sinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await db
    .from("orders")
    .select("items,status,created_at")
    .eq("restaurant_id", restaurantId)
    .in("status", ["confirmed", "preparing", "out_for_delivery", "completed"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!orders || orders.length < 10) {
    // Not enough data — cache an empty entry to avoid re-querying
    const empty: FBTEntry = { sourceCounts: new Map(), coCounts: new Map(), expiresAt: Date.now() + FBT_TTL_MS };
    fbtCache.set(restaurantId, empty);
    return empty;
  }

  const sourceCounts = new Map<string, number>();
  const coCounts = new Map<string, Map<string, number>>();
  for (const o of orders) {
    const items: any[] = Array.isArray(o.items) ? o.items : [];
    const ids = Array.from(new Set(items.map((i) => i?.menu_item_id).filter(Boolean) as string[]));
    if (ids.length < 1) continue;
    for (const id of ids) sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const a = ids[i], b = ids[j];
        let inner = coCounts.get(a);
        if (!inner) { inner = new Map(); coCounts.set(a, inner); }
        inner.set(b, (inner.get(b) || 0) + 1);
      }
    }
  }
  const entry: FBTEntry = { sourceCounts, coCounts, expiresAt: Date.now() + FBT_TTL_MS };
  fbtCache.set(restaurantId, entry);
  return entry;
}

function getFrequentlyBoughtWith(fbt: FBTEntry, sourceItemId: string): Array<{ menu_item_id: string; score: number; count: number }> {
  const sourceCount = fbt.sourceCounts.get(sourceItemId) || 0;
  if (sourceCount < 3) return []; // need item to appear in at least 3 orders
  const co = fbt.coCounts.get(sourceItemId);
  if (!co) return [];
  const out: Array<{ menu_item_id: string; score: number; count: number }> = [];
  for (const [otherId, count] of co.entries()) {
    const score = count / sourceCount;
    if (score >= 0.2) out.push({ menu_item_id: otherId, score, count });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Aggregate FBT scores across multiple source items (cart). Returns top item ids
// not already in the cart, sorted by summed score desc.
function getCheckoutFBT(fbt: FBTEntry, cartItemIds: string[], excludeIds: Set<string>): Array<{ menu_item_id: string; score: number }> {
  const agg = new Map<string, number>();
  for (const srcId of cartItemIds) {
    const sourceCount = fbt.sourceCounts.get(srcId) || 0;
    if (sourceCount < 3) continue;
    const co = fbt.coCounts.get(srcId);
    if (!co) continue;
    for (const [otherId, count] of co.entries()) {
      if (excludeIds.has(otherId)) continue;
      const score = count / sourceCount;
      if (score >= 0.15) agg.set(otherId, (agg.get(otherId) || 0) + score);
    }
  }
  return [...agg.entries()]
    .map(([menu_item_id, score]) => ({ menu_item_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// Infer an upsell target category from the item's own category, when no manual
// upsell_category is set. Returns a list of candidate category keywords to try.
function inferUpsellCategory(cat: string | null | undefined): string[] {
  const c = (cat || "").toLowerCase().trim();
  if (!c) return ["مشروب", "drink", "beverage", "عصير", "مشروبات"];
  const has = (...ks: string[]) => ks.some((k) => c.includes(k));
  if (has("برجر", "burger", "ساندويتش", "ساندوتش", "sandwich", "شاورما", "wrap", "wrap"))
    return ["بطاطا", "fries", "مقبلات", "sides", "مشروب", "drink", "عصير", "مشروبات", "beverage"];
  if (has("بيتزا", "pizza"))
    return ["مقبلات", "sides", "appetizer", "مشروب", "drink", "عصير", "مشروبات"];
  if (has("دجاج", "chicken", "مشاوي", "grill", "كباب", "kebab", "ستيك", "steak"))
    return ["سلطة", "salad", "بطاطا", "fries", "مشروب", "drink", "مشروبات"];
  if (has("بطاطا", "fries", "مقبلات", "sides", "appetizer", "سلطة", "salad"))
    return ["مشروب", "drink", "عصير", "مشروبات", "beverage"];
  if (has("مشروب", "drink", "عصير", "juice", "beverage", "مشروبات"))
    return ["حلى", "حلويات", "dessert", "sweet", "sweets"];
  if (has("حلى", "حلويات", "dessert", "sweet"))
    return ["مشروب", "drink", "عصير", "مشروبات", "قهوة", "coffee", "شاي", "tea"];
  if (has("فطور", "breakfast", "بريك"))
    return ["مشروب", "قهوة", "coffee", "شاي", "tea", "عصير", "juice"];
  return ["مشروب", "drink", "عصير", "مشروبات", "beverage"];
}

async function runTool(
  db: ReturnType<typeof admin>,
  conv: any,
  restaurant: any,
  name: string,
  args: any,
  media: MediaItem[],
  actions: any[],
  customerProfile?: any,
): Promise<any> {
  if (name === "search_menu") {
    const q = String(args.query || "").trim();
    if (!q) return { error: "empty query" };
    const nq = normalizeArabic(q);
    let results: any[] = [];
    let matchSource: string = "embedding";

    // 0) Category match — if the query looks like a category name (e.g. "اول ان ون بوكس"),
    // return ALL items in that category instead of one arbitrary fuzzy match.
    try {
      const { data: cats } = await db
        .from("menu_items")
        .select("category")
        .eq("restaurant_id", restaurant.id)
        .eq("is_available", true)
        .not("category", "is", null);
      const uniqCats = Array.from(new Set((cats || []).map((c: any) => String(c.category || "")).filter(Boolean)));
      const matchedCat = uniqCats.find((c) => {
        const nc = normalizeArabic(c);
        return nc === nq || nc.includes(nq) || nq.includes(nc);
      });
      if (matchedCat) {
        const { data: catItems } = await db
          .from("menu_items")
          .select("id,name,description,price,is_available,category")
          .eq("restaurant_id", restaurant.id)
          .eq("is_available", true)
          .eq("category", matchedCat)
          .limit(20);
        if (catItems && catItems.length) { results = catItems; matchSource = "category"; }
      }
    } catch (_) { /* fall through */ }


    // 1) Embedding search (semantic) — skip if category match already populated results
    if (!results.length) try {
      const vec = await embedText(q);
      const { data, error } = await db.rpc("search_menu_items", {
        p_restaurant_id: restaurant.id,
        p_query: vec,
        p_limit: 5,
      });
      if (!error && data && data.length) {
        // Require decent semantic similarity to avoid noise
        const filtered = (data as any[]).filter((r) => (r.similarity ?? 0) >= 0.55);
        if (filtered.length) { results = filtered; matchSource = "embedding"; }
      }
    } catch (_) { /* fall through */ }

    // 2) Fuzzy (pg_trgm) on normalized name + aliases
    if (!results.length) {
      try {
        const { data, error } = await db.rpc("search_menu_fuzzy", {
          p_restaurant_id: restaurant.id,
          p_query: q,
          p_threshold: 0.3,
          p_limit: 5,
        });
        if (!error && data && data.length) { results = data as any[]; matchSource = "fuzzy"; }
      } catch (_) { /* fall through */ }
    }

    // 3) Simple ILIKE fallback
    if (!results.length) {
      const { data } = await db
        .from("menu_items")
        .select("id,name,description,price,is_available,category")
        .eq("restaurant_id", restaurant.id)
        .eq("is_available", true)
        .ilike("name", `%${q}%`)
        .limit(5);
      if (data && data.length) { results = data; matchSource = "ilike"; }
    }

    // 4) AI semantic fallback — pass a compact menu list and ask the model to pick the closest item
    if (!results.length) {
      try {
        const { data: menuList } = await db
          .from("menu_items")
          .select("id,name,category")
          .eq("restaurant_id", restaurant.id)
          .eq("is_available", true)
          .limit(60);
        if (menuList && menuList.length) {
          const compact = menuList.map((m: any) => `${m.id}|${m.name}${m.category ? ` (${m.category})` : ""}`).join("\n");
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: "أنت مساعد لمطابقة طلبات الزبائن بالعربية العراقية مع أصناف منيو. الزبون قد يستخدم لهجة أو أخطاء إملائية أو اختصارات. ارجع أقرب صنف دلالياً أو null إذا ما اكو شي قريب." },
                { role: "user", content: `طلب الزبون: "${q}"\n\nالمنيو (id|name):\n${compact}\n\nاختر الـid الأقرب أو null.` },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "pick_item",
                  description: "Return the closest matching menu_item_id, or null if none.",
                  parameters: {
                    type: "object",
                    properties: { menu_item_id: { type: ["string","null"] }, confidence: { type: "number" } },
                    required: ["menu_item_id"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "pick_item" } },
            }),
          });
          if (aiRes.ok) {
            const j = await aiRes.json();
            const args0 = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
            const parsed = args0 ? JSON.parse(args0) : null;
            const picked = parsed?.menu_item_id;
            const conf = Number(parsed?.confidence ?? 0.7);
            if (picked && conf >= 0.5) {
              const { data: row } = await db
                .from("menu_items")
                .select("id,name,description,price,is_available,category")
                .eq("id", picked)
                .eq("restaurant_id", restaurant.id)
                .maybeSingle();
              if (row) { results = [row]; matchSource = "ai"; }
            }
          }
        }
      } catch (_) { /* fall through */ }
    }

    // 5) Log unmatched query so owner can train the system
    if (!results.length && nq) {
      try {
        // upsert by (restaurant_id, normalized_text)
        const { data: existing } = await db
          .from("unmatched_queries")
          .select("id,count")
          .eq("restaurant_id", restaurant.id)
          .eq("normalized_text", nq)
          .is("resolved_to_item_id", null)
          .maybeSingle();
        if (existing) {
          await db.from("unmatched_queries")
            .update({ count: (existing.count || 1) + 1, last_seen_at: new Date().toISOString(), query_text: q, conversation_id: conv.id })
            .eq("id", existing.id);
        } else {
          await db.from("unmatched_queries").insert({
            restaurant_id: restaurant.id,
            conversation_id: conv.id,
            query_text: q,
            normalized_text: nq,
          });
        }
      } catch (_) { /* ignore */ }
    }

    // Enrich with options + stock info
    if (results.length) {
      const ids = results.map((r: any) => r.id);
      const { data: extra } = await db
        .from("menu_items")
        .select("id,options,track_stock,stock_qty,upsell_category")
        .in("id", ids);
      const map = new Map((extra || []).map((o: any) => [o.id, o]));
      results = results.map((r: any) => {
        const e: any = map.get(r.id) || {};
        const out_of_stock = e.track_stock && (e.stock_qty == null || e.stock_qty <= 0);
        return { ...r, options: e.options || [], track_stock: !!e.track_stock, stock_qty: e.stock_qty, upsell_category: e.upsell_category || null, out_of_stock };
      });
    }
    return { results, match_source: matchSource };
  }

  if (name === "add_to_cart") {
    const { data: item, error } = await db
      .from("menu_items")
      .select("id,name,price,is_available,options,track_stock,stock_qty,upsell_category,category")
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

    // Stock check (cart-aware)
    if (item.track_stock) {
      const cartExisting: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
      const already = cartExisting.filter((c) => c.menu_item_id === item.id).reduce((s, c) => s + c.qty, 0);
      const need = already + Number(args.qty || 0);
      if (item.stock_qty == null || item.stock_qty <= 0) {
        return { error: `للأسف "${item.name}" خلصان حالياً. اقترح بديل عبر search_menu.` };
      }
      if (need > item.stock_qty) {
        const remaining = Math.max(0, item.stock_qty - already);
        return { error: `المتوفر من "${item.name}" ${remaining} فقط. عدّل الكمية.`, available: remaining };
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
    return {
      ok: true,
      cart,
      total: cart.reduce((s, i) => s + i.qty * i.unit_price, 0),
      upsell_category: item.upsell_category || null,
      hint: `استدعِ suggest_upsell بـ for_menu_item_id="${item.id}" لاقتراح إضافة لطيفة (مرة واحدة بالمحادثة فقط).`,
    };
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
    const newName = (args.customer_name || "").toString().trim() || conv.customer_name || null;
    conv.delivery = delivery;
    conv.customer_name = newName;
    await db
      .from("conversations")
      .update({ delivery, state: "confirm", customer_name: newName })
      .eq("id", conv.id);
    return { ok: true, delivery, customer_name: newName };
  }

  if (name === "preview_order") {
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    if (!cart.length) return { error: "السلة فارغة" };
    const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const delivery = conv.delivery || {};
    if (!delivery.address || !delivery.phone) {
      return { error: "ناقص العنوان أو الهاتف — استدعِ set_delivery_info أولاً" };
    }
    if (!conv.customer_name || !String(conv.customer_name).trim()) {
      return { error: "ناقص اسم الزبون — اسأله عن اسمه ثم استدعِ set_delivery_info مع customer_name." };
    }
    const branchId = conv.meta?.branch_id || null;
    const branches: any[] = (restaurant as any).__branches || [];
    const branch = branchId ? branches.find((b: any) => b.id === branchId) : null;
    const effectiveMin = Number(branch?.min_order ?? restaurant.min_order ?? 0);
    if (subtotal < effectiveMin) {
      return { error: `الحد الأدنى للطلب ${effectiveMin} ${restaurant.currency}. السلة حالياً ${subtotal}.` };
    }
    const fp = await sha256Hex(cartFingerprint(cart, delivery, branchId));
    const token = `ord_${fp.slice(0, 16)}`;

    // ===== Checkout-time upsell (once per conversation) =====
    let checkoutSuggestions: any[] = [];
    let checkoutNote: string | null = null;
    let comboSuggestion: any = null;
    // Skip checkout upsell entirely if cart already contains a meal/box/combo
    // (those usually bundle a drink + side, so suggesting another drink is noise).
    const hasBundleItem = cart.some((c) => /بوكس|كومبو|وجبة|ميل|combo|meal|box/i.test(c.name || ""));
    if (!conv.meta?.checkout_upsell_offered && cart.length > 0 && !hasBundleItem) {
      const inCartIds = new Set(cart.map((c) => c.menu_item_id));
      const cartQtyById = new Map<string, number>();
      for (const c of cart) cartQtyById.set(c.menu_item_id, (cartQtyById.get(c.menu_item_id) || 0) + c.qty);

      // 0) Combo suggestion: if cart already covers most of a combo and combo saves money, offer it.
      try {
        const { data: combos } = await db
          .from("combos")
          .select("id,name,price,items,description")
          .eq("restaurant_id", restaurant.id)
          .eq("is_active", true);
        const candidates: Array<{ combo: any; savings: number; coverage: number; missingIds: string[] }> = [];
        for (const cmb of combos || []) {
          const cItems: { menu_item_id: string; qty: number }[] = Array.isArray(cmb.items) ? cmb.items : [];
          if (!cItems.length) continue;
          const totalQty = cItems.reduce((s, i) => s + (i.qty || 1), 0);
          let coveredQty = 0;
          const missingIds: string[] = [];
          for (const ci of cItems) {
            const need = ci.qty || 1;
            const have = cartQtyById.get(ci.menu_item_id) || 0;
            coveredQty += Math.min(need, have);
            if (have < need) missingIds.push(ci.menu_item_id);
          }
          const coverage = coveredQty / totalQty;
          if (coverage < 0.6) continue;
          // Compute MSRP of covered portion to estimate savings vs combo price.
          const { data: msrpItems } = await db
            .from("menu_items")
            .select("id,price")
            .in("id", cItems.map((i) => i.menu_item_id))
            .eq("restaurant_id", restaurant.id);
          const priceById = new Map((msrpItems || []).map((m: any) => [m.id, Number(m.price) || 0]));
          let coveredMsrp = 0;
          for (const ci of cItems) {
            const need = ci.qty || 1;
            const have = cartQtyById.get(ci.menu_item_id) || 0;
            coveredMsrp += (priceById.get(ci.menu_item_id) || 0) * Math.min(need, have);
          }
          const savings = coveredMsrp - Number(cmb.price);
          if (savings > 0) candidates.push({ combo: cmb, savings, coverage, missingIds });
        }
        candidates.sort((a, b) => b.savings - a.savings);
        if (candidates.length) {
          const best = candidates[0];
          comboSuggestion = {
            id: best.combo.id,
            name: best.combo.name,
            price: Number(best.combo.price),
            savings: Math.round(best.savings),
            coverage_pct: Math.round(best.coverage * 100),
            full_match: best.missingIds.length === 0,
          };
        }
      } catch (_) { /* ignore */ }

      // If no combo match, try item-level upsell: personalized → FBT → inferred.
      if (!comboSuggestion) {
        let pickedIds: string[] = [];
        let dataDriven = false;
        let personalized = false;

        // 1) Cross-customer FBT. Never use a customer's personal favorites here:
        // favorites are memory only, not permission to add/suggest items as if requested.
        if (!pickedIds.length) {
          try {
            const fbt = await loadFBT(db, restaurant.id);
            if (fbt) {
              const ranked = getCheckoutFBT(fbt, [...inCartIds], inCartIds);
              if (ranked.length) {
                pickedIds = ranked.map((r) => r.menu_item_id);
                dataDriven = true;
              }
            }
          } catch (_) { /* ignore */ }
        }
        if (!pickedIds.length) {
          const { data: cartMis } = await db
            .from("menu_items")
            .select("id,category")
            .in("id", [...inCartIds])
            .eq("restaurant_id", restaurant.id);
          const cartCats = new Set<string>();
          (cartMis || []).forEach((m: any) => { if (m.category) cartCats.add(String(m.category).toLowerCase()); });
          const wantCats = new Set<string>();
          for (const c of cartCats) inferUpsellCategory(c).forEach((x) => wantCats.add(x));
          if (wantCats.size) {
            const orFilter = [...wantCats].map((c) => `category.ilike.%${c}%`).join(",");
            const { data: cand } = await db
              .from("menu_items")
              .select("id,name,price,category,track_stock,stock_qty")
              .eq("restaurant_id", restaurant.id)
              .eq("is_available", true)
              .or(orFilter)
              .limit(10);
            pickedIds = (cand || [])
              .filter((s: any) => !inCartIds.has(s.id))
              .filter((s: any) => !s.track_stock || (s.stock_qty != null && s.stock_qty > 0))
              .filter((s: any) => !cartCats.has((s.category || "").toLowerCase()))
              .slice(0, 3)
              .map((s: any) => s.id);
          }
        }
        if (pickedIds.length) {
          const { data: items } = await db
            .from("menu_items")
            .select("id,name,price,track_stock,stock_qty,is_available")
            .in("id", pickedIds)
            .eq("restaurant_id", restaurant.id);
          const byId = new Map((items || []).map((i: any) => [i.id, i]));
          checkoutSuggestions = pickedIds
            .map((id) => byId.get(id))
            .filter((s: any) => s && s.is_available && (!s.track_stock || (s.stock_qty != null && s.stock_qty > 0)))
            .slice(0, 2)
            .map((s: any) => ({ id: s.id, name: s.name, price: s.price }));
          if (checkoutSuggestions.length) {
            checkoutNote = personalized
              ? "اعرض اقتراح إضافة واحد بسطر لطيف، مثل: 'تحب تضيف [اسم] بـ [سعر] قبل ما نأكد؟'. لو الزبون رفض كمّل التأكيد فوراً ولا تكرر."
              : dataDriven
                ? "قبل التأكيد اعرض عرض أخير لطيف بسطر واحد، مثلاً: 'كثير زباين ياخذون ويا طلبهم [اسم] بـ [سعر] — أضيفه؟'. لو الزبون رفض أو سكت كمّل التأكيد فوراً ولا تكرر."
                : "قبل التأكيد اعرض اقتراح إضافة واحد بسطر لطيف، مثل: 'تحب تضيف [اسم] بـ [سعر] قبل ما نأكد؟'. لو الزبون رفض كمّل التأكيد فوراً ولا تكرر.";
          }
        }
      }
    }

    if (comboSuggestion) {
      checkoutNote = comboSuggestion.full_match
        ? `بدّل الأصناف اللي بالسلة بكومبو "${comboSuggestion.name}" يوفّر للزبون حوالي ${comboSuggestion.savings} ${restaurant.currency}. اعرض بسطر لطيف، مثل: 'لو تحوّلها كومبو "${comboSuggestion.name}" بـ ${comboSuggestion.price} توفّر ${comboSuggestion.savings} ${restaurant.currency} — أبدّلها؟'. لو وافق، أزل الأصناف المكرّرة بـ remove_from_cart ثم استدعِ add_combo_to_cart ثم preview_order. لو رفض كمّل ولا تكرر.`
        : `كومبو "${comboSuggestion.name}" بـ ${comboSuggestion.price} ${restaurant.currency} يكمّل طلب الزبون ويوفّر له تقريباً ${comboSuggestion.savings} ${restaurant.currency} مقارنة بأخذها مفرّقة. اعرض بسطر واحد، مثل: 'بدل ما تاخذها مفرّقة، كومبو "${comboSuggestion.name}" بـ ${comboSuggestion.price} يطلعلك أوفر بـ ${comboSuggestion.savings} — تحوّلها كومبو؟'. لو وافق، استبدل الأصناف المكرّرة وأضِف الكومبو ثم preview_order. لو رفض كمّل ولا تكرر.`;
    }

    const offeredSomething = !!comboSuggestion || checkoutSuggestions.length > 0;

    const newMeta = {
      ...(conv.meta || {}),
      pending_confirmation: { token, fp, created_at: new Date().toISOString() },
      ...(offeredSomething ? { checkout_upsell_offered: true } : {}),
    };
    await db.from("conversations").update({ meta: newMeta, state: "confirm" }).eq("id", conv.id);
    conv.meta = newMeta;

    const lines = cart.map((c) => {
      const opts = c.selected_options?.length ? ` (${c.selected_options.map((s) => s.choice).join("، ")})` : "";
      return `• ${c.qty} × ${c.name}${opts} — ${c.qty * c.unit_price} ${restaurant.currency}`;
    }).join("\n");
    const summary = `🧾 ملخّص الطلب:\n${lines}\n\n👤 ${conv.customer_name}\n📍 ${delivery.address}\n📞 ${delivery.phone}${delivery.time ? `\n⏰ ${delivery.time}` : ""}${branch ? `\n🏬 الفرع: ${branch.name}` : ""}\n\n💰 الإجمالي: ${subtotal} ${restaurant.currency}`;
    return {
      ok: true,
      confirmation_token: token,
      summary,
      total: subtotal,
      currency: restaurant.currency,
      checkout_suggestions: checkoutSuggestions,
      combo_suggestion: comboSuggestion,
      instruction: offeredSomething
        ? `${checkoutNote} بعد رد الزبون (لو وافق نفّذ الأدوات المطلوبة ثم preview_order من جديد، لو رفض كمّل)، اعرض ملخّص الطلب حرفياً ثم اسأله: 'أأكد الطلب؟ (نعم/لا)'. لا تستدعِ submit_order إلا بعد موافقته على التأكيد.`
        : "اعرض هذا الملخّص للزبون حرفياً ثم اسأله: 'أأكد الطلب؟ (نعم/لا)'. لا تستدعِ submit_order إلا بعد ما يقول نعم/أكد/تمام.",
    };
  }

  if (name === "submit_order") {
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    if (!cart.length) return { error: "السلة فارغة" };

    // === Confirmation gate ===
    const pending = conv.meta?.pending_confirmation;
    if (!pending?.token || !pending?.fp) {
      return { error: "لازم تستدعي preview_order أولاً وتعرض الملخّص للزبون قبل الإرسال." };
    }
    if (!args.confirmation_token || args.confirmation_token !== pending.token) {
      return { error: "confirmation_token غير صحيح. استدعِ preview_order من جديد." };
    }
    const delivery = conv.delivery || {};
    const branchId = conv.meta?.branch_id || null;
    const currentFp = await sha256Hex(cartFingerprint(cart, delivery, branchId));
    if (currentFp !== pending.fp) {
      // Cart or delivery changed since preview — force a new preview
      await db.from("conversations").update({
        meta: { ...(conv.meta || {}), pending_confirmation: null },
      }).eq("id", conv.id);
      conv.meta = { ...(conv.meta || {}), pending_confirmation: null };
      return { error: "تغيّر الطلب بعد المعاينة. استدعِ preview_order من جديد وأكّد مع الزبون." };
    }
    const userOk = typeof args.user_confirmation_text === "string" && CONFIRM_RE.test(args.user_confirmation_text);
    if (!userOk) {
      return { error: "ما رصدت موافقة صريحة من الزبون. اطلب منه يقول 'نعم' أو 'أكد' بصراحة ثم أعد المحاولة." };
    }

    const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
    if (!delivery.address || !delivery.phone) {
      return { error: "ناقص العنوان أو الهاتف" };
    }
    const customerLoc = (delivery as any)?.customer_location;
    const orderMeta: Record<string, any> = {};
    if (customerLoc && Number.isFinite(customerLoc.lat) && Number.isFinite(customerLoc.lng)) {
      orderMeta.customer_location = { lat: customerLoc.lat, lng: customerLoc.lng };
    }
    const { data: order, error } = await db
      .from("orders")
      .insert({
        restaurant_id: restaurant.id,
        conversation_id: conv.id,
        branch_id: branchId,
        customer_name: conv.customer_name,
        customer_phone: delivery.phone,
        delivery_address: delivery.address,
        items: cart,
        subtotal,
        total: subtotal,
        status: "pending",
        meta: orderMeta,
      })
      .select()
      .single();

    if (error) {
      console.error("submit_order insert failed:", error);
      try { await db.from("agent_logs").insert({ restaurant_id: restaurant.id, conversation_id: conv.id, kind: "tool", tool_name: "submit_order", error: error.message, payload: { args } }); } catch (_) {}
      return { error: "ORDER_SUBMIT_FAILED", user_message: "ما كدرت أرسل الطلب الحين، جرّب مرة ثانية بعد لحظة أو اطلب التحويل لموظف." };
    }

    // Consume confirmed_order quota. If denied, cancel the order and tell the user.
    const { data: orderQuota } = await db.rpc("consume_quota", {
      _restaurant_id: restaurant.id,
      _kind: "confirmed_order",
      _ref: order.id,
    });
    if (orderQuota && (orderQuota as any).allowed === false) {
      await db.from("orders").update({ status: "cancelled", notes: "quota_exceeded" }).eq("id", order.id);
      return { error: "عذراً، المطعم وصل لحدّه الشهري من الطلبات. حاول لاحقاً." };
    }

    // Atomically decrement stock for any tracked items + alert manager on low/out
    try {
      const stockItems = (cart as CartItem[]).map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty }));
      await db.rpc("decrement_stock", { _items: stockItems });
      // Check post-decrement stock and notify owner (one alert per state-change)
      const trackedIds = stockItems.map((s) => s.menu_item_id);
      if (trackedIds.length) {
        const { data: postRows } = await db
          .from("menu_items")
          .select("id,name,track_stock,stock_qty")
          .in("id", trackedIds);
        const LOW_THRESHOLD = 3;
        const alertsState = ((restaurant as any).feature_flags?.stock_alerts) || {};
        const newState: Record<string, string> = { ...alertsState };
        const toNotify: { name: string; qty: number; level: "out" | "low" }[] = [];
        for (const r of (postRows || [])) {
          if (!(r as any).track_stock) continue;
          const qty = Number((r as any).stock_qty ?? 0);
          const level = qty <= 0 ? "out" : (qty <= LOW_THRESHOLD ? "low" : null);
          if (!level) continue;
          if (alertsState[(r as any).id] === level) continue; // already alerted at this level
          toNotify.push({ name: (r as any).name, qty, level });
          newState[(r as any).id] = level;
        }
        if (toNotify.length) {
          const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
          const ownerChat = (restaurant as any).owner_telegram_chat_id;
          if (ownerChat && LOVABLE_API_KEY && TELEGRAM_API_KEY) {
            const lines = toNotify.map((a) =>
              a.level === "out" ? `🔴 نفد: ${a.name}` : `⚠️ منخفض: ${a.name} (متبقي ${a.qty})`
            );
            fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: ownerChat,
                text: `📦 تنبيه مخزون:\n${lines.join("\n")}\n\nأعد التعبئة من لوحة التحكم.`,
              }),
            }).catch(() => {});
          }
          // Persist alert state to avoid duplicate notifications
          const mergedFlags = { ...((restaurant as any).feature_flags || {}), stock_alerts: newState };
          db.from("restaurants").update({ feature_flags: mergedFlags }).eq("id", restaurant.id).then(() => {});
        }
      }
    } catch (_) { /* don't block the order */ }

    // === Compute ETA (prep + delivery) and save to order.meta ===
    let etaMinutes = 45; // default fallback
    try {
      const branchesArr: any[] = (restaurant as any).__branches || [];
      const branchObj = branchId ? branchesArr.find((b: any) => b.id === branchId) : null;
      const prep = Number(branchObj?.current_prep_minutes) || 25;
      let deliveryEta = 20;
      const area = (delivery.area || delivery.address || "").toString().toLowerCase();
      if (branchId && area) {
        const { data: zones } = await db
          .from("delivery_zones")
          .select("area_name,eta_minutes")
          .eq("branch_id", branchId)
          .eq("is_active", true);
        const matched = (zones || []).find((z: any) => area.includes(String(z.area_name).toLowerCase()));
        if (matched && matched.eta_minutes) deliveryEta = Number(matched.eta_minutes);
      }
      etaMinutes = Math.max(15, prep + deliveryEta);
    } catch (_) { /* keep default */ }

    const confirmedAtIso = new Date().toISOString();
    await db.from("orders").update({
      meta: { eta_minutes: etaMinutes, confirmed_at: confirmedAtIso },
    }).eq("id", order.id);

    await db
      .from("conversations")
      .update({
        state: "submitted",
        cart: [],
        delivery: {},
        meta: { ...(conv.meta || {}), pending_confirmation: null, last_order_id: order.id },
      })
      .eq("id", conv.id);

    // Fire-and-forget dispatch to platform webhook
    try {
      const baseUrl = Deno.env.get("SUPABASE_URL");
      fetch(`${baseUrl}/functions/v1/orders-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      }).catch(() => {});
      // Fire-and-forget preference extraction
      fetch(`${baseUrl}/functions/v1/extract-preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conv.id, order_id: order.id }),
      }).catch(() => {});
    } catch (_) {}

    const shortId = order.id.slice(0, 8);
    const baseApp = Deno.env.get("PUBLIC_APP_URL") || "https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app";
    const trackUrl = `${baseApp}/track/${order.id}`;
    return {
      ok: true,
      order_id: order.id,
      total: subtotal,
      eta_minutes: etaMinutes,
      message: `✅ تم استلام طلبك #${shortId}.\nالتوصيل خلال ~${etaMinutes} دقيقة تقريباً.\n🔗 تتبّع طلبك: ${trackUrl}\nراح نخبرك بكل خطوة 🌹`,
    };
  }

  if (name === "schedule_order") {
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    if (!cart.length) return { error: "السلة فارغة" };
    const pending = conv.meta?.pending_confirmation;
    if (!pending?.token || !pending?.fp) {
      return { error: "لازم تستدعي preview_order أولاً وتعرض الملخّص للزبون قبل الجدولة." };
    }
    if (!args.confirmation_token || args.confirmation_token !== pending.token) {
      return { error: "confirmation_token غير صحيح. استدعِ preview_order من جديد." };
    }
    const delivery = conv.delivery || {};
    const branchId = conv.meta?.branch_id || null;
    const currentFp = await sha256Hex(cartFingerprint(cart, delivery, branchId));
    if (currentFp !== pending.fp) {
      await db.from("conversations").update({ meta: { ...(conv.meta || {}), pending_confirmation: null } }).eq("id", conv.id);
      conv.meta = { ...(conv.meta || {}), pending_confirmation: null };
      return { error: "تغيّر الطلب بعد المعاينة. استدعِ preview_order من جديد وأكّد مع الزبون." };
    }
    const userOk = typeof args.user_confirmation_text === "string" && CONFIRM_RE.test(args.user_confirmation_text);
    if (!userOk) {
      return { error: "ما رصدت موافقة صريحة من الزبون. اطلب منه يقول 'نعم/أكد/تمام' بصراحة ثم أعد المحاولة." };
    }
    const when = new Date(String(args.scheduled_for || ""));
    if (isNaN(when.getTime())) return { error: "scheduled_for غير صالح. لازم ISO 8601 مع منطقة زمنية." };
    const minMs = Date.now() + 15 * 60 * 1000;
    const maxMs = Date.now() + 14 * 24 * 60 * 60 * 1000;
    if (when.getTime() < minMs) return { error: "الموعد لازم يكون بعد 15 دقيقة على الأقل من الآن. اقترح وقت أبعد." };
    if (when.getTime() > maxMs) return { error: "الموعد بعيد جداً (أقصى حد أسبوعين). اقترح وقت أقرب." };
    if (!delivery.address || !delivery.phone) return { error: "ناقص العنوان أو الهاتف" };

    const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const { data: order, error } = await db
      .from("orders")
      .insert({
        restaurant_id: restaurant.id,
        conversation_id: conv.id,
        branch_id: branchId,
        customer_name: conv.customer_name,
        customer_phone: delivery.phone,
        delivery_address: delivery.address,
        items: cart,
        subtotal,
        total: subtotal,
        status: "scheduled",
        scheduled_for: when.toISOString(),
        notes: args.scheduled_for_human ? `مجدول: ${args.scheduled_for_human}` : null,
      })
      .select()
      .single();
    if (error) {
      console.error("schedule_order insert failed:", error);
      try { await db.from("agent_logs").insert({ restaurant_id: restaurant.id, conversation_id: conv.id, kind: "tool", tool_name: "schedule_order", error: error.message, payload: { args } }); } catch (_) {}
      return { error: "ORDER_SCHEDULE_FAILED", user_message: "ما كدرت أحجز الطلب الحين، جرّب مرة ثانية أو اطلب التحويل لموظف." };
    }

    await db
      .from("conversations")
      .update({
        state: "submitted",
        cart: [],
        delivery: {},
        meta: { ...(conv.meta || {}), pending_confirmation: null, last_order_id: order.id },
      })
      .eq("id", conv.id);

    // Fire-and-forget preference extraction
    try {
      const baseUrl = Deno.env.get("SUPABASE_URL");
      fetch(`${baseUrl}/functions/v1/extract-preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conv.id, order_id: order.id }),
      }).catch(() => {});
    } catch (_) {}



    return {
      ok: true,
      order_id: order.id,
      scheduled_for: when.toISOString(),
      scheduled_for_human: args.scheduled_for_human || when.toISOString(),
      total: subtotal,
      message: `تم حجز الطلب ✅ راح يوصل قبل ${args.scheduled_for_human || when.toISOString()} إن شاء الله.`,
    };
  }

  if (name === "cancel_order" || name === "modify_order") {
    const lastOrderId = conv.meta?.last_order_id;
    if (!lastOrderId) {
      return { error: "ما عندي طلب سابق بهذي المحادثة لألغيه/أعدله." };
    }
    const { data: ord } = await db
      .from("orders")
      .select("id,status,items,customer_phone,delivery_address,branch_id,scheduled_for,total")
      .eq("id", lastOrderId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (!ord) return { error: "ما لكيت الطلب." };
    const cancellable = ord.status === "pending" || ord.status === "scheduled";
    if (!cancellable) {
      return {
        error: "الطلب صار قيد التحضير ولا أكدر ألغيه/أعدله تلقائياً.",
        user_message: "للأسف الطلب صار قيد التحضير من الفرع، راح أحوّلك لموظف بشري.",
        needs_handoff: true,
      };
    }
    const items = Array.isArray(ord.items) ? ord.items : [];

    // Cancel the order
    const reason = name === "cancel_order"
      ? (String(args.reason || "").trim() || "إلغاء بطلب الزبون")
      : "تعديل بطلب الزبون";
    await db.from("orders")
      .update({ status: "cancelled", notes: reason })
      .eq("id", ord.id);

    // Restock tracked items (only if was pending — scheduled didn't decrement)
    if (ord.status === "pending" && items.length) {
      try {
        for (const it of items) {
          const mid = (it as any).menu_item_id;
          const qty = Number((it as any).qty || 0);
          if (!mid || qty <= 0) continue;
          const { data: mi } = await db
            .from("menu_items")
            .select("id,track_stock,stock_qty")
            .eq("id", mid)
            .maybeSingle();
          if (mi && (mi as any).track_stock) {
            const newQty = Number((mi as any).stock_qty || 0) + qty;
            await db.from("menu_items").update({ stock_qty: newQty }).eq("id", mid);
          }
        }
      } catch (_) {}
    }

    // Notify branch via telegram (best effort)
    try {
      const branchesArr: any[] = (restaurant as any).__branches || [];
      const branch = ord.branch_id ? branchesArr.find((b: any) => b.id === ord.branch_id) : null;
      const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const shortId = String(ord.id).slice(0, 8);
      const action = name === "cancel_order" ? "❌ إلغاء طلب" : "✏️ تعديل طلب";
      const text = `${action} #${shortId}\nالزبون: ${conv.customer_name || conv.customer_handle || "—"}\nالسبب: ${reason}\nالإجمالي السابق: ${ord.total} ${restaurant.currency}`;
      const targets: string[] = [];
      if (branch?.telegram_chat_id) targets.push(branch.telegram_chat_id);
      if ((restaurant as any).owner_telegram_chat_id) targets.push((restaurant as any).owner_telegram_chat_id);
      if (LOVABLE_API_KEY && TELEGRAM_API_KEY && targets.length) {
        await Promise.all(targets.map((chat_id) =>
          fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TELEGRAM_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ chat_id, text }),
          }).catch(() => {}),
        ));
      }
    } catch (_) {}

    if (name === "cancel_order") {
      await db.from("conversations").update({
        meta: { ...(conv.meta || {}), pending_confirmation: null, last_order_id: null },
        state: "greeting",
      }).eq("id", conv.id);
      return {
        ok: true,
        message: `تم إلغاء طلبك ✅\nإذا تحب تطلب من جديد، أنا موجود.`,
      };
    }

    // modify_order: restore items to cart and let agent re-collect
    const restoredCart: CartItem[] = items.map((it: any) => ({
      menu_item_id: it.menu_item_id,
      name: it.name,
      qty: Number(it.qty || 1),
      unit_price: Number(it.unit_price || 0),
      notes: it.notes,
      selected_options: it.selected_options,
    }));
    const restoredDelivery: Delivery = {
      address: ord.delivery_address || conv.delivery?.address,
      phone: ord.customer_phone || conv.delivery?.phone,
    };
    conv.cart = restoredCart;
    conv.delivery = restoredDelivery;
    await db.from("conversations").update({
      cart: restoredCart,
      delivery: restoredDelivery,
      state: "collecting_items",
      meta: { ...(conv.meta || {}), pending_confirmation: null, last_order_id: null },
    }).eq("id", conv.id);

    const summary = restoredCart.map((c) => `• ${c.qty} × ${c.name}`).join("\n");
    return {
      ok: true,
      cart: restoredCart,
      message: `رجعت أصناف الطلب للسلة:\n${summary}\nشنو تحب تعدّل؟ (تضيف/تحذف/تغيّر الكمية)`,
      instruction: "بعد ما يخلّص الزبون التعديلات، استدعِ preview_order من جديد ثم submit_order أو schedule_order حسب الحالة.",
    };
  }



  if (name === "resolve_branch") {
    const addr = String(args.address || "").trim().toLowerCase();
    const branches: any[] = (restaurant.__branches || []).filter((b: any) => b.is_active);
    if (!branches.length) return { error: "ما اكو فروع مفعّلة" };
    if (branches.length === 1) {
      const b = branches[0];
      await db.from("conversations").update({ meta: { ...(conv.meta || {}), branch_id: b.id } }).eq("id", conv.id);
      conv.meta = { ...(conv.meta || {}), branch_id: b.id };
      return { ok: true, branch: { id: b.id, name: b.name, address: b.address, min_order: b.min_order, open_hours: b.open_hours } };
    }
    const matches = branches.filter((b: any) => Array.isArray(b.delivery_areas) && b.delivery_areas.some((a: string) => addr.includes(String(a).toLowerCase())));
    if (matches.length === 0) {
      const allAreas = branches.flatMap((b: any) => (Array.isArray(b.delivery_areas) ? b.delivery_areas : []));
      return { error: "ما اكو فرع يخدم هذي المنطقة", served_areas: allAreas };
    }
    const chosen = matches[0];
    await db.from("conversations").update({ meta: { ...(conv.meta || {}), branch_id: chosen.id } }).eq("id", conv.id);
    conv.meta = { ...(conv.meta || {}), branch_id: chosen.id };
    return { ok: true, branch: { id: chosen.id, name: chosen.name, address: chosen.address, min_order: chosen.min_order, open_hours: chosen.open_hours }, alternatives: matches.slice(1).map((b: any) => ({ id: b.id, name: b.name })) };
  }

  if (name === "handoff_to_human") {
    const reason = String(args.reason || "").trim() || "الزبون يحتاج موظف";
    await db
      .from("conversations")
      .update({
        state: "handoff",
        is_bot_paused: true,
        meta: { ...(conv.meta || {}), handoff_reason: reason, handoff_at: new Date().toISOString() },
      })
      .eq("id", conv.id);
    // Notify all active branches via Telegram
    try {
      const branches: any[] = (restaurant.__branches || []).filter((b: any) => b.is_active && b.telegram_chat_id);
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
      if (LOVABLE_API_KEY && TELEGRAM_API_KEY && branches.length) {
        const who = conv.customer_name || conv.customer_handle || "زبون";
        const text = `🧑‍💼 محادثة تحتاج موظف\nالزبون: ${who}\nالسبب: ${reason}\n— البوت متوقّف بهذي المحادثة حتى يستلمها موظف من لوحة التحكم.`;
        await Promise.all(branches.map((b) =>
          fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TELEGRAM_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ chat_id: b.telegram_chat_id, text }),
          }).catch(() => {}),
        ));
      }
    } catch (_) { /* never block */ }
    return { ok: true, message: "تم تحويلك لفريق المطعم 🙏 راح يتواصلون وياك بأقرب وقت." };
  }

  if (name === "create_complaint") {
    const type = String(args.type || "other");
    const note = String(args.note || "").trim().slice(0, 500);
    const res = await escalateComplaint(db, conv, restaurant, type, note);
    return {
      ...res,
      message: "وصلت شكوتك للمسؤول 🙏 راح يتواصل وياك بأقرب وقت.",
      stop: true,
    };
  }




  if (name === "show_menu") {
    // If the restaurant uploaded menu images, send them all (no captions, no text).
    const menuImgs: string[] = Array.isArray((restaurant as any).menu_image_urls)
      ? (restaurant as any).menu_image_urls.filter(Boolean)
      : [];
    if ((restaurant as any).menu_image_url && menuImgs.length === 0) {
      menuImgs.push((restaurant as any).menu_image_url);
    }
    if (menuImgs.length > 0 && !args.category) {
      for (const url of menuImgs) media.push({ photo_url: url, caption: "" });
      return {
        ok: true,
        mode: "image_only",
        count: menuImgs.length,
        note: "تم إرسال صور المنيو للزبون. لا تكتب أي قائمة أصناف أو أسعار، اكتفِ بجملة قصيرة جداً مثل 'تفضل المنيو 👇'.",
      };
    }

    let q = db
      .from("menu_items")
      .select("id,name,description,price,category,image_url,is_available,track_stock,stock_qty")
      .eq("restaurant_id", restaurant.id)
      .eq("is_available", true)
      .order("category", { nullsFirst: false })
      .order("name");
    if (args.category) q = q.ilike("category", `%${args.category}%`);
    const { data: items } = await q;
    const list = (items ?? []).filter((it: any) => !it.track_stock || (it.stock_qty != null && it.stock_qty > 0));
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

  if (name === "recall_customer") {
    // Backward-compat: profile is now injected into system prompt automatically.
    try {
      const { data } = await db.rpc("recall_customer", { _conversation_id: conv.id });
      return data ?? { found: false };
    } catch (err: any) {
      return { found: false, error: err?.message || "recall_failed" };
    }
  }

  if (name === "reorder_last") {
    try {
      const { data: profile } = await db.rpc("recall_customer", { _conversation_id: conv.id });
      const recent = (profile && Array.isArray((profile as any).recent_orders)) ? (profile as any).recent_orders : [];
      if (!recent.length) return { error: "ما عندك طلبات سابقة محفوظة. عذراً، تحب تشوف المنيو؟" };
      const last = recent[0];
      const lastItems: any[] = Array.isArray(last.items) ? last.items : [];
      if (!lastItems.length) return { error: "آخر طلب فارغ. هل تحب تشوف المنيو؟" };

      // Validate availability + stock now
      const ids = lastItems.map((i) => i.menu_item_id).filter(Boolean);
      const { data: current } = await db
        .from("menu_items")
        .select("id,name,price,is_available,track_stock,stock_qty")
        .in("id", ids)
        .eq("restaurant_id", restaurant.id);
      const byId = new Map((current || []).map((r: any) => [r.id, r]));

      const newCart: CartItem[] = [];
      const skipped: string[] = [];
      for (const it of lastItems) {
        const row: any = byId.get(it.menu_item_id);
        if (!row || !row.is_available) { skipped.push(it.name || "صنف"); continue; }
        if (row.track_stock && (row.stock_qty == null || row.stock_qty < (it.qty || 1))) {
          skipped.push(`${row.name} (نافد)`); continue;
        }
        newCart.push({
          menu_item_id: row.id,
          name: row.name,
          qty: Number(it.qty || 1),
          unit_price: Number(row.price),
          notes: it.notes || undefined,
          selected_options: Array.isArray(it.selected_options) ? it.selected_options : undefined,
        });
      }

      if (!newCart.length) return { error: "للأسف كل أصناف آخر طلب غير متوفرة الآن. تحب تشوف المنيو؟" };

      // Restore last delivery info
      const restoredDelivery: any = {};
      if (last.delivery_address) restoredDelivery.address = last.delivery_address;
      if ((profile as any).last_phone) restoredDelivery.phone = (profile as any).last_phone;

      await db.from("conversations").update({
        cart: newCart,
        delivery: { ...(conv.delivery || {}), ...restoredDelivery },
        state: "ordering",
        customer_name: conv.customer_name || (profile as any).name || null,
        meta: { ...(conv.meta || {}), pending_confirmation: null },
      }).eq("id", conv.id);
      conv.cart = newCart;
      conv.delivery = { ...(conv.delivery || {}), ...restoredDelivery };

      return {
        ok: true,
        restored_items: newCart.length,
        skipped,
        total: newCart.reduce((s, i) => s + i.qty * i.unit_price, 0),
        delivery: restoredDelivery,
        note: "تم استرجاع آخر طلب للزبون. اعرض ملخّص قصير (الأصناف + المجموع + العنوان لو موجود)، اذكر الأصناف المتخطّاة إن وُجدت، ثم استدعِ preview_order للتأكيد.",
      };
    } catch (err: any) {
      return { error: err?.message || "reorder failed" };
    }
  }


  if (name === "show_combos") {
    const { data: combos } = await db
      .from("combos")
      .select("id,name,description,price,image_url,items")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const list = combos ?? [];
    for (const c of list) {
      if (c.image_url) {
        const caption = `🎁 ${c.name}\n${c.price} ${restaurant.currency}${c.description ? `\n${c.description}` : ""}`;
        media.push({ photo_url: c.image_url, caption });
      }
    }
    return {
      ok: true,
      count: list.length,
      combos: list.map((c: any) => ({ id: c.id, name: c.name, price: c.price, description: c.description })),
      note: list.length === 0
        ? "ما اكو كومبوهات حالياً."
        : (media.length ? "صور الكومبوهات تجهّزت. اكتفِ بجملة قصيرة." : "اعرض الكومبوهات نصياً مع السعر."),
    };
  }

  if (name === "add_combo_to_cart") {
    const { data: combo, error } = await db
      .from("combos")
      .select("id,name,price,items,is_active")
      .eq("id", args.combo_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (error || !combo) return { error: "كومبو غير موجود" };
    if (!combo.is_active) return { error: "هذا الكومبو غير متوفر حالياً" };
    const comboItems: { menu_item_id: string; qty: number }[] = Array.isArray(combo.items) ? combo.items : [];
    if (!comboItems.length) return { error: "الكومبو فارغ" };
    const qty = Math.max(1, Number(args.qty || 1));

    // Fetch component items
    const ids = comboItems.map((i) => i.menu_item_id);
    const { data: rows } = await db
      .from("menu_items")
      .select("id,name,price,is_available,track_stock,stock_qty")
      .in("id", ids);
    const itemMap = new Map((rows || []).map((r: any) => [r.id, r]));

    // Stock + availability check
    for (const ci of comboItems) {
      const it: any = itemMap.get(ci.menu_item_id);
      if (!it || !it.is_available) return { error: `الصنف "${it?.name || ci.menu_item_id}" داخل الكومبو غير متوفر حالياً.` };
      if (it.track_stock && (it.stock_qty == null || it.stock_qty < ci.qty * qty)) {
        return { error: `المتوفر من "${it.name}" غير كافٍ للكومبو حالياً.` };
      }
    }

    // Price allocation: distribute combo price across components proportionally to MSRP
    const msrpTotal = comboItems.reduce((s, ci) => s + Number((itemMap.get(ci.menu_item_id) as any)?.price || 0) * ci.qty, 0) || 1;
    const comboUnitPrice = Number(combo.price);
    const cart: CartItem[] = Array.isArray(conv.cart) ? [...conv.cart] : [];
    for (const ci of comboItems) {
      const it: any = itemMap.get(ci.menu_item_id);
      const msrp = Number(it.price) * ci.qty;
      const allocated = (msrp / msrpTotal) * comboUnitPrice; // per single combo
      const unit = allocated / ci.qty;
      cart.push({
        menu_item_id: ci.menu_item_id,
        name: `${it.name} (ضمن كومبو: ${combo.name})`,
        qty: ci.qty * qty,
        unit_price: Math.round(unit),
        notes: `combo:${combo.id}`,
      });
    }
    conv.cart = cart;
    await db.from("conversations").update({ cart, state: "collecting_items" }).eq("id", conv.id);
    return {
      ok: true,
      combo: { id: combo.id, name: combo.name, price: comboUnitPrice * qty },
      cart,
      total: cart.reduce((s, i) => s + i.qty * i.unit_price, 0),
    };
  }

  if (name === "suggest_upsell") {
    const { data: src } = await db
      .from("menu_items")
      .select("id,upsell_category,category")
      .eq("id", args.for_menu_item_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    // Manual setting wins; otherwise infer from the item's own category.
    const manualCat = (src as any)?.upsell_category as string | null | undefined;
    const srcCat = (src as any)?.category as string | null | undefined;
    const candidates: string[] = manualCat ? [manualCat] : inferUpsellCategory(srcCat);

    // Don't suggest items already in the cart, and exclude the source item itself.
    const cart: CartItem[] = Array.isArray(conv.cart) ? conv.cart : [];
    const inCartIds = new Set(cart.map((c) => c.menu_item_id));
    inCartIds.add(args.for_menu_item_id);

    let suggestions: any[] = [];
    let dataDriven = false;

    // 1) Try frequently-bought-together from past orders.
    try {
      const fbt = await loadFBT(db, restaurant.id);
      if (fbt) {
        const fbtRanked = getFrequentlyBoughtWith(fbt, args.for_menu_item_id);
        const fbtIds = fbtRanked.map((x) => x.menu_item_id).filter((id) => !inCartIds.has(id));
        if (fbtIds.length) {
          const { data: items } = await db
            .from("menu_items")
            .select("id,name,price,category,track_stock,stock_qty,is_available")
            .in("id", fbtIds)
            .eq("restaurant_id", restaurant.id);
          const byId = new Map((items || []).map((i: any) => [i.id, i]));
          const ranked = fbtRanked
            .map((r) => byId.get(r.menu_item_id))
            .filter((s: any) => s && s.is_available && (!s.track_stock || (s.stock_qty != null && s.stock_qty > 0)));
          if (ranked.length) {
            suggestions = ranked;
            dataDriven = true;
          }
        }
      }
    } catch (_) { /* fall through */ }

    // 2) Fallback: manual upsell_category, then inferred categories.
    if (!suggestions.length) {
      for (const cat of candidates) {
        const { data } = await db
          .from("menu_items")
          .select("id,name,price,category,track_stock,stock_qty")
          .eq("restaurant_id", restaurant.id)
          .eq("is_available", true)
          .ilike("category", `%${cat}%`)
          .order("price", { ascending: true })
          .limit(5);
        if (data && data.length) {
          const usable = data.filter((s: any) => !srcCat || (s.category || "").toLowerCase() !== srcCat.toLowerCase());
          if (usable.length) { suggestions = usable; break; }
          if (!suggestions.length) suggestions = data;
        }
      }
    }

    const filtered = suggestions
      .filter((s: any) => !inCartIds.has(s.id))
      .filter((s: any) => !s.track_stock || (s.stock_qty != null && s.stock_qty > 0))
      .slice(0, 3)
      .map((s: any) => ({ id: s.id, name: s.name, price: s.price }));

    return {
      ok: true,
      suggestions: filtered,
      data_driven: dataDriven,
      note: filtered.length
        ? (dataDriven
            ? "هذا اقتراح شائع جداً مع هذا الصنف بناءً على طلبات سابقة. اعرضه بثقة بسطر قصير، مثلاً: 'الناس عادة ياخذونه ويا [اسم]، تحب نضيفه بـ [سعر]؟'. لا تلحّ لو الزبون رفض."
            : "اعرض اقتراحاً واحداً فقط بسطر لطيف ومختصر، مثل: 'تحب نضيفلك [اسم] بـ [سعر]؟'. لا تلحّ لو الزبون رفض.")
        : "ما اكو اقتراح مناسب الآن. كمّل الطلب بشكل طبيعي.",
    };
  }

  if (name === "send_restaurant_location") {
    const branchId = conv.meta?.branch_id;
    const branches: any[] = (restaurant as any).__branches || [];
    const branch = branchId ? branches.find((b: any) => b.id === branchId) : null;
    const src: any = branch || restaurant;
    const lat = Number(src.latitude);
    const lng = Number(src.longitude);
    const url = src.google_maps_url || (Number.isFinite(lat) && Number.isFinite(lng) ? `https://maps.google.com/?q=${lat},${lng}` : null);
    if (!url) {
      return { error: "no_location_set", user_message: "موقعنا على الخريطة مو محدد بعد، تكدر تتصل بينا للاستفسار." };
    }
    const label = branch
      ? (/^(فرع|الفرع)\b/.test(String(branch.name).trim()) ? branch.name : `فرع ${branch.name}`)
      : restaurant.name;
    const isTelegram = conv.channel === "telegram";
    if (isTelegram && Number.isFinite(lat) && Number.isFinite(lng)) {
      actions.push({ type: "send_location", lat, lng, title: label, address: src.address || null });
    }
    return {
      ok: true, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, url, label,
      note: isTelegram && Number.isFinite(lat) && Number.isFinite(lng)
        ? `تم إرسال الموقع كخريطة. اكتب سطر قصير فقط مثل: "هذا موقع ${label} 📍".`
        : `اكتب للزبون: "هذا موقع ${label} 📍\n${url}".`,
    };
  }

  if (name === "request_customer_location") {
    const isTelegram = conv.channel === "telegram";
    if (isTelegram) {
      actions.push({ type: "request_location", text: "شارك موقعك من الزر اللي تحت 👇" });
    }
    return {
      ok: true,
      note: isTelegram
        ? "ظهرله زر مشاركة الموقع. لا ترسل نص إضافي — الزر يكفي."
        : "اكتب للزبون: 'دزلنا موقعك على Google Maps لو اكتبلنا اسم الشارع والمنطقة بالتفصيل.'",
    };
  }

  return { error: "unknown tool" };
}


async function callModelOnce(model: string, messages: any[], tools: any) {
  const r = await retryFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
  }, { attempts: 3, label: `ai:${model}` });

  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("payment_required");
  if (!r.ok) throw new Error(`model error ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function callModel(messages: any[], tools: any) {
  try {
    return await callModelOnce(MODEL, messages, tools);
  } catch (err: any) {
    const m = err?.message || "";
    // Only fall back on transient/server failures, not on quota/billing/4xx
    if (m === "rate_limited" || m === "payment_required") throw err;
    if (FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
      console.warn(`[agent] primary model failed (${m}), trying fallback ${FALLBACK_MODEL}`);
      return await callModelOnce(FALLBACK_MODEL, messages, tools);
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runStartedAt = Date.now();
  let runRestaurantId: string | null = null;
  let runConversationId: string | null = null;
  try {
    const { conversation_id, image_url } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id required" }, 400);
    runConversationId = conversation_id;
    const db = admin();


    const { data: conv, error: e1 } = await db
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();
    if (e1 || !conv) return json({ error: "conversation not found" }, 404);

    // Human handoff: if owner paused the bot, don't run the LLM at all.
    // But ping the owner/branch so they actually see the customer is still messaging,
    // throttled to once every 5 minutes per conversation to avoid spam.
    if (conv.is_bot_paused) {
      try {
        const meta = (conv.meta || {}) as Record<string, any>;
        const lastPingAt = meta.last_handoff_ping_at ? new Date(meta.last_handoff_ping_at).getTime() : 0;
        const PING_THROTTLE_MS = 5 * 60 * 1000;
        if (Date.now() - lastPingAt > PING_THROTTLE_MS) {
          const { data: rest } = await db
            .from("restaurants")
            .select("id,name,owner_telegram_chat_id")
            .eq("id", conv.restaurant_id)
            .maybeSingle();
          const { data: brs } = await db
            .from("branches")
            .select("telegram_chat_id")
            .eq("restaurant_id", conv.restaurant_id)
            .eq("is_active", true);
          const { data: lastMsgs } = await db
            .from("messages")
            .select("content,role,created_at")
            .eq("conversation_id", conversation_id)
            .eq("role", "user")
            .order("created_at", { ascending: false })
            .limit(1);
          const lastText = (lastMsgs?.[0]?.content || "").toString().slice(0, 300);

          const chats = new Set<string>();
          if (rest?.owner_telegram_chat_id) chats.add(rest.owner_telegram_chat_id);
          (brs || []).forEach((b: any) => { if (b.telegram_chat_id) chats.add(b.telegram_chat_id); });

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
          if (LOVABLE_API_KEY && TELEGRAM_API_KEY && chats.size) {
            const who = conv.customer_name || conv.customer_handle || "زبون";
            const text = `⏰ زبون لسه ينتظر رد بعد التحويل\nالمطعم: ${rest?.name || ""}\nالزبون: ${who} (${conv.channel})\nآخر رسالة: "${lastText || "—"}"\nافتح المحادثة من لوحة التحكم وردّ عليه.`;
            await Promise.all(Array.from(chats).map((chat) =>
              fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                  "X-Connection-Api-Key": TELEGRAM_API_KEY,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ chat_id: chat, text }),
              }).catch(() => {}),
            ));
            await db.from("conversations").update({
              meta: { ...meta, last_handoff_ping_at: new Date().toISOString() },
            }).eq("id", conversation_id);
          }
        }
      } catch (e) {
        console.error("handoff ping failed:", e);
      }
      return json({ reply: "", state: conv.state, media: [], skipped: "bot_paused" });
    }

    const { data: restaurant, error: e2 } = await db
      .from("restaurants")
      .select("*")
      .eq("id", conv.restaurant_id)
      .single();
    if (e2 || !restaurant) return json({ error: "restaurant not found" }, 404);
    runRestaurantId = restaurant.id;


    // ===== Quota gate: check subscription + consume one AI reply =====
    const { data: quotaRes, error: quotaErr } = await db.rpc("consume_quota", {
      _restaurant_id: restaurant.id,
      _kind: "ai_reply",
      _ref: conversation_id,
    });
    if (quotaErr) {
      console.error("consume_quota error:", quotaErr);
    } else if (quotaRes && (quotaRes as any).allowed === false) {
      const reason = (quotaRes as any).reason;
      console.log("Bot blocked for restaurant", restaurant.id, "reason:", reason);
      // Bot stops responding. Owner sees this in dashboard.
      return json({ reply: "", state: conv.state, media: [], skipped: "quota_blocked", reason });
    }

    // Load branches for this restaurant (used by resolve_branch tool + system prompt)
    const { data: branchesData } = await db
      .from("branches")
      .select("id,name,address,phone,delivery_areas,open_hours,min_order,is_active,telegram_chat_id,google_maps_url,latitude,longitude")
      .eq("restaurant_id", restaurant.id);
    const branches = branchesData ?? [];
    (restaurant as any).__branches = branches;

    // Customer memory is always on. Eagerly fetch the profile and inject it into the system prompt.
    let customerProfile: any = { found: false };
    try {
      const { data: profileData } = await db.rpc("recall_customer", { _conversation_id: conversation_id });
      if (profileData) customerProfile = profileData;
    } catch (err) {
      console.error("recall_customer eager fetch failed:", err);
    }
    // Drop the legacy recall_customer tool — profile is already injected. Keep reorder_last + everything else.
    const activeTools = (TOOLS as readonly any[]).filter((t: any) => t.function?.name !== "recall_customer");


    // Load latest 30 messages, then restore chronological order for the model.
    // Skip empty assistant turns so a bad/blank model response does not poison future context.
    const { data: history } = await db
      .from("messages")
      .select("role,content,tool_calls,tool_call_id,name,created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(30);

    // Session boundary: cut history at the most recent >3h gap so old sessions
    // (e.g. yesterday's completed order) don't leak into a fresh "شلونك" greeting.
    const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
    const ordered = (history || []).slice().reverse();
    let sessionStart = 0;
    for (let i = ordered.length - 1; i > 0; i--) {
      const cur = new Date((ordered[i] as any).created_at).getTime();
      const prev = new Date((ordered[i - 1] as any).created_at).getTime();
      if (cur - prev > SESSION_GAP_MS) { sessionStart = i; break; }
    }
    const cleanHistory = ordered
      .slice(sessionStart)
      .filter((m) => {
        const hasContent = typeof m.content === "string" && m.content.trim().length > 0;
        const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
        if (m.role === "assistant") return hasContent || hasToolCalls;
        if (m.role === "tool") return hasContent && !!m.tool_call_id;
        return hasContent;
      });

    const llmMessages: any[] = [
      { role: "system", content: systemPrompt(restaurant, conv, branches, customerProfile) },
      ...cleanHistory.map((m) => {
        const base: any = { role: m.role, content: m.content };
        if (m.tool_calls) base.tool_calls = m.tool_calls;
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
        if (m.name) base.name = m.name;
        return base;
      }),
    ];

    // Vision: if an image came with this turn, attach it to the latest user message
    if (image_url && typeof image_url === "string") {
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        const m = llmMessages[i];
        if (m.role === "user") {
          const txt = typeof m.content === "string" ? m.content : "";
          const visionInstruction =
            "صورة من الزبون. افحصها بدقة واستخرج: رقم الطلب إن وُجد، الأصناف والكميات والإضافات، العنوان/الهاتف/الاسم إن ظهروا. طابق الأصناف عبر search_menu قبل add_to_cart. لخّص ما فهمت بسطر واحد ثم اطلب توضيحاً واحداً فقط للمعلومة الناقصة الأهم (مثلاً العنوان أو التأكيد). لا تسأل أكثر من سؤال واحد.";
          m.content = [
            { type: "text", text: txt ? `${txt}\n\n[${visionInstruction}]` : visionInstruction },
            { type: "image_url", image_url: { url: image_url } },
          ];
          break;
        }
      }
    }

    const media: MediaItem[] = [];
    const actions: any[] = [];
    let finalText = "";
    let quickReplies: string[] = [];
    const loopStartedAt = Date.now();

    // === /cancel shortcut: clear cart + pending confirmation without calling the model ===
    const lastUserMsg = [...cleanHistory].reverse().find((m) => m.role === "user");
    const lastUserText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content.trim().toLowerCase() : "";
    if (["/cancel", "الغاء", "إلغاء", "الغاء الطلب", "إلغاء الطلب", "cancel"].includes(lastUserText)) {
      await db.from("conversations").update({
        cart: [],
        delivery: {},
        state: "idle",
        meta: { ...(conv.meta || {}), pending_confirmation: null },
      }).eq("id", conversation_id);
      const reply = "تم إلغاء طلبك. متى ما تحب نبدأ من جديد، أنا موجود 🌹";
      await db.from("messages").insert({ conversation_id, role: "assistant", content: reply });
      return json({ reply, state: "idle", media: [], quick_replies: ["📋 المنيو"] });
    }

    // === Complaint keyword shortcut: escalate, stop bot, no LLM call ===
    const rawLastUserText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content.trim() : "";
    const complaintType = detectComplaint(rawLastUserText);
    if (complaintType) {
      await escalateComplaint(db, conv, restaurant, complaintType, rawLastUserText.slice(0, 300));
      const reply = "آسفين هواي على اللي صار 🙏 وصلت شكوتك للمسؤول وراح يتواصل وياك خلال دقائق.";
      await db.from("messages").insert({ conversation_id, role: "assistant", content: reply });
      return json({ reply, state: "handoff", media: [], quick_replies: [] });
    }



    // === "new order" shortcut: clear cart so returning customer starts fresh ===
    const newOrderTriggers = [
      "طلب جديد", "اطلب جديد", "ابدأ من جديد", "ابدا من جديد", "من جديد",
      "ريستارت", "اعادة", "إعادة", "نظف السلة", "نظّف السلة", "افرغ السلة", "أفرغ السلة",
      "restart", "new order", "start over", "reset", "/new", "/reset",
    ];
    if (newOrderTriggers.some((t) => lastUserText === t || lastUserText.startsWith(t + " "))) {
      await db.from("conversations").update({
        cart: [],
        delivery: {},
        state: "collecting_items",
        meta: { ...(conv.meta || {}), pending_confirmation: null },
      }).eq("id", conversation_id);
      const reply = "تمام، بدينا من جديد 🌹 شنو تحب تطلب؟";
      await db.from("messages").insert({ conversation_id, role: "assistant", content: reply });
      return json({ reply, state: "collecting_items", media: [], quick_replies: ["📋 المنيو"] });
    }

    // === "where is my order" shortcut: respond with live status + ETA ===
    const trackTriggers = [
      "وين طلبي", "وين الطلب", "شصاير بطلبي", "طلبي شصاير", "طلبي وين",
      "اين طلبي", "تأخر طلبي", "تاخر طلبي", "متى يوصل", "متى يجي",
      "where is my order", "where's my order", "track order", "order status",
    ];
    if (trackTriggers.some((t) => lastUserText.includes(t))) {
      const { data: lastOrder } = await db
        .from("orders")
        .select("id,status,total,created_at,meta")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastOrder) {
        const reply = "ما لكيت لك طلب فعّال 🤔 تحب نسوي طلب جديد؟";
        await db.from("messages").insert({ conversation_id, role: "assistant", content: reply });
        return json({ reply, state: conv.state, media: [], quick_replies: ["📋 المنيو"] });
      }
      const shortId = String(lastOrder.id).slice(0, 8);
      const etaMin = Number((lastOrder.meta as any)?.eta_minutes) || 45;
      const confirmedAt = (lastOrder.meta as any)?.confirmed_at || lastOrder.created_at;
      const elapsedMin = Math.floor((Date.now() - new Date(confirmedAt).getTime()) / 60000);
      const remainingMin = Math.max(0, etaMin - elapsedMin);
      const overdueMin = elapsedMin - etaMin;

      let reply = "";
      switch (lastOrder.status) {
        case "pending":
        case "confirmed":
          reply = `طلبك #${shortId} مستلم وراح يبدي التحضير قريب 🌹\nالتوصيل خلال ~${remainingMin || etaMin} دقيقة.`;
          break;
        case "preparing":
          reply = `طلبك #${shortId} بالتحضير الآن 👨‍🍳\nجاهز خلال ~${remainingMin} دقيقة تقريباً.`;
          break;
        case "out_for_delivery":
          reply = `طلبك #${shortId} بالطريق إليك 🛵\nيوصلك خلال ~${Math.max(5, remainingMin)} دقيقة.`;
          break;
        case "completed":
          reply = `طلبك #${shortId} تسلّم قبل شوية 🙏\nإذا في أي مشكلة كلّي بصراحة.`;
          break;
        case "cancelled":
          reply = `طلبك #${shortId} ملغي ❌\nتحب نسوي طلب جديد؟`;
          break;
        case "scheduled":
          reply = `طلبك #${shortId} مجدول لوقت لاحق ⏰`;
          break;
        default:
          reply = `طلبك #${shortId} — الحالة: ${lastOrder.status}`;
      }
      if (overdueMin >= 10 && !["completed", "cancelled"].includes(lastOrder.status)) {
        reply += `\n\nأعتذر على التأخير 🙏 راح أراجع المطبخ وأرد عليك خلال دقائق.`;
        // Notify branch/owner about the customer asking
        try {
          const branchesArr: any[] = (restaurant as any).__branches || [];
          const branchChat = (conv.meta as any)?.branch_id
            ? branchesArr.find((b: any) => b.id === (conv.meta as any).branch_id)?.telegram_chat_id
            : null;
          const ownerChat = (restaurant as any).owner_telegram_chat_id;
          const notifyChat = branchChat || ownerChat;
          const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
          if (notifyChat && LOVABLE_API_KEY && TELEGRAM_API_KEY) {
            const who = conv.customer_name || conv.customer_handle || "زبون";
            await fetch(`https://connector-gateway.lovable.dev/telegram/sendMessage`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                chat_id: notifyChat,
                text: `⚠️ الزبون ${who} يسأل عن طلبه #${shortId}\nتأخر ${overdueMin} دقيقة عن ETA (${etaMin} دقيقة).\nالحالة: ${lastOrder.status}`,
              }),
            }).catch(() => {});
          }
        } catch (_) {}
      }
      await db.from("messages").insert({ conversation_id, role: "assistant", content: reply });
      return json({ reply, state: conv.state, media: [], quick_replies: [] });
    }


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

      const resp = await callModel(llmMessages, activeTools);
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
                runTool(db, conv, restaurant, name, args, media, actions, customerProfile),
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

          // Quick-reply buttons disabled — الزبون يرد نصياً

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


    // Phase 1 observability: log overall run summary (additive — does not affect behavior)
    try {
      await db.from("agent_logs").insert({
        conversation_id: runConversationId,
        restaurant_id: runRestaurantId,
        step: 0,
        kind: "run",
        latency_ms: Date.now() - runStartedAt,
        model: MODEL,
        payload: { reply_len: finalText.length, media_count: media.length },
      });
    } catch (_) { /* logging must never break the run */ }

    return json({ reply: finalText, state: conv.state, media, actions, quick_replies: quickReplies });
  } catch (e: any) {
    const msg = e?.message || "error";
    // Phase 1: log error to agent_logs for the owner's bot-health view
    if (runRestaurantId) {
      try {
        const db = admin();
        await db.from("agent_logs").insert({
          conversation_id: runConversationId,
          restaurant_id: runRestaurantId,
          step: 0,
          kind: "run",
          latency_ms: Date.now() - runStartedAt,
          model: MODEL,
          error: msg,
        });
      } catch (_) { /* swallow */ }
    }
    if (msg === "rate_limited") return json({ error: "rate_limited" }, 429);
    if (msg === "payment_required") return json({ error: "payment_required" }, 402);
    console.error("agent-run error:", e);
    return json({ error: msg }, 500);
  }
});

