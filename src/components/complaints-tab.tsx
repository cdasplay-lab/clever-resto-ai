import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, MessageSquare, Clock } from "lucide-react";
import { toast } from "sonner";

const TYPE_AR: Record<string, string> = {
  late: "تأخير", cold: "بارد", missing: "ناقص",
  wrong: "غلط", quality: "جودة", rude: "سوء معاملة", other: "أخرى",
};

const STATUS_AR: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "محلولة",
};

type Complaint = {
  id: string;
  type: string;
  note: string;
  status: string;
  channel: string | null;
  customer_name: string | null;
  customer_handle: string | null;
  order_id: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export function ComplaintsTab({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "today">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("complaints")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as Complaint[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`complaints-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints", filter: `restaurant_id=eq.${restaurantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId]);

  async function updateStatus(c: Complaint, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    const noteAddition = notes[c.id]?.trim();
    if (noteAddition) {
      patch.note = `${c.note}\n— ${noteAddition}`;
    }
    const { error } = await supabase.from("complaints").update(patch).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setNotes((n) => ({ ...n, [c.id]: "" }));
    toast.success("تم التحديث");
    load();
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const filtered = items.filter((c) => {
    if (filter === "open" && c.status !== "open") return false;
    if (filter === "today" && new Date(c.created_at) < today) return false;
    return true;
  });

  const counts = {
    open: items.filter((c) => c.status === "open").length,
    in_progress: items.filter((c) => c.status === "in_progress").length,
    resolved: items.filter((c) => c.status === "resolved").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-semibold">الشكاوى</h2>
          <Badge variant="destructive">{counts.open} مفتوحة</Badge>
          <Badge variant="outline">{counts.in_progress} قيد</Badge>
          <Badge variant="secondary">{counts.resolved} محلولة</Badge>
        </div>
        <div className="flex gap-1">
          {(["open", "today", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1 text-xs ${filter === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
            >
              {f === "open" ? "المفتوحة" : f === "today" ? "اليوم" : "الكل"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">ما اكو شكاوى 🎉</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <Card key={c.id} className={c.status === "open" ? "border-destructive/50" : ""}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {c.status === "open" && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />}
                    {c.customer_name || c.customer_handle || "زبون"}
                    <Badge variant="outline" className="text-xs">{TYPE_AR[c.type] || c.type}</Badge>
                    <Badge variant={c.status === "open" ? "destructive" : c.status === "resolved" ? "secondary" : "default"} className="text-xs">
                      {STATUS_AR[c.status] || c.status}
                    </Badge>
                  </CardTitle>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(c.created_at).toLocaleString("ar")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="whitespace-pre-wrap text-sm bg-muted/40 rounded-md p-3">{c.note || "—"}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {c.channel && <Badge variant="outline">{c.channel}</Badge>}
                  {c.customer_handle && <span>@{c.customer_handle}</span>}
                  {c.order_id && <span>الطلب: #{c.order_id.slice(0, 8)}</span>}
                </div>
                {c.status !== "resolved" && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="ملاحظة (اختياري) — تنحفظ مع الشكوى"
                      value={notes[c.id] || ""}
                      onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                      className="text-sm"
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      {c.conversation_id && (
                        <Button
                          variant="outline" size="sm"
                          onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set("tab", "conversations");
                            url.searchParams.set("conv", c.conversation_id!);
                            window.location.href = url.toString();
                          }}
                        >
                          <MessageSquare className="h-4 w-4 ml-1" /> افتح المحادثة
                        </Button>
                      )}
                      {c.status === "open" && (
                        <Button variant="secondary" size="sm" onClick={() => updateStatus(c, "in_progress")}>
                          علّم قيد المعالجة
                        </Button>
                      )}
                      <Button size="sm" onClick={() => updateStatus(c, "resolved")}>
                        علّم محلولة
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
