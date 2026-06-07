import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, ChefHat, Bike, PackageCheck, XCircle } from "lucide-react";

type TrackData = {
  short_id: string;
  status: string;
  eta_minutes: number;
  remaining_minutes: number;
  items: Array<{ name?: string; qty?: number; quantity?: number; price?: number }>;
  subtotal: number;
  total: number;
  currency: string;
  restaurant_name: string | null;
  branch_name: string | null;
  customer_name: string | null;
  customer_phone_masked: string | null;
  delivery_address_masked: string | null;
  created_at: string;
};

const STEPS = [
  { key: "pending", label: "مستلم", Icon: Clock },
  { key: "confirmed", label: "مؤكد", Icon: CheckCircle2 },
  { key: "preparing", label: "بالتحضير", Icon: ChefHat },
  { key: "out_for_delivery", label: "بالطريق", Icon: Bike },
  { key: "completed", label: "وصل", Icon: PackageCheck },
];

function statusIndex(s: string): number {
  const i = STEPS.findIndex((x) => x.key === s);
  return i < 0 ? 0 : i;
}

export const Route = createFileRoute("/track/$orderId")({
  head: ({ params }) => ({
    meta: [
      { title: `تتبع طلبك #${String(params.orderId).slice(0, 8)}` },
      { name: "description", content: "تابع حالة طلبك لحظة بلحظة." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { orderId } = Route.useParams();
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-order?id=${encodeURIComponent(orderId)}`;
      const r = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error === "not_found" ? "الطلب غير موجود" : "تعذّر جلب الطلب");
        return;
      }
      setData(await r.json());
      setError(null);
    } catch {
      setError("تعذّر الاتصال");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border rounded-xl p-6 text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <p className="text-foreground font-medium">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">تأكد من رابط الطلب أو حاول لاحقاً.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  const isCancelled = data.status === "cancelled";
  const currentIdx = isCancelled ? -1 : statusIndex(data.status);

  return (
    <div dir="rtl" className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{data.restaurant_name}{data.branch_name ? ` — ${data.branch_name}` : ""}</p>
          <h1 className="text-2xl font-bold mt-1">طلب #{data.short_id}</h1>
          {!isCancelled && data.remaining_minutes > 0 && (
            <p className="text-primary font-medium mt-2">
              يوصل خلال ~{data.remaining_minutes} دقيقة
            </p>
          )}
          {isCancelled && (
            <p className="text-destructive font-medium mt-2">تم إلغاء الطلب</p>
          )}
        </div>

        {/* Progress steps */}
        {!isCancelled && (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex justify-between items-start relative">
              {/* connecting line */}
              <div className="absolute top-5 right-[10%] left-[10%] h-0.5 bg-muted -z-0" />
              <div
                className="absolute top-5 right-[10%] h-0.5 bg-primary transition-all duration-500 -z-0"
                style={{ width: `${(currentIdx / (STEPS.length - 1)) * 80}%` }}
              />
              {STEPS.map((step, i) => {
                const done = i <= currentIdx;
                const active = i === currentIdx;
                const Icon = step.Icon;
                return (
                  <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        done
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-card border-muted text-muted-foreground"
                      } ${active ? "ring-4 ring-primary/20 animate-pulse" : ""}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 text-center ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-3">تفاصيل الطلب</h2>
          <div className="space-y-2">
            {data.items.map((it, i) => {
              const qty = it.qty ?? it.quantity ?? 1;
              return (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-foreground">{qty}× {it.name || "—"}</span>
                  {it.price ? <span className="text-muted-foreground">{Number(it.price) * qty} {data.currency}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="border-t mt-4 pt-3 flex justify-between font-semibold">
            <span>الإجمالي</span>
            <span>{data.total} {data.currency}</span>
          </div>
        </div>

        {/* Delivery info */}
        {(data.customer_name || data.delivery_address_masked || data.customer_phone_masked) && (
          <div className="bg-card border rounded-xl p-5 space-y-2 text-sm">
            <h2 className="font-semibold mb-2">بيانات التوصيل</h2>
            {data.customer_name && <div><span className="text-muted-foreground">الاسم: </span>{data.customer_name}</div>}
            {data.delivery_address_masked && <div><span className="text-muted-foreground">العنوان: </span>{data.delivery_address_masked}</div>}
            {data.customer_phone_masked && <div><span className="text-muted-foreground">الهاتف: </span>{data.customer_phone_masked}</div>}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          الصفحة تتحدّث تلقائياً كل 15 ثانية.
        </p>
      </div>
    </div>
  );
}
