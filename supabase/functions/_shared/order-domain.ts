export type PaymentMethod = "cash" | "card_on_delivery";

export type SelectedOption = {
  group: string;
  choice: string;
};

export type CartItem = {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_price: number;
  notes?: string;
  selected_options?: SelectedOption[];
};

export type DeliveryInfo = {
  address?: string;
  phone?: string;
  time?: string;
  area?: string;
  payment_method?: PaymentMethod;
};

export const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export const CONFIRM_RE =
  /(^|[\s،,.!؟?])(نعم|اكد|أكد|اكّد|أكّد|تمام|اوكي|أوكي|ok|okay|yes|yep|ايوه|أيوه|اي|أي|صح|صحيح|موافق|اكمل|أكمل|ارسل|أرسل|اطلب|أطلب)([\s،,.!؟?]|$)/i;

export const REJECT_CONFIRM_RE =
  /(^|[\s،,.!؟?])(لا|مو|مش|غير|الغ|ألغي|الغي|بدل|غيّر|غير)([\s،,.!؟?]|$)/i;

export type ConfirmationDecision = "confirmed" | "rejected" | "ambiguous";

/**
 * Classifies the customer's own text. A negative/correction always wins over
 * an affirmative word so phrases such as "لا، غير الطلب" cannot confirm.
 */
export function classifyOrderConfirmation(text: unknown): ConfirmationDecision {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return "ambiguous";
  if (REJECT_CONFIRM_RE.test(value)) return "rejected";
  if (CONFIRM_RE.test(value)) return "confirmed";
  return "ambiguous";
}

export function isExplicitOrderConfirmation(text: unknown): boolean {
  return classifyOrderConfirmation(text) === "confirmed";
}

export function isConfirmationFresh(
  pendingCreatedAt: string | number | Date | null | undefined,
  nowMs = Date.now(),
  ttlMs = CONFIRMATION_TTL_MS,
): boolean {
  const createdAt = pendingCreatedAt instanceof Date
    ? pendingCreatedAt.getTime()
    : new Date(pendingCreatedAt ?? "").getTime();
  return Number.isFinite(createdAt) && nowMs - createdAt <= ttlMs;
}

/**
 * Canonical serialization used before hashing a preview. Keep the cart order
 * intact, but sort selected options because option display order is not part
 * of the customer's approval.
 */
export function cartFingerprint(
  cart: readonly CartItem[],
  delivery: DeliveryInfo | null | undefined,
  branchId: string | null,
  customerName?: string | null,
): string {
  const normalized = {
    cart: (cart || []).map((item) => ({
      id: item.menu_item_id,
      q: item.qty,
      p: item.unit_price,
      o: (item.selected_options || [])
        .map((option) => `${option.group}=${option.choice}`)
        .sort()
        .join("|"),
      n: item.notes || "",
    })),
    d: {
      a: delivery?.address || "",
      p: delivery?.phone || "",
      t: delivery?.time || "",
      pm: delivery?.payment_method || "",
    },
    b: branchId || "",
    cn: (customerName || "").toString().trim(),
  };

  return JSON.stringify(normalized);
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
