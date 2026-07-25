/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, AlertCircle, CheckCircle2, ReceiptText } from "lucide-react";

type Sub = {
  id: string;
  status: string;
  period_start: string;
  period_end: string;
  plan_code: string;
  plan_name: string;
  price_iqd: number;
  max_branches: number;
  max_ai_replies: number;
  max_confirmed_orders: number;
  features: Record<string, unknown>;
};
type Usage = { ai_replies_used: number; confirmed_orders_used: number; branches_used: number };
type Plan = {
  id: string;
  code: string;
  name_ar: string;
  price_iqd: number;
  max_branches: number;
  max_ai_replies: number;
  max_confirmed_orders: number;
  features: Record<string, unknown>;
  is_custom: boolean;
  sort_order: number;
};
type Payment = {
  id: string;
  amount_iqd: number;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string;
};

export function SubscriptionTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Sub | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    void load();
  }, [restaurantId]);

  async function load() {
    setLoading(true);
    const [{ data: subData }, { data: plansData }, { data: paymentData }] = await Promise.all([
      supabase.rpc("get_my_subscription", { _restaurant_id: restaurantId }),
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      (supabase.from as any)("subscription_payments")
        .select("id,amount_iqd,method,reference,status,paid_at")
        .eq("restaurant_id", restaurantId)
        .order("paid_at", { ascending: false })
        .limit(12),
    ]);
    const payload = (subData as { subscription: Sub | null; usage: Usage } | null) ?? null;
    setSub(payload?.subscription ?? null);
    setUsage(payload?.usage ?? null);
    setPlans((plansData as Plan[]) ?? []);
    setPayments((paymentData as Payment[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const expired = sub && new Date(sub.period_end) < new Date();
  const isActive = sub && ["active", "trialing"].includes(sub.status) && !expired;
  const daysRemaining = sub
    ? Math.max(0, Math.ceil((new Date(sub.period_end).getTime() - Date.now()) / 86_400_000))
    : 0;
  const aiPct =
    sub && usage ? Math.min(100, (usage.ai_replies_used / sub.max_ai_replies) * 100) : 0;
  const ordersPct =
    sub && usage
      ? Math.min(100, (usage.confirmed_orders_used / sub.max_confirmed_orders) * 100)
      : 0;
  const branchPct =
    sub && usage ? Math.min(100, (usage.branches_used / sub.max_branches) * 100) : 0;

  return (
    <div className="space-y-6">
      {!sub && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold">لا توجد باقة مفعّلة</p>
              <p className="text-sm text-muted-foreground mt-1">
                البوت موقوف. تواصل مع إدارة المنصة لتفعيل باقة.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {sub && !isActive && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold">باقتك منتهية أو موقوفة</p>
              <p className="text-sm text-muted-foreground mt-1">
                الحالة: {sub.status} — انتهت بـ {new Date(sub.period_end).toLocaleDateString("ar")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {sub && isActive && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>{sub.plan_name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {sub.price_iqd.toLocaleString()} د.ع / شهرياً
                </p>
              </div>
              <Badge className="gap-1">
                <CheckCircle2 className="h-3 w-3" />{" "}
                {sub.status === "trialing" ? "تجريبية" : "نشطة"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="text-sm text-muted-foreground">
              متبقي {daysRemaining.toLocaleString("ar")} يوم — تنتهي في{" "}
              {new Date(sub.period_end).toLocaleDateString("ar")}
            </div>

            <UsageBar
              label="ردود الذكاء الاصطناعي"
              used={usage?.ai_replies_used ?? 0}
              max={sub.max_ai_replies}
              pct={aiPct}
            />
            <UsageBar
              label="الطلبات المؤكدة"
              used={usage?.confirmed_orders_used ?? 0}
              max={sub.max_confirmed_orders}
              pct={ordersPct}
            />
            <UsageBar
              label="الفروع النشطة"
              used={usage?.branches_used ?? 0}
              max={sub.max_branches}
              pct={branchPct}
            />
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3">الباقات المتاحة</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const current = sub?.plan_code === p.code && isActive;
            return (
              <Card key={p.id} className={current ? "border-primary" : ""}>
                <CardHeader>
                  <CardTitle className="text-base">{p.name_ar}</CardTitle>
                  <p className="text-2xl font-bold">
                    {p.is_custom ? "حسب الاتفاق" : `${p.price_iqd.toLocaleString()} د.ع`}
                  </p>
                  {!p.is_custom && <p className="text-xs text-muted-foreground">شهرياً</p>}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="الفروع" v={p.max_branches} custom={p.is_custom} />
                  <Row label="ردود AI / شهر" v={p.max_ai_replies} custom={p.is_custom} />
                  <Row label="طلبات مؤكدة / شهر" v={p.max_confirmed_orders} custom={p.is_custom} />
                  {current && (
                    <Badge variant="secondary" className="mt-2">
                      باقتك الحالية
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          للترقية أو تفعيل باقة، تواصل مع إدارة المنصة.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> سجل الدفعات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!payments.length && (
            <p className="text-sm text-muted-foreground">لا توجد دفعات مسجلة بعد.</p>
          )}
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"
            >
              <span>
                {p.amount_iqd.toLocaleString("ar-IQ")} د.ع — {p.method}
              </span>
              <span className="text-muted-foreground">
                {p.reference || "بدون مرجع"} · {new Date(p.paid_at).toLocaleDateString("ar")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageBar({
  label,
  used,
  max,
  pct,
}: {
  label: string;
  used: number;
  max: number;
  pct: number;
}) {
  const danger = pct >= 90;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className={danger ? "text-destructive font-semibold" : ""}>
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

function Row({ label, v, custom }: { label: string; v: number; custom: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{custom ? "مخصص" : v.toLocaleString()}</span>
    </div>
  );
}
