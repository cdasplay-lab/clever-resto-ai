import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  ArrowLeft,
  ChefHat,
  CheckCircle2,
  Clock3,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Settings2,
  ShoppingBag,
  Truck,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, nextOrderStatus, ORDER_LABELS, relativeTime } from "@/lib/order-presentation";
import { toast } from "sonner";

type BoardOrder = {
  id: string;
  customer_name: string | null;
  status: string;
  total: number;
  created_at: string;
  items: unknown;
  delivery_address: string | null;
  conversation_id: string | null;
};
type RecentConversation = {
  id: string;
  customer_name: string | null;
  customer_handle: string | null;
  channel: string;
  is_bot_paused: boolean;
  last_message_at: string;
};
type Health = {
  recent_logs?: {
    id: string;
    kind: string;
    tool_name: string | null;
    created_at: string;
    error: string | null;
  }[];
};
const CHANNELS = [
  { key: "telegram", label: "تيليجرام", icon: Send },
  { key: "instagram", label: "إنستغرام", icon: Instagram },
  { key: "whatsapp", label: "واتساب", icon: Phone },
  { key: "facebook", label: "فيسبوك", icon: Facebook },
];
const LANES = [
  { label: "جديد", states: ["pending", "scheduled"], icon: ShoppingBag },
  { label: "قيد التحضير", states: ["confirmed", "preparing"], icon: ChefHat },
  { label: "بالطريق", states: ["out_for_delivery"], icon: Truck },
];

export default function OverviewTab({
  restaurantId,
  currency,
  onNavigate,
}: {
  restaurantId: string;
  currency: string;
  onNavigate: (tab: string, conversationId?: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [conversationsCount, setConversationsCount] = useState(0);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [configured, setConfigured] = useState<string[]>([]);
  const [agentStatus, setAgentStatus] = useState("جاري التحقق");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      const [active, today, convs, restaurant, subscription, bot] = await Promise.all([
        supabase
          .from("orders")
          .select("id,customer_name,status,total,created_at,items,delivery_address,conversation_id")
          .eq("restaurant_id", restaurantId)
          .in("status", ["pending", "scheduled", "confirmed", "preparing", "out_for_delivery"])
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .gte("created_at", start.toISOString()),
        supabase
          .from("conversations")
          .select("id,customer_name,customer_handle,channel,is_bot_paused,last_message_at", {
            count: "exact",
          })
          .eq("restaurant_id", restaurantId)
          .gte("last_message_at", start.toISOString())
          .order("last_message_at", { ascending: false })
          .limit(6),
        supabase
          .from("restaurants")
          .select("is_active,telegram_bot_username,whatsapp_phone_number_id")
          .eq("id", restaurantId)
          .maybeSingle(),
        supabase.rpc("get_my_subscription", { _restaurant_id: restaurantId }),
        supabase.rpc("get_bot_health", { _restaurant_id: restaurantId }),
      ]);
      if (active.error || today.error || convs.error) throw new Error("تعذّر تحديث البيانات");
      setOrders((active.data || []) as BoardOrder[]);
      setTodayCount(today.count || 0);
      setConversationsCount(convs.count || 0);
      setConversations((convs.data || []) as RecentConversation[]);
      setHealth(bot.error ? null : (bot.data as unknown as Health));
      const channelKeys: string[] = [];
      if (restaurant.data?.telegram_bot_username) channelKeys.push("telegram");
      if (restaurant.data?.whatsapp_phone_number_id) channelKeys.push("whatsapp");
      setConfigured(channelKeys);
      const payload = subscription.data as {
        subscription?: { status?: string; period_end?: string };
      } | null;
      const sub = payload?.subscription;
      const activeSub =
        sub?.status === "active" &&
        !!sub.period_end &&
        new Date(sub.period_end).getTime() > Date.now();
      setAgentStatus(
        restaurant.error || subscription.error
          ? "تعذّر التحقق"
          : restaurant.data?.is_active === false
            ? "المطعم موقوف"
            : !activeSub
              ? "راجع الاشتراك"
              : !channelKeys.length
                ? "اربط قناة للبدء"
                : "مهيّأ لاستقبال الرسائل",
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`mada-workspace-${restaurantId}`);
    for (const table of ["orders", "conversations", "restaurants", "restaurant_subscriptions"]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "restaurants" ? "id" : "restaurant_id"}=eq.${restaurantId}`,
        },
        () => void load(),
      );
    }
    channel.subscribe();
    const interval = window.setInterval(() => void load(), 60000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [restaurantId, load]);

  async function advance(order: BoardOrder) {
    const next = nextOrderStatus(order.status);
    if (!next || busy) return;
    setBusy(order.id);
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: next.value as "confirmed" | "preparing" | "out_for_delivery" | "completed",
        })
        .eq("id", order.id)
        .eq("restaurant_id", restaurantId)
        .eq("status", order.status as "pending")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.info("تغيرت حالة الطلب، حدّثنا القائمة");
        await load();
        return;
      }
      await load();
      const notification = await supabase.functions.invoke("notify-order-status", {
        body: { order_id: order.id },
      });
      if (notification.error) toast.warning("تم تحديث الطلب، لكن تعذّر إرسال إشعار الزبون");
      else toast.success("تم تحديث الطلب وإشعار الزبون");
    } catch {
      toast.error("تعذّر تحديث الطلب، حاول مرة ثانية");
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div
        className="flex min-h-80 items-center justify-center"
        aria-label="جاري تحميل لوحة المطعم"
      >
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  const preparing = orders.filter((order) =>
    ["confirmed", "preparing"].includes(order.status),
  ).length;
  const fresh = orders.filter((order) => ["pending", "scheduled"].includes(order.status)).length;

  return (
    <div>
      {failed && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-4 text-sm"
        >
          <span>تعذّر تحديث بعض البيانات. المعروض هو آخر تحديث ناجح.</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      )}
      <section className="mada-agent-banner mb-5 flex items-center justify-between gap-3 xl:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-action" />
            حالة الوكيل
          </h2>
          <p className="mt-1 text-xs">{agentStatus}</p>
        </div>
        <Button
          variant="ghost"
          className="text-action hover:bg-white/5 hover:text-action"
          onClick={() => onNavigate("settings")}
          aria-label="إعدادات الوكيل"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </section>
      <div className="mada-stats">
        {[
          { label: "طلب اليوم", value: todayCount },
          { label: "محادثات اليوم", value: conversationsCount },
          { label: "قيد التحضير", value: preparing },
          { label: "بانتظار القبول", value: fresh },
        ].map((metric) => (
          <div key={metric.label} className="mada-stat">
            <strong>{failed ? "—" : metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
      <div className="mada-overview-grid">
        <section className="mada-panel">
          <div className="mada-panel-heading">
            <h2>الطلبات الجارية</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("orders")}>
              عرض الكل
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="mada-kanban">
            {LANES.map(({ label, states, icon: Icon }) => {
              const items = orders.filter((order) => states.includes(order.status));
              return (
                <section
                  key={label}
                  className={`mada-lane ${items.length === 0 && (orders.length > 0 || label !== "جديد") ? "hidden sm:block" : ""}`}
                >
                  <h3 className="mada-lane-title">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {label}
                    </span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </h3>
                  {items.length === 0 ? (
                    <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-5 w-5 opacity-45" />
                      لا توجد طلبات هنا
                    </div>
                  ) : (
                    items.slice(0, 5).map((order) => {
                      const next = nextOrderStatus(order.status);
                      const itemList = Array.isArray(order.items)
                        ? (order.items as { name?: string; qty?: number; quantity?: number }[])
                        : [];
                      return (
                        <article key={order.id} className="mada-order-ticket">
                          <div className="flex items-center justify-between gap-2">
                            <bdi className="text-sm font-semibold">#{order.id.slice(0, 8)}</bdi>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                              {ORDER_LABELS[order.status]}
                            </span>
                          </div>
                          <h4 className="mt-3 text-base font-semibold">
                            {order.customer_name || "زبون جديد"}
                          </h4>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            {relativeTime(order.created_at)}
                          </p>
                          <div className="my-4 min-h-10 space-y-1 text-xs">
                            {itemList.slice(0, 3).map((item, i) => (
                              <p key={i}>
                                {item.name || "صنف"} × {item.qty || item.quantity || 1}
                              </p>
                            ))}
                            {itemList.length > 3 && (
                              <p className="text-muted-foreground">
                                و{itemList.length - 3} أصناف أخرى
                              </p>
                            )}
                          </div>
                          <p className="mb-4 text-xl font-semibold">
                            <bdi>{money(order.total, currency)}</bdi>
                          </p>
                          {next && (
                            <Button
                              className="w-full"
                              disabled={!!busy}
                              onClick={() => void advance(order)}
                            >
                              {busy === order.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                next.label
                              )}
                            </Button>
                          )}
                        </article>
                      );
                    })
                  )}
                  {items.length > 5 && (
                    <Button variant="ghost" className="w-full" onClick={() => onNavigate("orders")}>
                      عرض بقية الطلبات
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
        </section>
        <aside className="space-y-4">
          <section className="mada-agent-banner hidden xl:block">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">حالة الوكيل</h2>
              <Activity className="h-4 w-4 text-action" />
            </div>
            <p className="mt-3 text-sm">{agentStatus}</p>
            <Button
              variant="ghost"
              className="mt-3 min-h-9 w-full justify-start px-0 text-action hover:bg-white/5 hover:text-action"
              onClick={() => onNavigate("settings")}
            >
              <Settings2 className="h-4 w-4" />
              إدارة الوكيل
              <ArrowLeft className="ms-auto h-4 w-4" />
            </Button>
          </section>
          <section className="mada-panel">
            <div className="mada-panel-heading">
              <h2>الوكيل الآن</h2>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="divide-y divide-border px-4">
              {health?.recent_logs?.length ? (
                health.recent_logs.slice(0, 3).map((log) => (
                  <div key={log.id} className="py-3">
                    <p className="text-xs">
                      {log.error
                        ? "تحتاج مراجعة سجل التشغيل"
                        : log.tool_name === "submit_order"
                          ? "تمت معالجة تثبيت طلب"
                          : log.kind === "tool"
                            ? "تم تنفيذ خطوة في المحادثة"
                            : "نشاط جديد للوكيل"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {relativeTime(log.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-5 text-xs text-muted-foreground">
                  يظهر نشاط الوكيل هنا عند وصول الرسائل
                </p>
              )}
            </div>
          </section>
          <section className="mada-panel">
            <div className="mada-panel-heading">
              <h2>أحدث المحادثات</h2>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="divide-y divide-border px-4">
              {conversations.length ? (
                conversations.slice(0, 3).map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => onNavigate("conversations", conversation.id)}
                    className="block w-full py-3 text-start"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="min-w-0 truncate text-xs">
                        {conversation.customer_name || conversation.customer_handle || "زبون"}
                      </strong>
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(conversation.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {conversation.is_bot_paused ? "بانتظار رد الموظف" : "يتولى الرد الوكيل"} ·{" "}
                      {conversation.channel}
                    </p>
                  </button>
                ))
              ) : (
                <p className="py-5 text-xs text-muted-foreground">لا توجد محادثات اليوم</p>
              )}
            </div>
            <div className="px-4 pb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onNavigate("conversations")}
              >
                فتح المحادثات
              </Button>
            </div>
          </section>
        </aside>
      </div>
      <section className="mada-panel mt-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          قنوات التواصل
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHANNELS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate("channels")}
              className="flex items-center gap-2 rounded-lg border p-3 text-start hover:bg-accent"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>
                <strong className="block text-xs font-medium">{label}</strong>
                <span className="text-[10px] text-muted-foreground">
                  {configured.includes(key) ? "القناة مربوطة" : "إدارة الربط"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
