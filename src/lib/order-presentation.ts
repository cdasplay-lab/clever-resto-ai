export const ORDER_LABELS: Record<string, string> = {
  pending: "جديد",
  scheduled: "مجدول",
  confirmed: "مؤكد",
  preparing: "قيد التحضير",
  out_for_delivery: "بالطريق",
  completed: "مكتمل",
  cancelled: "ملغى",
};
export function nextOrderStatus(status: string) {
  const transitions: Record<string, { value: string; label: string }> = {
    pending: { value: "confirmed", label: "قبول الطلب" },
    scheduled: { value: "confirmed", label: "قبول الطلب" },
    confirmed: { value: "preparing", label: "بدء التحضير" },
    preparing: { value: "out_for_delivery", label: "إرسال للتوصيل" },
    out_for_delivery: { value: "completed", label: "تم التوصيل" },
  };
  return transitions[status] || null;
}
export function money(value: number, currency = "IQD") {
  return `${Number(value || 0).toLocaleString("en-US")} ${currency === "IQD" ? "د.ع" : currency}`;
}
export function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  if (minutes < 1440) return `منذ ${Math.floor(minutes / 60)} س`;
  return `منذ ${Math.floor(minutes / 1440)} يوم`;
}
