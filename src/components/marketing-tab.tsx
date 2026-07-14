import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Megaphone, CheckCircle2, Send, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Campaign = {
  id: string;
  title: string;
  message_template: string;
  channel: string;
  segment: string;
  segment_params: Record<string, any>;
  status: string;
  stats: { recipients?: number; sent?: number; failed?: number; skipped?: number; error?: string };
  created_at: string;
  sent_at: string | null;
};

const SEGMENT_AR: Record<string, string> = {
  all: "كل الزبائن",
  vip: "زبائن VIP (طلبات كثيرة)",
  recent: "نشطون مؤخراً",
  inactive: "غير نشطين",
  custom_handles: "قائمة مخصصة",
};
const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  sending: "قيد الإرسال",
  sent: "أُرسلت",
  failed: "فشلت",
  cancelled: "ملغاة",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  approved: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sending: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function MarketingTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Campaign[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // form
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("telegram");
  const [segment, setSegment] = useState("all");
  const [minOrders, setMinOrders] = useState(3);
  const [days, setDays] = useState(14);
  const [handles, setHandles] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50);
    setList((data ?? []) as Campaign[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [restaurantId]);

  async function createDraft() {
    if (!title.trim() || !message.trim()) return toast.error("العنوان والرسالة مطلوبان");
    setSaving(true);
    const segment_params: any = {};
    if (segment === "vip") segment_params.min_orders = Number(minOrders) || 3;
    else if (segment === "recent" || segment === "inactive") segment_params.days = Number(days) || 14;
    else if (segment === "custom_handles") {
      segment_params.handles = handles.split(/[\n, ]+/).map((s) => s.trim()).filter(Boolean);
    }
    const { error } = await supabase.from("marketing_campaigns").insert({
      restaurant_id: restaurantId,
      title: title.trim(),
      message_template: message.trim(),
      channel,
      segment,
      segment_params,
      status: "draft",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء المسودة");
    setTitle(""); setMessage(""); setHandles("");
    void load();
  }

  async function approve(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("approve_campaign", { _campaign_id: id });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("تم الاعتماد. تقدر ترسلها الآن.");
    void load();
  }

  async function send(id: string) {
    if (!confirm("هل تريد إرسال الحملة الآن لكل الزبائن المطابقين؟")) return;
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("marketing-send", { body: { campaign_id: id } });
    setBusyId(null);
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(`تم — أُرسلت ${r.sent ?? 0}/${r.recipients ?? 0} (فشل ${r.failed ?? 0}، تجاوز ${r.skipped ?? 0})`);
    void load();
  }

  async function del(id: string) {
    if (!confirm("حذف الحملة؟")) return;
    const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold md:text-2xl">التسويق الذكي</h2>
          <p className="mt-1 text-xs text-muted-foreground">أنشئ حملات مرتبة وأرسلها للفئة الصحيحة من زبائنك</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" />
        </div>
      </div>

      <Card className="border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> حملة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">العنوان (داخلي)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: عرض الجمعة" />
            </div>
            <div>
              <Label className="text-xs">القناة</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="instagram" disabled>Instagram (قريباً)</SelectItem>
                  <SelectItem value="whatsapp" disabled>WhatsApp (قريباً)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">الرسالة (تقدر تستخدم {"{{name}}"} للاسم)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={"هلا {{name}} 👋\nاليوم عندنا عرض خاص: ..."}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">الفئة المستهدفة</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_AR).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {segment === "vip" && (
              <div>
                <Label className="text-xs">الحد الأدنى للطلبات</Label>
                <Input type="number" value={minOrders} onChange={(e) => setMinOrders(Number(e.target.value))} />
              </div>
            )}
            {(segment === "recent" || segment === "inactive") && (
              <div>
                <Label className="text-xs">عدد الأيام</Label>
                <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            )}
            {segment === "custom_handles" && (
              <div className="md:col-span-2">
                <Label className="text-xs">قائمة الـ handles (مفصولة بفاصلة أو سطر جديد)</Label>
                <Textarea value={handles} onChange={(e) => setHandles(e.target.value)} rows={2} placeholder="@user1, @user2" />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={createDraft} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ كمسودة"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            كل حملة تمر بمرحلتين: <b>مسودة</b> → <b>معتمدة</b> → <b>أُرسلت</b>. الإرسال يحسب على رصيد ردود AI في باقتك.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-medium">الحملات ({list.length})</h3>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 ml-2" /> تحديث
        </Button>
      </div>

      {loading && <div className="flex justify-center p-6"><Loader2 className="animate-spin" /></div>}
      {!loading && list.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد حملات بعد.</p>
      )}

      <div className="space-y-3">
        {list.map((c) => (
          <Card key={c.id} className="border-0">
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.title}</span>
                  <Badge variant="outline" className="text-xs">{c.channel}</Badge>
                  <Badge variant="outline" className="text-xs">{SEGMENT_AR[c.segment] ?? c.segment}</Badge>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[c.status] ?? ""}`}>
                    {STATUS_AR[c.status] ?? c.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("ar")}</span>
              </div>
              <pre className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap font-sans">{c.message_template}</pre>
              {c.stats && (c.stats.recipients !== undefined || c.stats.error) && (
                <div className="text-xs text-muted-foreground">
                  {c.stats.error
                    ? <span className="text-red-400">⚠ {c.stats.error}</span>
                    : <>إجمالي: {c.stats.recipients ?? 0} · أُرسلت: {c.stats.sent ?? 0} · فشل: {c.stats.failed ?? 0} · تجاوز: {c.stats.skipped ?? 0}</>
                  }
                </div>
              )}
              <div className="flex justify-end gap-2">
                {c.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => approve(c.id)} disabled={busyId === c.id}>
                    <CheckCircle2 className="h-4 w-4 ml-2" /> اعتماد
                  </Button>
                )}
                {c.status === "approved" && (
                  <Button size="sm" onClick={() => send(c.id)} disabled={busyId === c.id}>
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 ml-2" /> إرسال الآن</>}
                  </Button>
                )}
                {c.status !== "sending" && (
                  <Button size="sm" variant="ghost" onClick={() => del(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
