import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp, Users, Clock, Activity, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

type Range = 7 | 30 | 90;

type Order = {
  id: string;
  total: number;
  status: string;
  created_at: string;
  items: any[];
  customer_phone: string | null;
  conversation_id: string | null;
};

type Conv = { id: string; channel: string; created_at: string };

type AgentLog = { kind: string; error: string | null; latency_ms: number | null; tool_name: string | null; created_at: string };

// hsl(var(--x)) is invalid now that tokens are oklch — use the vars directly.
const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#ef4444", "#0ea5e9", "#f59e0b"];

export function AnalyticsTab({ restaurantId }: { restaurantId: string }) {
  const [range, setRange] = useState<Range>(30);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
      const [o, c, l] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at,items,customer_phone,conversation_id").eq("restaurant_id", restaurantId).gte("created_at", since).order("created_at", { ascending: true }).limit(1000),
        supabase.from("conversations").select("id,channel,created_at").eq("restaurant_id", restaurantId).gte("created_at", since).limit(1000),
        supabase.from("agent_logs").select("kind,error,latency_ms,tool_name,created_at").eq("restaurant_id", restaurantId).gte("created_at", since).limit(1000),
      ]);
      setOrders((o.data as any) || []);
      setConvs((c.data as any) || []);
      setLogs((l.data as any) || []);
      setLoading(false);
    })();
  }, [restaurantId, range]);

  const stats = useMemo(() => {
    const validOrders = orders.filter(o => o.status !== "cancelled");
    const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalOrders = orders.length;
    const aov = validOrders.length ? Math.round(totalRevenue / validOrders.length) : 0;

    // Daily
    const byDay = new Map<string, { day: string; orders: number; revenue: number }>();
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      const cur = byDay.get(day) || { day: day.slice(5), orders: 0, revenue: 0 };
      cur.orders += 1;
      if (o.status !== "cancelled") cur.revenue += Number(o.total || 0);
      byDay.set(day, cur);
    }
    const daily = Array.from(byDay.values());

    // Hour of day
    const byHour: { hour: string; orders: number }[] = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}`, orders: 0 }));
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      byHour[h].orders += 1;
    }

    // Status pie
    const byStatus = new Map<string, number>();
    for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) || 0) + 1);
    const statusData = Array.from(byStatus.entries()).map(([name, value]) => ({ name, value }));

    // Channel pie
    const byChannel = new Map<string, number>();
    for (const c of convs) byChannel.set(c.channel, (byChannel.get(c.channel) || 0) + 1);
    const channelData = Array.from(byChannel.entries()).map(([name, value]) => ({ name, value }));

    // Top items
    const itemQty = new Map<string, { qty: number; revenue: number }>();
    for (const o of orders) {
      for (const it of (Array.isArray(o.items) ? o.items : [])) {
        const cur = itemQty.get(it.name) || { qty: 0, revenue: 0 };
        cur.qty += Number(it.qty || 0);
        cur.revenue += Number(it.qty || 0) * Number(it.price || 0);
        itemQty.set(it.name, cur);
      }
    }
    const topItems = Array.from(itemQty.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10);

    // Repeat customers (by phone)
    const phoneCounts = new Map<string, number>();
    for (const o of orders) {
      if (o.customer_phone) phoneCounts.set(o.customer_phone, (phoneCounts.get(o.customer_phone) || 0) + 1);
    }
    const totalCustomers = phoneCounts.size;
    const repeatCustomers = Array.from(phoneCounts.values()).filter(n => n >= 2).length;
    const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    // Top customers
    const customerRevenue = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      if (!o.customer_phone || o.status === "cancelled") continue;
      const cur = customerRevenue.get(o.customer_phone) || { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(o.total || 0);
      customerRevenue.set(o.customer_phone, cur);
    }
    const topCustomers = Array.from(customerRevenue.entries()).map(([phone, v]) => ({ phone, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // Conversion: orders / conversations
    const conversionRate = convs.length ? Math.round((orders.length / convs.length) * 100) : 0;

    // Bot stats
    const runs = logs.filter(l => l.kind === "run");
    const tools = logs.filter(l => l.kind === "tool");
    const errors = logs.filter(l => l.error).length;
    const latencies = runs.map(r => r.latency_ms).filter((n): n is number => typeof n === "number");
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const toolUsage = new Map<string, number>();
    for (const t of tools) if (t.tool_name) toolUsage.set(t.tool_name, (toolUsage.get(t.tool_name) || 0) + 1);
    const topTools = Array.from(toolUsage.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      totalRevenue, totalOrders, aov, daily, byHour, statusData, channelData,
      topItems, totalCustomers, repeatRate, topCustomers, conversionRate,
      runs: runs.length, tools: tools.length, errors, avgLatency, topTools,
    };
  }, [orders, convs, logs]);

  const exportCsv = () => {
    const rows = [["Date", "Orders", "Revenue"], ...stats.daily.map(d => [d.day, d.orders, d.revenue])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `analytics-${range}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([7, 30, 90] as Range[]).map(r => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
              {r} يوم
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="ml-1 h-4 w-4" />تصدير CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>الطلبات</CardDescription><CardTitle className="text-2xl">{stats.totalOrders}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>الإيرادات</CardDescription><CardTitle className="text-2xl">{stats.totalRevenue.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>متوسط الطلب</CardDescription><CardTitle className="text-2xl">{stats.aov.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>محادثات</CardDescription><CardTitle className="text-2xl">{convs.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>نسبة التحويل</CardDescription><CardTitle className="text-2xl">{stats.conversionRate}%</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>زبائن فريدون</CardDescription><CardTitle className="text-2xl">{stats.totalCustomers}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>نسبة العودة</CardDescription><CardTitle className="text-2xl">{stats.repeatRate}%</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>تشغيلات البوت</CardDescription><CardTitle className="text-2xl">{stats.runs}</CardTitle></CardHeader></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />الإيرادات اليومية</CardTitle></CardHeader>
          <CardContent>
            {stats.daily.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={stats.daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />الطلبات اليومية</CardTitle></CardHeader>
          <CardContent>
            {stats.daily.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={stats.daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="orders" fill="var(--chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />ساعات الذروة</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={stats.byHour}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="orders" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>حالات الطلبات</CardTitle></CardHeader>
          <CardContent>
            {stats.statusData.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats.statusData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {stats.statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>القنوات</CardTitle></CardHeader>
          <CardContent>
            {stats.channelData.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats.channelData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {stats.channelData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />أداء البوت</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border p-2"><div className="text-muted-foreground">متوسط الزمن</div><div className="text-lg font-semibold">{stats.avgLatency} ms</div></div>
              <div className="rounded border p-2"><div className="text-muted-foreground">أخطاء</div><div className="text-lg font-semibold">{stats.errors}</div></div>
              <div className="rounded border p-2"><div className="text-muted-foreground">استدعاء أدوات</div><div className="text-lg font-semibold">{stats.tools}</div></div>
              <div className="rounded border p-2"><div className="text-muted-foreground">معدل النجاح</div><div className="text-lg font-semibold">{stats.runs ? Math.round(((stats.runs - stats.errors) / stats.runs) * 100) : 0}%</div></div>
            </div>
            {stats.topTools.length > 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">أكثر الأدوات استخداماً:</div>
                <ul className="space-y-1">
                  {stats.topTools.map(t => (
                    <li key={t.name} className="flex justify-between border-b pb-1"><span className="font-mono text-xs">{t.name}</span><Badge variant="secondary">{t.count}</Badge></li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>الأكثر طلباً</CardTitle></CardHeader>
          <CardContent>
            {stats.topItems.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو طلبات بعد</p> : (
              <ul className="space-y-2">
                {stats.topItems.map((i, idx) => (
                  <li key={i.name} className="flex items-center justify-between border-b pb-1 text-sm">
                    <span className="truncate">{idx + 1}. {i.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{i.revenue.toLocaleString()}</span>
                      <Badge variant="secondary">{i.qty}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />أفضل الزبائن</CardTitle></CardHeader>
          <CardContent>
            {stats.topCustomers.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
              <ul className="space-y-2">
                {stats.topCustomers.map((c, idx) => (
                  <li key={c.phone} className="flex items-center justify-between border-b pb-1 text-sm">
                    <span className="truncate">{idx + 1}. {c.phone}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.orders} طلب</span>
                      <Badge variant="secondary">{c.revenue.toLocaleString()}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
