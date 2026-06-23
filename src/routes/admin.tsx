import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Shield, Search, Power, Activity, Wallet, Store, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

// The new admin_* RPCs aren't in the generated Supabase types yet.
// Regenerate types after `supabase db push`, then this cast can be removed.
const adminRpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args);

type Row = {
  restaurant_id: string;
  restaurant_name: string;
  owner_email: string | null;
  is_active: boolean;
  plan_code: string | null;
  plan_name: string | null;
  status: string | null;
  period_end: string | null;
  ai_used: number;
  orders_used: number;
  ai_max: number | null;
  orders_max: number | null;
};
type Plan = { id: string; code: string; name_ar: string };
type Health = {
  restaurant_id: string;
  restaurant_name: string;
  is_active: boolean;
  bot_connected: boolean;
  total_runs_24h: number;
  errors_24h: number;
  avg_latency_ms: number;
  last_activity_at: string | null;
};
type Finance = {
  mrr_iqd: number;
  active_subs: number;
  suspended_subs: number;
  expiring_soon: { restaurant_id: string; restaurant_name: string; period_end: string }[];
};

const STATUS_AR: Record<string, string> = {
  active: "نشط", suspended: "معلّق", expired: "منتهٍ", cancelled: "ملغى",
};

function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [q, setQ] = useState("");

  // activate-plan dialog
  const [dialog, setDialog] = useState<{ open: boolean; row?: Row }>({ open: false });
  const [planCode, setPlanCode] = useState("starter");
  const [months, setMonths] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // destructive confirm dialog
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; body: string; reason: string; run?: (reason: string) => Promise<void>;
  }>({ open: false, title: "", body: "", reason: "" });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { void check(); }, []);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { void navigate({ to: "/auth" }); return; }
    const { data } = await supabase.rpc("is_platform_admin", { _user_id: user.id });
    if (!data) { setIsAdmin(false); setLoading(false); return; }
    setIsAdmin(true);
    await load();
  }

  async function load() {
    setLoading(true);
    // NOTE: fetch ALL subscriptions (not just active) so suspended/expired plans
    // still show their plan instead of looking like "no plan".
    const [{ data: restos }, { data: subs }, { data: plansData }] = await Promise.all([
      supabase.from("restaurants").select("id,name,owner_id,is_active"),
      supabase.from("restaurant_subscriptions")
        .select("restaurant_id,status,period_start,period_end,plans(code,name_ar,max_ai_replies,max_confirmed_orders)")
        .order("period_end", { ascending: false }),
      supabase.from("plans").select("id,code,name_ar").eq("is_active", true).order("sort_order"),
    ]);

    // Keep the newest sub per restaurant (list is already period_end desc).
    const subMap = new Map<string, any>();
    (subs || []).forEach((s: any) => { if (!subMap.has(s.restaurant_id)) subMap.set(s.restaurant_id, s); });

    const usageMap = new Map<string, { ai: number; ord: number }>();
    if (subs && subs.length) {
      const restIds = [...subMap.keys()];
      const { data: counters } = await supabase
        .from("usage_counters")
        .select("restaurant_id,period_start,ai_replies_used,confirmed_orders_used")
        .in("restaurant_id", restIds.length ? restIds : ["00000000-0000-0000-0000-000000000000"]);
      (counters || []).forEach((c: any) => {
        const s = subMap.get(c.restaurant_id);
        if (s && new Date(c.period_start).getTime() === new Date(s.period_start).getTime()) {
          usageMap.set(c.restaurant_id, { ai: c.ai_replies_used, ord: c.confirmed_orders_used });
        }
      });
    }

    const ownerIds = (restos || []).map((r: any) => r.owner_id);
    const { data: profs } = await supabase.from("profiles").select("id,email")
      .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
    const emailMap = new Map<string, string>();
    (profs || []).forEach((p: any) => emailMap.set(p.id, p.email));

    const out: Row[] = (restos || []).map((r: any) => {
      const s = subMap.get(r.id);
      const u = usageMap.get(r.id);
      return {
        restaurant_id: r.id,
        restaurant_name: r.name,
        owner_email: emailMap.get(r.owner_id) ?? null,
        is_active: r.is_active,
        plan_code: s?.plans?.code ?? null,
        plan_name: s?.plans?.name_ar ?? null,
        status: s?.status ?? null,
        period_end: s?.period_end ?? null,
        ai_used: u?.ai ?? 0,
        orders_used: u?.ord ?? 0,
        ai_max: s?.plans?.max_ai_replies ?? null,
        orders_max: s?.plans?.max_confirmed_orders ?? null,
      };
    });
    setRows(out);
    setPlans((plansData as Plan[]) ?? []);

    // Health + finance (best-effort; don't block the page).
    const [{ data: h }, { data: f }] = await Promise.all([
      adminRpc("admin_bot_health_all"),
      adminRpc("admin_finance_summary"),
    ]);
    setHealth((h as Health[]) ?? []);
    setFinance((f as Finance) ?? null);
    setLoading(false);
  }

  async function activate() {
    if (!dialog.row) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("activate_subscription", {
      _restaurant_id: dialog.row.restaurant_id, _plan_code: planCode, _months: months,
    });
    if (error) { setSubmitting(false); toast.error(error.message); return; }
    const noteText = `طريقة الدفع: ${paymentMethod}${notes ? ` — ${notes}` : ""}`;
    await supabase.from("restaurant_subscriptions").update({ notes: noteText })
      .eq("restaurant_id", dialog.row.restaurant_id).eq("status", "active");
    setSubmitting(false);
    toast.success("تم تفعيل الباقة وتسجيل الدفع");
    setDialog({ open: false }); setNotes("");
    await load();
  }

  function askConfirm(title: string, body: string, run: (reason: string) => Promise<void>) {
    setConfirm({ open: true, title, body, reason: "", run });
  }

  async function runConfirm() {
    if (!confirm.run) return;
    setConfirming(true);
    try {
      await confirm.run(confirm.reason);
      setConfirm({ open: false, title: "", body: "", reason: "" });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإجراء");
    } finally {
      setConfirming(false);
    }
  }

  async function setActive(r: Row, active: boolean, reason: string) {
    const { error } = await adminRpc("admin_set_restaurant_active", {
      _restaurant_id: r.restaurant_id, _active: active, _reason: reason || null,
    });
    if (error) throw error;
    toast.success(active ? "تم تفعيل المطعم" : "تم إيقاف المطعم");
  }

  async function setSubStatus(r: Row, status: string, reason: string) {
    const { error } = await adminRpc("admin_set_subscription_status", {
      _restaurant_id: r.restaurant_id, _status: status, _reason: reason || null,
    });
    if (error) throw error;
    toast.success("تم تحديث حالة الاشتراك");
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) {
    return (
      <div className="container max-w-md mx-auto p-8 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">غير مصرّح</h1>
        <p className="text-muted-foreground">هذه الصفحة لأدمن المنصة فقط.</p>
      </div>
    );
  }

  const filtered = rows.filter((r) =>
    !q || r.restaurant_name.toLowerCase().includes(q.toLowerCase()) ||
    (r.owner_email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const fmtIqd = (n: number) => new Intl.NumberFormat("ar-IQ").format(n) + " د.ع";
  const since = (iso: string | null) => iso ? new Date(iso).toLocaleString("ar") : "—";

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield /> لوحة السوبر أدمن</h1>
        <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>عودة</Button>
      </div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList>
          <TabsTrigger value="overview"><Store className="h-4 w-4 ml-1" /> المطاعم</TabsTrigger>
          <TabsTrigger value="health"><Activity className="h-4 w-4 ml-1" /> الصحة</TabsTrigger>
          <TabsTrigger value="finance"><Wallet className="h-4 w-4 ml-1" /> المالية</TabsTrigger>
        </TabsList>

        {/* ---------------- RESTAURANTS ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث باسم المطعم أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="grid gap-3">
            {filtered.map((r) => (
              <Card key={r.restaurant_id} className={!r.is_active ? "border-destructive/50" : undefined}>
                <CardContent className="pt-6 flex flex-wrap gap-4 items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-2">
                      {r.restaurant_name}
                      {!r.is_active && <Badge variant="destructive">موقوف</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.owner_email}</div>
                    {r.plan_code ? (
                      <div className="flex flex-wrap gap-2 text-sm items-center">
                        <Badge>{r.plan_name}</Badge>
                        {r.status && r.status !== "active" && (
                          <Badge variant="outline">{STATUS_AR[r.status] ?? r.status}</Badge>
                        )}
                        <span className="text-muted-foreground">
                          AI: {r.ai_used}/{r.ai_max} · طلبات: {r.orders_used}/{r.orders_max}
                        </span>
                        <span className="text-muted-foreground">
                          تنتهي {r.period_end ? new Date(r.period_end).toLocaleDateString("ar") : "-"}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="destructive">بلا باقة</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setDialog({ open: true, row: r }); setPlanCode(r.plan_code ?? "starter"); setMonths(1); }}>
                      تفعيل / تغيير باقة
                    </Button>
                    {r.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => askConfirm(
                        "تعليق الاشتراك",
                        `سيتوقّف بوت "${r.restaurant_name}" عن الرد فوراً. متأكد؟`,
                        (reason) => setSubStatus(r, "suspended", reason),
                      )}>تعليق الاشتراك</Button>
                    )}
                    {r.status === "suspended" && (
                      <Button size="sm" variant="outline" onClick={() => askConfirm(
                        "إعادة تفعيل الاشتراك",
                        `إعادة تفعيل اشتراك "${r.restaurant_name}".`,
                        (reason) => setSubStatus(r, "active", reason),
                      )}>إعادة تفعيل</Button>
                    )}
                    <Button
                      size="sm"
                      variant={r.is_active ? "destructive" : "default"}
                      onClick={() => askConfirm(
                        r.is_active ? "إيقاف المطعم" : "تفعيل المطعم",
                        r.is_active
                          ? `إيقاف "${r.restaurant_name}" يوقف بوته واستقبال طلباته بالكامل. متأكد؟`
                          : `إعادة تفعيل "${r.restaurant_name}".`,
                        (reason) => setActive(r, !r.is_active, reason),
                      )}
                    >
                      <Power className="h-4 w-4 ml-1" />
                      {r.is_active ? "إيقاف" : "تفعيل"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد نتائج</p>}
          </div>
        </TabsContent>

        {/* ---------------- HEALTH ---------------- */}
        <TabsContent value="health" className="space-y-3">
          <p className="text-sm text-muted-foreground">آخر 24 ساعة — مرتّب حسب الأخطاء.</p>
          <div className="grid gap-2">
            {health.map((h) => {
              const bad = h.errors_24h > 0;
              const idle = !h.last_activity_at;
              return (
                <Card key={h.restaurant_id} className={bad ? "border-destructive/60" : undefined}>
                  <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium flex items-center gap-2">
                        {bad && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        {h.restaurant_name}
                        {!h.is_active && <Badge variant="destructive">موقوف</Badge>}
                        {!h.bot_connected && <Badge variant="outline">بلا بوت</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">آخر نشاط: {since(h.last_activity_at)}</div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span>تشغيلات: <b>{h.total_runs_24h}</b></span>
                      <span className={bad ? "text-destructive font-semibold" : ""}>أخطاء: <b>{h.errors_24h}</b></span>
                      <span>زمن: <b>{h.avg_latency_ms}ms</b></span>
                      <span className={idle ? "text-muted-foreground" : "text-green-600"}>
                        {idle ? "خامل" : "نشط"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {health.length === 0 && <p className="text-center text-muted-foreground py-8">لا بيانات صحة</p>}
          </div>
        </TabsContent>

        {/* ---------------- FINANCE ---------------- */}
        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">الإيراد الشهري (MRR)</div>
              <div className="text-2xl font-bold">{finance ? fmtIqd(finance.mrr_iqd) : "—"}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">اشتراكات نشطة</div>
              <div className="text-2xl font-bold">{finance?.active_subs ?? "—"}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">معلّقة</div>
              <div className="text-2xl font-bold">{finance?.suspended_subs ?? "—"}</div>
            </CardContent></Card>
          </div>

          <div>
            <h3 className="font-semibold mb-2">تنتهي خلال 7 أيام</h3>
            <div className="grid gap-2">
              {(finance?.expiring_soon ?? []).map((e) => (
                <Card key={e.restaurant_id}><CardContent className="py-3 flex justify-between items-center">
                  <span>{e.restaurant_name}</span>
                  <Badge variant="outline">{new Date(e.period_end).toLocaleDateString("ar")}</Badge>
                </CardContent></Card>
              ))}
              {(!finance || finance.expiring_soon.length === 0) && (
                <p className="text-sm text-muted-foreground py-4">لا اشتراكات تنتهي قريباً.</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* activate-plan dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تفعيل باقة لـ {dialog.row?.restaurant_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm mb-2 block">الباقة</label>
              <Select value={planCode} onValueChange={setPlanCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.code}>{p.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm mb-2 block">عدد الأشهر</label>
              <Input type="number" min={1} value={months} onChange={(e) => setMonths(parseInt(e.target.value || "1", 10))} />
            </div>
            <div>
              <label className="text-sm mb-2 block">طريقة الدفع</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">كاش</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="zain_cash">Zain Cash</SelectItem>
                  <SelectItem value="fastpay">FastPay</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm mb-2 block">ملاحظات (اختياري)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: رقم الإيصال، اسم المحوّل..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>إلغاء</Button>
            <Button onClick={activate} disabled={submitting}>
              {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} تفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* destructive confirm */}
      <AlertDialog open={confirm.open} onOpenChange={(o) => !o && setConfirm({ ...confirm, open: false })}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <label className="text-sm mb-2 block">السبب (يُسجَّل في سجل التدقيق)</label>
            <Input value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })}
              placeholder="اختياري" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void runConfirm(); }} disabled={confirming}>
              {confirming && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
