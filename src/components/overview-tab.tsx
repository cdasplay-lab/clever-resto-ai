import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  Clock3,
  Loader2,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from "lucide-react";

type OverviewOrder = {
  id: string;
  customer_name: string | null;
  total: number;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "طلب جديد",
  scheduled: "مجدول",
  confirmed: "تم التأكيد",
  preparing: "قيد التحضير",
  out_for_delivery: "بالطريق",
  completed: "تم التوصيل",
  cancelled: "ملغى",
};

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "green" | "amber" | "mint" | "sand";
}) {
  const tones = {
    green: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    mint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    sand: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  };

  return (
    <Card className="min-w-0 border-0">
      <CardContent className="p-3.5 sm:p-5">
        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="truncate text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-sm">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function OverviewTab({
  restaurantId,
  currency,
  onNavigate,
}: {
  restaurantId: string;
  currency: string;
  onNavigate: (tab: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OverviewOrder[]>([]);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("id,customer_name,total,status,created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    setOrders((data as OverviewOrder[] | null) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`mada-overview-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, restaurantId]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");
    const sales = active.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const completed = orders.filter((o) => o.status === "completed").length;
    const preparing = orders.filter((o) => ["confirmed", "preparing", "out_for_delivery"].includes(o.status)).length;
    const fresh = orders.filter((o) => ["pending", "scheduled"].includes(o.status)).length;

    const hourly = Array.from({ length: 7 }, (_, index) => {
      const endHour = index * 4;
      return active
        .filter((o) => new Date(o.created_at).getHours() < Math.max(1, endHour))
        .reduce((sum, o) => sum + Number(o.total || 0), 0);
    });
    const max = Math.max(...hourly, 1);
    const points = hourly.map((value, index) => `${(index / 6) * 100},${92 - (value / max) * 76}`).join(" ");
    const areaPoints = `0,96 ${points} 100,96`;

    return { sales, completed, preparing, fresh, points, areaPoints };
  }, [orders]);

  const money = (value: number) => `${value.toLocaleString("ar-IQ")} ${currency || "د.ع"}`;

  if (loading) {
    return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="مبيعات اليوم" value={money(stats.sales)} icon={WalletCards} tone="amber" />
        <MetricCard label="تم التوصيل" value={stats.completed} icon={CheckCircle2} tone="mint" />
        <MetricCard label="قيد التحضير" value={stats.preparing} icon={Clock3} tone="green" />
        <MetricCard label="طلبات جديدة" value={stats.fresh} icon={ShoppingBag} tone="sand" />
      </div>

      <Card className="overflow-hidden border-0">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-0 sm:p-6 sm:pb-0">
          <div>
            <CardTitle className="text-base sm:text-lg">نظرة عامة على المبيعات</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">حركة مبيعات مطعمك خلال اليوم</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <TrendingUp className="h-3.5 w-3.5" /> مباشر
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="mb-2 text-3xl font-bold tabular-nums">{money(stats.sales)}</div>
          <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-primary/[0.04] to-transparent px-2 pt-4">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label="مخطط مبيعات اليوم">
              <defs>
                <linearGradient id="madaSalesArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--border)" strokeWidth="0.5" />)}
              <polygon points={stats.areaPoints} fill="url(#madaSalesArea)" />
              <polyline points={stats.points} fill="none" stroke="var(--primary)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="absolute inset-x-4 bottom-1 flex justify-between text-[10px] text-muted-foreground">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base sm:text-lg">أحدث الطلبات</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("orders")} className="text-primary">
            عرض الكل <ArrowLeft className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-5 sm:pb-5">
          {orders.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-muted/45 text-center">
              <ChefHat className="mb-2 h-8 w-8 text-primary/50" />
              <p className="text-sm font-medium">أول طلب راح يظهر هنا</p>
              <p className="mt-1 text-xs text-muted-foreground">اللوحة تتحدث تلقائياً عند وصول الطلبات</p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {orders.slice(0, 5).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onNavigate("orders")}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-right transition-colors hover:bg-muted/55"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/9 text-primary">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{order.customer_name || "زبون جديد"}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">#{order.id.slice(0, 6)} · {STATUS_LABELS[order.status] || order.status}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold tabular-nums">{money(Number(order.total || 0))}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
