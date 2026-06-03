import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Activity,
  AlertTriangle,
  Zap,
  Wrench,
  RefreshCw,
  PlayCircle,
  ThumbsDown,
  Gauge,
  CircleCheck,
  CircleX,
} from "lucide-react";

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
};

type Readiness = {
  score: number;
  checklist: { key: string; label: string; ok: boolean; value: any }[];
};

type PausedConv = {
  id: string;
  customer_handle: string | null;
  customer_name: string | null;
  channel: string;
  last_message_at: string;
  meta: any;
};

type MenuRow = {
  id: string;
  name: string;
  category: string | null;
  is_available: boolean;
};

const BAD_REASONS = [
  { v: "hallucinated_item", l: "اخترع صنف/سعر" },
  { v: "wrong_price", l: "سعر غلط" },
  { v: "bad_tone", l: "لهجة سيئة" },
  { v: "wrong_info", l: "معلومة خاطئة" },
  { v: "repeated_self", l: "كرر نفسه" },
  { v: "did_not_understand", l: "ما فهم الزبون" },
  { v: "other", l: "أخرى" },
];

export function BotHealthTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Health | null>(null);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_bot_health", {
      _restaurant_id: restaurantId,
    });
    if (!error) setData(res as unknown as Health);
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
      <ReadinessBanner restaurantId={restaurantId} />

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

      <PausedConversationsCard restaurantId={restaurantId} />
      <AvailabilityCard restaurantId={restaurantId} />
      <BadResponsesCard restaurantId={restaurantId} />

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
              <span className="text-muted-foreground ms-auto">
                {new Date(log.created_at).toLocaleString("ar")}
              </span>
              {log.conversation_id && (
                <FlagBadResponseButton
                  restaurantId={restaurantId}
                  conversationId={log.conversation_id}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
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

// ---------- Readiness Banner ----------
function ReadinessBanner({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<Readiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_restaurant_readiness", {
        _restaurant_id: restaurantId,
      });
      if (!cancelled && !error) setData(data as unknown as Readiness);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (!data) return null;
  const tone =
    data.score >= 80
      ? "border-green-600/40 bg-green-500/5"
      : data.score >= 60
      ? "border-yellow-500/40 bg-yellow-500/5"
      : "border-destructive/40 bg-destructive/5";

  return (
    <Card className={tone}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          جاهزية المطعم: {data.score}/100
          {data.score < 60 && (
            <Badge variant="destructive" className="ms-2">
              أكمل الإعدادات
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
          {data.checklist.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              {c.ok ? (
                <CircleCheck className="h-4 w-4 text-green-600" />
              ) : (
                <CircleX className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
              {typeof c.value === "number" && (
                <span className="text-xs text-muted-foreground">({c.value})</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- Paused Conversations ----------
function PausedConversationsCard({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<PausedConv[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("id, customer_handle, customer_name, channel, last_message_at, meta")
      .eq("restaurant_id", restaurantId)
      .eq("is_bot_paused", true)
      .order("last_message_at", { ascending: false })
      .limit(20);
    setRows((data as any) || []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [restaurantId]);

  async function resume(id: string) {
    const { error } = await supabase
      .from("conversations")
      .update({ is_bot_paused: false })
      .eq("id", id);
    if (error) toast.error("ما كدرنا نستأنف البوت");
    else {
      toast.success("رجع البوت لهذي المحادثة");
      void load();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">محادثات متوقفة (Handoff)</CardTitle>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            ما كو محادثات متوقفة 👌
          </p>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 border rounded p-2 text-sm"
            >
              <Badge variant="outline">{c.channel}</Badge>
              <span className="font-medium">
                {c.customer_name || c.customer_handle || "زبون"}
              </span>
              <span className="text-muted-foreground text-xs ms-2 truncate">
                {c.meta?.handoff_reason || "—"}
              </span>
              <span className="text-muted-foreground text-xs ms-auto">
                {new Date(c.last_message_at).toLocaleString("ar")}
              </span>
              <Button size="sm" variant="outline" onClick={() => resume(c.id)}>
                <PlayCircle className="h-4 w-4 ml-1" /> استئناف
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ---------- 86 list ----------
function AvailabilityCard({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, category, is_available")
      .eq("restaurant_id", restaurantId)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    setItems((data as any) || []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [restaurantId]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.category || "").toLowerCase().includes(q),
        )
      : items;
  }, [items, filter]);

  async function toggle(id: string, val: boolean) {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, is_available: val } : i)));
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: val })
      .eq("id", id);
    if (error) {
      toast.error("ما تم الحفظ");
      void load();
    }
  }

  const unavailable = items.filter((i) => !i.is_available).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>توفّر الأصناف (86-list)</span>
          {unavailable > 0 && (
            <Badge variant="secondary">{unavailable} غير متوفر</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="ابحث باسم الصنف أو التصنيف…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-3"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : (
          <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
            {visible.map((i) => (
              <div
                key={i.id}
                className="flex items-center gap-2 border rounded px-2 py-1.5 text-sm"
              >
                <span className="truncate">{i.name}</span>
                {i.category && (
                  <span className="text-xs text-muted-foreground">({i.category})</span>
                )}
                <Switch
                  className="ms-auto"
                  checked={i.is_available}
                  onCheckedChange={(v) => toggle(i.id, v)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Bad response feedback (flagged history + flag button shown above) ----------
function BadResponsesCard({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ reason: string; count: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: latest }, { data: weekly }] = await Promise.all([
        supabase
          .from("bad_responses")
          .select("id, reason, note, created_at, conversation_id")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("weekly_bad_response_summary")
          .select("reason, count")
          .eq("restaurant_id", restaurantId),
      ]);
      if (cancelled) return;
      setRows((latest as any) || []);
      setSummary((weekly as any) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const total = summary.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ردود سيئة — آخر أسبوع ({total})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.slice(0, 6).map((s) => (
              <Badge key={s.reason} variant="outline">
                {labelForReason(s.reason)}: {s.count}
              </Badge>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            استخدم زر 👎 جنب أي سجل أسفل المحادثة لتسجيل رد سيء.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="border rounded p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{labelForReason(r.reason)}</Badge>
                  <span className="text-xs text-muted-foreground ms-auto">
                    {new Date(r.created_at).toLocaleString("ar")}
                  </span>
                </div>
                {r.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function labelForReason(v: string) {
  return BAD_REASONS.find((r) => r.v === v)?.l || v;
}

function FlagBadResponseButton({
  restaurantId,
  conversationId,
}: {
  restaurantId: string;
  conversationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("hallucinated_item");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    // Snapshot last 6 messages for context
    const { data: msgs } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    const ctx = (msgs || []).slice().reverse();
    const { error } = await supabase.from("bad_responses").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      reason,
      note: note.trim() || null,
      context_json: ctx,
    });
    setSaving(false);
    if (error) {
      toast.error("ما تم الحفظ");
      return;
    }
    toast.success("تسجّلت كرد سيء، شكراً");
    setOpen(false);
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2">
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل رد سيء</DialogTitle>
          <DialogDescription>
            ساعدنا نحسن البوت — اختر السبب وأضف ملاحظة إذا تحب.
          </DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BAD_REASONS.map((r) => (
              <SelectItem key={r.v} value={r.v}>
                {r.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          placeholder="ملاحظة (اختياري)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
