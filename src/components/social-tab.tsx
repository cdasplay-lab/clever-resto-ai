import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mergeFeatureFlags } from "@/lib/feature-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Instagram, Facebook, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  platform: string;
  kind: string;
  external_id: string;
  customer_handle: string | null;
  customer_name: string | null;
  incoming_text: string | null;
  reply_text: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

const KIND_AR: Record<string, string> = {
  story_reply: "رد ستوري",
  comment: "تعليق",
  mention: "إشارة",
};
const STATUS_AR: Record<string, string> = {
  pending: "قيد المعالجة",
  replied: "تم الرد",
  skipped: "تم التجاوز",
  failed: "فشل",
};
const STATUS_COLOR: Record<string, string> = {
  replied: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  skipped: "bg-muted text-muted-foreground border-border",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function SocialTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [storyOn, setStoryOn] = useState(false);
  const [commentOn, setCommentOn] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: items }] = await Promise.all([
      supabase.from("restaurants").select("feature_flags").eq("id", restaurantId).maybeSingle(),
      supabase
        .from("social_interactions")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const flags = (r?.feature_flags as any) || {};
    setStoryOn(!!flags.story_replies_enabled);
    setCommentOn(!!flags.comment_replies_enabled);
    setRows((items ?? []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [restaurantId]);

  async function setFlag(key: "story_replies_enabled" | "comment_replies_enabled", v: boolean) {
    if (key === "story_replies_enabled") setStoryOn(v); else setCommentOn(v);
    try {
      await mergeFeatureFlags(restaurantId, { [key]: v });
      toast.success("تم");
    } catch {
      toast.error("تعذّر الحفظ");
      void load();
    }
  }

  async function saveReply(row: Row) {
    const text = drafts[row.id] ?? row.reply_text ?? "";
    const { error } = await supabase
      .from("social_interactions")
      .update({ reply_text: text, status: "replied", error: null })
      .eq("id", row.id);
    if (error) toast.error("تعذّر الحفظ"); else { toast.success("تم تحديث الرد"); void load(); }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إعدادات الستوري والتعليقات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="font-medium flex items-center gap-2"><Instagram className="h-4 w-4" /> ردود الستوري</Label>
              <p className="text-xs text-muted-foreground">البوت يرد تلقائياً برد قصير على ردود الستوري الواردة. الرد يحسب على باقتك.</p>
            </div>
            <Switch checked={storyOn} onCheckedChange={(v) => setFlag("story_replies_enabled", v)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="font-medium flex items-center gap-2"><Facebook className="h-4 w-4" /> ردود التعليقات</Label>
              <p className="text-xs text-muted-foreground">البوت يرد على تعليقات منشوراتك على Instagram/Facebook. للطلبات يوجّه الزبون للـ DM.</p>
            </div>
            <Switch checked={commentOn} onCheckedChange={(v) => setFlag("comment_replies_enabled", v)} />
          </div>
          <p className="text-xs text-muted-foreground border-t pt-3">
            ملاحظة: ربط حسابات Instagram/Facebook الفعلي يتم من تبويب "القنوات". هذه الصفحة تعرض كل التفاعلات التي وصلت ونتيجة الرد عليها.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-medium">آخر التفاعلات ({rows.length})</h3>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 ml-2" /> تحديث
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد تفاعلات بعد.</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const draft = drafts[row.id] ?? row.reply_text ?? "";
          const Icon = row.platform === "facebook" ? Facebook : Instagram;
          return (
            <Card key={row.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{row.customer_name || row.customer_handle || "زبون"}</span>
                    <Badge variant="outline" className="text-xs">{KIND_AR[row.kind] ?? row.kind}</Badge>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLOR[row.status] ?? ""}`}>
                      {STATUS_AR[row.status] ?? row.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("ar")}</span>
                </div>
                {row.incoming_text && (
                  <div className="text-sm bg-muted/40 rounded p-2">
                    <span className="text-xs text-muted-foreground block mb-1">رسالة الزبون:</span>
                    {row.incoming_text}
                  </div>
                )}
                <div>
                  <Label className="text-xs">رد البوت (تقدر تعدّله قبل النشر)</Label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                    rows={2}
                    placeholder="لم يُولَّد رد بعد"
                  />
                </div>
                {row.error && <p className="text-xs text-red-400">⚠ {row.error}</p>}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => saveReply(row)}>
                    <Save className="h-4 w-4 ml-2" /> حفظ التعديل
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
