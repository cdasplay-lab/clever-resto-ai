import { Check, Instagram, MessageSquare, Send, ShoppingBag } from "lucide-react";
import { MadaMark } from "@/components/mada-logo";

export function ProductPreview() {
  return (
    <div className="mada-hero-product" aria-label="معاينة توضيحية لتجربة استقبال الطلبات">
      <div className="mada-product-inbox">
        <div className="mb-3 flex items-center justify-between border-b border-black/15 pb-4 text-sm font-semibold">
          <span>صندوق الرسائل الموحد</span>
          <MessageSquare className="h-4 w-4" />
        </div>
        {[
          { name: "أحمد", text: "ممكن طلب للتوصيل؟", icon: MessageSquare },
          { name: "لينا", text: "هل يتوفر برجر دجاج؟", icon: Instagram },
          { name: "عمر", text: "أريد أطلب الآن", icon: Send },
        ].map(({ name, text, icon: Icon }) => (
          <div
            key={name}
            className="flex items-center gap-3 border-b border-black/10 py-4 last:border-0"
          >
            <Icon className="h-5 w-5 shrink-0 text-black/60" />
            <div className="min-w-0">
              <strong className="block text-sm">{name}</strong>
              <span className="block truncate text-xs text-black/50">{text}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mada-product-ticket">
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-4">
          <bdi className="text-2xl font-semibold">#1048</bdi>
          <span className="flex items-center gap-1.5 rounded-full border border-action/40 px-2.5 py-1 text-[10px] text-action">
            <Check className="h-3 w-3" />
            تم تأكيد الطلب
          </span>
        </div>
        <div className="my-5 flex items-center justify-between text-sm">
          <span>برجر دجاج × ٢</span>
          <ShoppingBag className="h-5 w-5 text-white/50" />
        </div>
        <p className="text-3xl font-semibold">
          <bdi>14,000 د.ع</bdi>
        </p>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-action/10 px-3 py-2.5 text-sm text-action">
          <MadaMark className="h-5 w-5" />
          الوكيل يتابع
          <span className="ms-auto h-1.5 w-1.5 rounded-full bg-action" />
        </div>
        <p className="mt-2 text-[9px] text-white/40">معاينة توضيحية، ليست طلباً حقيقياً</p>
      </div>
    </div>
  );
}
