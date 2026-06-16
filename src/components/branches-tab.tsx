import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, MapPin, Phone, Clock } from "lucide-react";
import { MapsLocationField } from "@/components/maps-location-field";
import { GOVERNORATES } from "@/lib/governorates-iq";

type DayHours = { open: string; close: string; closed: boolean };
type OpenHours = Record<string, DayHours>;
type CoverageType = "none" | "governorate" | "polygon" | "radius";
export type Branch = {
  id: string;
  restaurant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  delivery_areas: string[];
  open_hours: OpenHours;
  min_order: number;
  is_active: boolean;
  telegram_chat_id: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  coverage_type: CoverageType;
  coverage_governorate: string | null;
  coverage_polygon: { lat: number; lng: number }[] | null;
  coverage_radius_km: number | null;
};

const DAYS: { key: string; label: string }[] = [
  { key: "sat", label: "السبت" },
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الإثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
  { key: "fri", label: "الجمعة" },
];

function defaultHours(): OpenHours {
  return Object.fromEntries(DAYS.map((d) => [d.key, { open: "10:00", close: "23:00", closed: false }]));
}

export function BranchesTab({ restaurantId }: { restaurantId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("branches")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at");
    setBranches(((data as any) ?? []).map((b: any) => ({
      ...b,
      delivery_areas: Array.isArray(b.delivery_areas) ? b.delivery_areas : [],
      open_hours: b.open_hours && Object.keys(b.open_hours).length ? b.open_hours : defaultHours(),
      coverage_type: (b.coverage_type as CoverageType) || "none",
      coverage_governorate: b.coverage_governorate ?? null,
      coverage_polygon: Array.isArray(b.coverage_polygon) ? b.coverage_polygon : null,
      coverage_radius_km: b.coverage_radius_km ?? null,
    })));
    setLoading(false);
  }
  useEffect(() => { load(); }, [restaurantId]);

  async function addQuick(name: string) {
    if (!name.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("branches").insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      delivery_areas: [],
      open_hours: defaultHours(),
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة الفرع");
    load();
  }

  async function toggleActive(b: Branch) {
    const { error } = await supabase.from("branches").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function del(b: Branch) {
    if (!confirm(`حذف فرع "${b.name}"؟`)) return;
    const { error } = await supabase.from("branches").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>إضافة فرع جديد</CardTitle>
          <CardDescription>مثلاً: فرع الكرادة، فرع المنصور…</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              addQuick(String(fd.get("name") || ""));
              (e.currentTarget as HTMLFormElement).reset();
            }}
          >
            <Input name="name" placeholder="اسم الفرع" required />
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="ml-1 h-4 w-4" />إضافة</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>الفروع ({branches.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">ما اكو فروع بعد</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {branches.map((b) => (
                <div key={b.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {b.name}
                        {!b.is_active && <Badge variant="destructive">معطّل</Badge>}
                      </div>
                      {b.address && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />{b.address}
                        </div>
                      )}
                      {b.phone && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />{b.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => del(b)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {b.delivery_areas.length === 0 ? (
                      <span className="text-xs text-muted-foreground">ما محدد مناطق توصيل</span>
                    ) : b.delivery_areas.map((a, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{a}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />الحد الأدنى: {b.min_order}
                    </div>
                    <Button size="sm" variant={b.is_active ? "outline" : "default"} onClick={() => toggleActive(b)}>
                      {b.is_active ? "تعطيل" : "تفعيل"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <BranchEditDialog branch={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function BranchEditDialog({ branch, onClose, onSaved }: { branch: Branch; onClose: () => void; onSaved: () => void }) {
  const [b, setB] = useState<Branch>(branch);
  const [areaInput, setAreaInput] = useState("");
  const [saving, setSaving] = useState(false);

  function addArea() {
    const v = areaInput.trim();
    if (!v) return;
    if (b.delivery_areas.includes(v)) return;
    setB({ ...b, delivery_areas: [...b.delivery_areas, v] });
    setAreaInput("");
  }
  function removeArea(a: string) {
    setB({ ...b, delivery_areas: b.delivery_areas.filter((x) => x !== a) });
  }
  function updateDay(day: string, patch: Partial<DayHours>) {
    setB({ ...b, open_hours: { ...b.open_hours, [day]: { ...b.open_hours[day], ...patch } } });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("branches").update({
      name: b.name,
      address: b.address || null,
      phone: b.phone || null,
      delivery_areas: b.delivery_areas as any,
      open_hours: b.open_hours as any,
      min_order: Number(b.min_order) || 0,
      telegram_chat_id: b.telegram_chat_id || null,
      is_active: b.is_active,
      google_maps_url: b.google_maps_url,
      latitude: b.latitude,
      longitude: b.longitude,
      coverage_type: b.coverage_type,
      coverage_governorate: b.coverage_type === "governorate" ? b.coverage_governorate : null,
      coverage_radius_km: b.coverage_type === "radius" ? Number(b.coverage_radius_km) || null : null,
      coverage_polygon: b.coverage_type === "polygon" ? (b.coverage_polygon as any) : null,
    } as any).eq("id", b.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>تعديل فرع — {branch.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>الاسم</Label><Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>الهاتف</Label><Input value={b.phone ?? ""} onChange={(e) => setB({ ...b, phone: e.target.value })} /></div>
            <div className="space-y-1 md:col-span-2"><Label>عنوان الفرع</Label><Input value={b.address ?? ""} onChange={(e) => setB({ ...b, address: e.target.value })} /></div>
            <div className="space-y-1 md:col-span-2">
              <Label>موقع الفرع على الخريطة (Google Maps)</Label>
              <MapsLocationField
                url={b.google_maps_url}
                lat={b.latitude}
                lng={b.longitude}
                onChange={(u, lat, lng) => setB({ ...b, google_maps_url: u, latitude: lat, longitude: lng })}
              />
            </div>
            <div className="space-y-1"><Label>الحد الأدنى للطلب</Label><Input type="number" value={b.min_order} onChange={(e) => setB({ ...b, min_order: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Telegram chat للإشعارات (اختياري)</Label><Input value={b.telegram_chat_id ?? ""} onChange={(e) => setB({ ...b, telegram_chat_id: e.target.value })} /></div>
          </div>

          <div className="space-y-2 rounded border p-3 bg-muted/30">
            <Label className="font-semibold">نطاق التوصيل الجغرافي (Coverage)</Label>
            <p className="text-xs text-muted-foreground">يفحص الوكيل موقع الزبون (GPS) ويرفض الطلبات خارج هذا النطاق.</p>
            <div className="flex gap-2 flex-wrap">
              {([
                { v: "none", l: "بدون فحص" },
                { v: "governorate", l: "محافظة كاملة" },
                { v: "radius", l: "دائرة حول الفرع" },
                { v: "polygon", l: "منطقة مرسومة (متقدم)" },
              ] as { v: CoverageType; l: string }[]).map((o) => (
                <Button key={o.v} type="button" size="sm"
                  variant={b.coverage_type === o.v ? "default" : "outline"}
                  onClick={() => setB({ ...b, coverage_type: o.v })}>{o.l}</Button>
              ))}
            </div>
            {b.coverage_type === "governorate" && (
              <div className="space-y-1">
                <Label className="text-xs">اختر المحافظة</Label>
                <select
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={b.coverage_governorate ?? ""}
                  onChange={(e) => setB({ ...b, coverage_governorate: e.target.value || null })}
                >
                  <option value="">— اختر —</option>
                  {GOVERNORATES.map((g) => (<option key={g.code} value={g.code}>{g.name_ar}</option>))}
                </select>
              </div>
            )}
            {b.coverage_type === "radius" && (
              <div className="space-y-1">
                <Label className="text-xs">نصف القطر بالكيلومتر</Label>
                <Input type="number" min={1} step={0.5}
                  value={b.coverage_radius_km ?? ""}
                  onChange={(e) => setB({ ...b, coverage_radius_km: e.target.value ? Number(e.target.value) : null })}
                  placeholder="مثلاً: 8" />
                <p className="text-[11px] text-muted-foreground">يحتاج موقع الفرع على الخريطة محدد بالأعلى.</p>
              </div>
            )}
            {b.coverage_type === "polygon" && (
              <p className="text-xs text-muted-foreground">الرسم اليدوي على الخريطة قيد التطوير. استعمل "محافظة كاملة" أو "دائرة" حالياً.</p>
            )}
          </div>



          <div className="space-y-2">
            <Label>مناطق التوصيل</Label>
            <div className="flex gap-2">
              <Input
                placeholder="اكتب اسم منطقة واضغط إضافة (مثلاً: الكرادة)"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }}
              />
              <Button type="button" onClick={addArea}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {b.delivery_areas.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1">
                  {a}
                  <button onClick={() => removeArea(a)} className="text-muted-foreground hover:text-destructive">×</button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">البوت يوجه الطلب لهذا الفرع لما عنوان الزبون يحتوي إحدى هذه المناطق.</p>
          </div>

          <div className="space-y-2">
            <Label>أوقات الدوام</Label>
            {DAYS.map((d) => {
              const h = b.open_hours[d.key] || { open: "10:00", close: "23:00", closed: false };
              return (
                <div key={d.key} className="grid grid-cols-12 items-center gap-2 rounded border p-2">
                  <div className="col-span-3 text-sm">{d.label}</div>
                  <label className="col-span-3 flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={h.closed} onChange={(e) => updateDay(d.key, { closed: e.target.checked })} />مغلق
                  </label>
                  <div className="col-span-3"><Input type="time" value={h.open} disabled={h.closed} onChange={(e) => updateDay(d.key, { open: e.target.value })} /></div>
                  <div className="col-span-3"><Input type="time" value={h.close} disabled={h.closed} onChange={(e) => updateDay(d.key, { close: e.target.value })} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
