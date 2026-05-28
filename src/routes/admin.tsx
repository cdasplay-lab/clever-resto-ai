import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Shield, Search } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Row = {
  restaurant_id: string;
  restaurant_name: string;
  owner_email: string | null;
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

function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; row?: Row }>({ open: false });
  const [planCode, setPlanCode] = useState("starter");
  const [months, setMonths] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void check();
  }, []);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { void navigate({ to: "/auth" }); return; }
    const { data } = await supabase.rpc("is_platform_admin", { _user_id: user.id });
    if (!data) {
      setIsAdmin(false); setLoading(false); return;
    }
    setIsAdmin(true);
    await load();
  }

  async function load() {
    setLoading(true);
    const [{ data: restos }, { data: subs }, { data: plansData }] = await Promise.all([
      supabase.from("restaurants").select("id,name,owner_id"),
      supabase.from("restaurant_subscriptions")
        .select("restaurant_id,status,period_start,period_end,plans(code,name_ar,max_ai_replies,max_confirmed_orders)")
        .eq("status", "active"),
      supabase.from("plans").select("id,code,name_ar").eq("is_active", true).order("sort_order"),
    ]);
    const subMap = new Map<string, any>();
    (subs || []).forEach((s: any) => subMap.set(s.restaurant_id, s));

    // Fetch usage counters for each active sub
    const usageMap = new Map<string, { ai: number; ord: number }>();
    if (subs && subs.length) {
      const restIds = subs.map((s: any) => s.restaurant_id);
      const { data: counters } = await supabase
        .from("usage_counters")
        .select("restaurant_id,period_start,ai_replies_used,confirmed_orders_used")
        .in("restaurant_id", restIds);
      (counters || []).forEach((c: any) => {
        const s = subMap.get(c.restaurant_id);
        if (s && new Date(c.period_start).getTime() === new Date(s.period_start).getTime()) {
          usageMap.set(c.restaurant_id, { ai: c.ai_replies_used, ord: c.confirmed_orders_used });
        }
      });
    }

    // Fetch owner emails via profiles
    const ownerIds = (restos || []).map((r: any) => r.owner_id);
    const { data: profs } = await supabase.from("profiles").select("id,email").in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
    const emailMap = new Map<string, string>();
    (profs || []).forEach((p: any) => emailMap.set(p.id, p.email));

    const out: Row[] = (restos || []).map((r: any) => {
      const s = subMap.get(r.id);
      const u = usageMap.get(r.id);
      return {
        restaurant_id: r.id,
        restaurant_name: r.name,
        owner_email: emailMap.get(r.owner_id) ?? null,
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
    setLoading(false);
  }

  async function activate() {
    if (!dialog.row) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("activate_subscription", {
      _restaurant_id: dialog.row.restaurant_id,
      _plan_code: planCode,
      _months: months,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تفعيل الباقة");
    setDialog({ open: false });
    await load();
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

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield /> لوحة الأدمن — إدارة الاشتراكات</h1>
        <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>عودة</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث باسم المطعم أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-3">
        {filtered.map((r) => (
          <Card key={r.restaurant_id}>
            <CardContent className="pt-6 flex flex-wrap gap-4 items-center justify-between">
              <div className="space-y-1">
                <div className="font-semibold">{r.restaurant_name}</div>
                <div className="text-xs text-muted-foreground">{r.owner_email}</div>
                {r.plan_code ? (
                  <div className="flex gap-2 text-sm">
                    <Badge>{r.plan_name}</Badge>
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
              <Button onClick={() => { setDialog({ open: true, row: r }); setPlanCode(r.plan_code ?? "starter"); setMonths(1); }}>
                تفعيل / تغيير باقة
              </Button>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد نتائج</p>}
      </div>

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>إلغاء</Button>
            <Button onClick={activate} disabled={submitting}>
              {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
