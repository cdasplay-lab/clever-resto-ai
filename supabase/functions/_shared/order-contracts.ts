export type JsonObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties: false;
};

/** Provider-neutral function definition: one source for chat and Realtime. */
export type OrderToolContract = {
  name: string;
  description: string;
  parameters: JsonObjectSchema;
};

export type ChatCompletionFunctionTool = {
  type: "function";
  function: OrderToolContract;
};

/** Shape accepted in Realtime session.tools / response.tools. */
export type RealtimeFunctionTool = OrderToolContract & {
  type: "function";
};

export const ORDER_TOOL_CONTRACTS = [
  {
    name: "search_menu",
    description:
      "ابحث في منيو المطعم عن صنف يطلبه الزبون. أرجع لائحة بأقرب الأصناف. استخدمه دائماً قبل ما تضيف للسلة.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "نص بحث (اسم الصنف أو وصف)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
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
          description:
            "اختيارات الزبون لمجموعات options. كل عنصر: { group, choice }.",
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
  {
    name: "remove_from_cart",
    description: "احذف صنف من السلة عبر menu_item_id.",
    parameters: {
      type: "object",
      properties: { menu_item_id: { type: "string" } },
      required: ["menu_item_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_cart_summary",
    description: "أرجع السلة الحالية مع الإجمالي.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "set_delivery_info",
    description:
      "احفظ معلومات التوصيل بعد ما يأكدها الزبون. لازم تتضمن اسم الزبون + العنوان + الهاتف. مرّر طريقة الدفع لو ذكرها الزبون (cash = نقدي عند الاستلام، card_on_delivery = بطاقة عند الاستلام).",
    parameters: {
      type: "object",
      properties: {
        customer_name: {
          type: "string",
          description: "اسم الزبون كما ذكره (مطلوب)",
        },
        address: { type: "string" },
        phone: { type: "string" },
        time: { type: "string", description: "وقت التوصيل المطلوب (نص حر)" },
        area: { type: "string" },
        payment_method: {
          type: "string",
          enum: ["cash", "card_on_delivery"],
          description:
            "طريقة الدفع: cash = نقدي عند الاستلام، card_on_delivery = بطاقة عند الاستلام.",
        },
      },
      required: ["customer_name", "address", "phone"],
      additionalProperties: false,
    },
  },
  {
    name: "preview_order",
    description:
      "اعرض ملخّص الطلب النهائي على الزبون قبل الإرسال (الأصناف + الفرع + العنوان + الهاتف + الإجمالي). يرجع لك confirmation_token ونص ملخّص جاهز. لازم تستخدمه قبل submit_order. اعرض الملخّص للزبون واسأله بصراحة: 'أأكد الطلب؟ (نعم/لا)'.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_order",
    description:
      "أرسل الطلب نهائياً للنظام. ممنوع استدعاؤه إلا بعد: (1) preview_order، و(2) موافقة صريحة من الزبون بكلمة مثل 'نعم/أكد/تمام/أوكي'. مرّر confirmation_token اللي رجع من preview_order ونص موافقة الزبون كما كتبها في user_confirmation_text.",
    parameters: {
      type: "object",
      properties: {
        confirmation_token: {
          type: "string",
          description: "التوكن اللي رجع من preview_order",
        },
        user_confirmation_text: {
          type: "string",
          description: "نص موافقة الزبون الحرفي (مثلاً: نعم، أكد، تمام)",
        },
      },
      required: ["confirmation_token", "user_confirmation_text"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_order",
    description:
      "احجز الطلب لوقت لاحق (مو الآن). نفس شروط submit_order: لازم preview_order أولاً + موافقة صريحة من الزبون + scheduled_for بصيغة ISO 8601 (مع المنطقة الزمنية). الطلب يُخزن بحالة scheduled ويُرسل للفرع تلقائياً قبل نصف ساعة من الموعد. لا ينقص المخزون الآن.",
    parameters: {
      type: "object",
      properties: {
        confirmation_token: {
          type: "string",
          description: "التوكن اللي رجع من preview_order",
        },
        user_confirmation_text: {
          type: "string",
          description: "نص موافقة الزبون الحرفي",
        },
        scheduled_for: {
          type: "string",
          description:
            "موعد الطلب بصيغة ISO 8601 (مثلاً 2026-06-02T19:00:00+03:00 لبغداد). لازم يكون بعد 15 دقيقة على الأقل من الآن وضمن أسبوعين.",
        },
        scheduled_for_human: {
          type: "string",
          description:
            "تمثيل بشري للموعد كما تفهمه (مثلاً: اليوم الساعة 7 مساءً، بكرة الظهر)",
        },
      },
      required: [
        "confirmation_token",
        "user_confirmation_text",
        "scheduled_for",
        "scheduled_for_human",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_order",
    description:
      "ألغِ آخر طلب للزبون. يشتغل فقط لو الطلب لسه بحالة pending (ما تأكد من الفرع) أو scheduled (مجدول لوقت لاحق). يرجّع المخزون ويخبر الفرع تلقائياً. ممنوع استدعاؤه لطلبات confirmed/preparing/out_for_delivery — بهاي الحالة استخدم handoff_to_human.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "سبب الإلغاء كما ذكره الزبون (اختياري)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "modify_order",
    description:
      "عدّل آخر طلب للزبون: يلغي الطلب الحالي ويرجّع أصنافه للسلة عشان الزبون يقدر يضيف/يحذف/يغيّر. بعدها لازم تعيد preview_order ثم submit_order/schedule_order حسب الحالة. يشتغل فقط لو الطلب pending/scheduled. للطلبات اللي تأكدت من الفرع استخدم handoff_to_human.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "handoff_to_human",
    description:
      "حوّل المحادثة لموظف بشري لما تكون غير متأكد أو الزبون يطلب ذلك.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "resolve_branch",
    description:
      "حدد أنسب فرع للزبون بناءً على عنوانه أو منطقته. استدعِ هذه الأداة قبل set_delivery_info لما المطعم يكون عنده أكثر من فرع. ترجع الفرع المختار + أوقاته + الحد الأدنى.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "العنوان أو اسم المنطقة اللي قاله الزبون",
        },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
] as const satisfies readonly OrderToolContract[];

export type OrderToolName = (typeof ORDER_TOOL_CONTRACTS)[number]["name"];

export const ORDER_TOOL_NAMES = ORDER_TOOL_CONTRACTS.map((tool) =>
  tool.name
) as OrderToolName[];

const ORDER_TOOL_BY_NAME = new Map<string, OrderToolContract>(
  ORDER_TOOL_CONTRACTS.map((tool) => [tool.name, tool]),
);

export function toChatCompletionTool(
  contract: OrderToolContract,
): ChatCompletionFunctionTool {
  return { type: "function", function: contract };
}

export function toRealtimeTool(
  contract: OrderToolContract,
): RealtimeFunctionTool {
  return { type: "function", ...contract };
}

export function realtimeOrderTools(): RealtimeFunctionTool[] {
  return ORDER_TOOL_CONTRACTS.map(toRealtimeTool);
}

/**
 * Replaces matching inline contracts without reordering the current agent's
 * tool list. Missing shared tools are appended, making the shared registry the
 * only source of truth while keeping channel-specific tools untouched.
 */
export function replaceSharedOrderTools(
  existingTools: readonly ChatCompletionFunctionTool[],
): ChatCompletionFunctionTool[] {
  const seen = new Set<string>();
  const merged = existingTools.map((tool) => {
    const shared = ORDER_TOOL_BY_NAME.get(tool.function.name);
    if (!shared) return tool;
    seen.add(shared.name);
    return toChatCompletionTool(shared);
  });

  for (const contract of ORDER_TOOL_CONTRACTS) {
    if (!seen.has(contract.name)) merged.push(toChatCompletionTool(contract));
  }

  return merged;
}
