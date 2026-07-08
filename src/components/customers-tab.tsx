import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { mergeFeatureFlags } from "@/lib/feature-flags";

type Memory = {
  id: string;
  channel: string;
  customer_handle: string;
  customer_name: string | null;
  total_orders: number;
  lifetime_value: number;
  last_order_at: string | null;
  last_address: string | null;
  last_phone: string | null;
  preferences: string | null;
  notes: string | null;
};

export function CustomersTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Memory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { preferences: string; notes: string }>>({});

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: mem }] = await Promise.all([
      supabase.from("restaurants").select("feature_flags").eq("id", restaurantId).maybeSingle(),
      supabase
        .from("customer_memory")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("last_order_at", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);
    setEnabled(!!(r?.feature_flags as any)?.customer_memory_enabled);
    setRows((mem ?? []) as Memory[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [restaurantId]);

  async function toggleFlag(v: boolean) {
    setEnabled(v);
    try {
      await mergeFeatureFlags(restaurantId, { customer_memory_enabled: v });
      toast.success(v ? "تم تفعيل ذاكرة الزبون" : "تم إيقاف ذاكرة الزبون");
    } catch {
      toast.error("تعذّر الحفظ");
      setEnabled(!v);
    }
  }

  async function saveRow(row: Memory) {
    const d = drafts[row.id] ?? { preferences: row.preferences ?? "", notes: row.notes ?? "" };
    const { error } = await supabase
      .from("customer_memory")
      .update({ preferences: d.preferences || null, notes: d.notes || null })
      .eq("id", row.id);
    if (error) toast.error("تعذّر الحفظ");
    else { toast.success("تم الحفظ"); void load(); }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> ذاكرة الزبون</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-medium">تفعيل ذاكرة الزبون للبوت</Label>
              <p className="text-xs text-muted-foreground">
                البوت يتذكر اسم الزبون وعنوانه السابق ويرحّب به باسمه. يتم التحديث تلقائياً بعد كل طلب مؤكد.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={toggleFlag} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-medium">الزبائن ({rows.length})</h3>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد ذاكرة بعد. ستظهر هنا بعد أول طلب مؤكد.</p>
        )}
        {rows.map((row) => {
          const d = drafts[row.id] ?? { preferences: row.preferences ?? "", notes: row.notes ?? "" };
          return (
            <Card key={row.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <div className="font-medium">{row.customer_name || row.customer_handle}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.channel} · {row.customer_handle} · {row.total_orders} طلب · {Number(row.lifetime_value).toLocaleString()} د.ع
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.last_order_at ? new Date(row.last_order_at).toLocaleString("ar") : "—"}
                  </div>
                </div>
                {(row.last_address || row.last_phone) && (
                  <div className="text-xs text-muted-foreground">
                    {row.last_address && <>📍 {row.last_address} </>}
                    {row.last_phone && <>· 📞 {row.last_phone}</>}
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">تفضيلات (يراها البوت)</Label>
                    <Textarea
                      value={d.preferences}
                      onChange={(e) => setDrafts((p) => ({ ...p, [row.id]: { ...d, preferences: e.target.value } }))}
                      placeholder="مثلاً: يحب الحار، بدون بصل"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ملاحظات داخلية (سرية)</Label>
                    <Textarea
                      value={d.notes}
                      onChange={(e) => setDrafts((p) => ({ ...p, [row.id]: { ...d, notes: e.target.value } }))}
                      placeholder="ملاحظات لا تُكشف للزبون"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => saveRow(row)}>
                    <Save className="h-4 w-4 ml-2" /> حفظ
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
