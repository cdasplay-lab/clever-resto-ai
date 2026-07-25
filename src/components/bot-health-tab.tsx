/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, Zap, Wrench, RefreshCw } from "lucide-react";

type LogRow = {
  id: string;
  kind: string;
  tool_name: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
  conversation_id: string | null;
  step: number;
  message: string | null;
};
type Health = {
  total_runs_24h: number;
  errors_24h: number;
  avg_latency_ms: number;
  tool_calls_24h: number;
  recent_logs: LogRow[];
  heartbeats?: { service: string; status: string; last_seen_at: string }[];
  alerts?: { id: string; severity: string; title: string; status: string; last_seen_at: string }[];
};

export function BotHealthTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Health | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: res, error }, { data: heartbeats }, { data: alerts }] = await Promise.all([
      supabase.rpc("get_bot_health", { _restaurant_id: restaurantId }),
      (supabase.from as any)("service_heartbeats")
        .select("service,status,last_seen_at")
        .eq("restaurant_id", restaurantId)
        .order("last_seen_at", { ascending: false }),
      (supabase.from as any)("monitoring_alerts")
        .select("id,severity,title,status,last_seen_at")
        .eq("restaurant_id", restaurantId)
        .neq("status", "resolved")
        .order("last_seen_at", { ascending: false }),
    ]);
    if (!error)
      setData({
        ...(res as unknown as Health),
        heartbeats: heartbeats ?? [],
        alerts: alerts ?? [],
      });
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [restaurantId]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!data) return <p className="text-center text-muted-foreground p-8">لا توجد بيانات</p>;

  const errorRate = data.total_runs_24h
    ? Math.round((data.errors_24h / data.total_runs_24h) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">صحة البوت — آخر 24 ساعة</h2>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 ml-2" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Activity />} label="تشغيلات" value={data.total_runs_24h} />
        <StatCard
          icon={<AlertTriangle />}
          label="أخطاء"
          value={data.errors_24h}
          danger={errorRate > 10}
          suffix={data.total_runs_24h ? ` (${errorRate}%)` : ""}
        />
        <StatCard
          icon={<Zap />}
          label="متوسط زمن الرد"
          value={`${data.avg_latency_ms}ms`}
          danger={data.avg_latency_ms > 8000}
        />
        <StatCard icon={<Wrench />} label="استدعاءات الأدوات" value={data.tool_calls_24h} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر 50 سجل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
          {data.recent_logs.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد سجلات بعد</p>
          )}
          {data.recent_logs.map((log) => (
            <div
              key={log.id}
              className={`text-xs border rounded p-2 flex flex-wrap gap-2 items-center ${
                log.error ? "border-destructive bg-destructive/5" : ""
              }`}
            >
              <Badge variant={log.error ? "destructive" : "secondary"} className="font-mono">
                {log.kind}
              </Badge>
              {log.latency_ms != null && (
                <span className="text-muted-foreground">{log.latency_ms}ms</span>
              )}
              {log.error && <span className="text-destructive">{log.error}</span>}
              <span className="text-muted-foreground ml-auto">
                {new Date(log.created_at).toLocaleString("ar")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">القنوات والخدمات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data.heartbeats?.length && (
              <p className="text-sm text-muted-foreground">لا توجد نبضات خدمة بعد.</p>
            )}
            {data.heartbeats?.map((h) => (
              <div key={h.service} className="flex justify-between text-sm">
                <span>{h.service}</span>
                <Badge variant={h.status === "ok" ? "secondary" : "destructive"}>
                  {h.status} · {new Date(h.last_seen_at).toLocaleString("ar")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">التنبيهات المفتوحة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data.alerts?.length && (
              <p className="text-sm text-muted-foreground">لا توجد تنبيهات مفتوحة.</p>
            )}
            {data.alerts?.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 text-sm">
                <span>{a.title}</span>
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>
                  {a.severity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  danger,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  danger?: boolean;
  suffix?: string;
}) {
  return (
    <Card className={danger ? "border-destructive" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          <span className="h-4 w-4">{icon}</span>
          {label}
        </div>
        <div className={`text-2xl font-bold ${danger ? "text-destructive" : ""}`}>
          {value}
          {suffix && <span className="text-sm font-normal">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
