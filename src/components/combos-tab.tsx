import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pencil, Gift } from "lucide-react";
import { toast } from "sonner";

type MenuLite = { id: string; name: string; price: number; category: string | null };
type ComboItem = { menu_item_id: string; qty: number };
type Combo = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  items: ComboItem[];
  is_active: boolean;
};

export function CombosTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [menu, setMenu] = useState<MenuLite[]>([]);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase
        .from("combos")
        .select("id,name,description,price,image_url,items,is_active")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true }),
      supabase
        .from("menu_items")
        .select("id,name,price,category")
        .eq("restaurant_id", restaurantId)
        .order("name"),
    ]);
    setCombos(((c as any) ?? []) as Combo[]);
    setMenu(((m as any) ?? []) as MenuLite[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [restaurantId]);

  async function toggleActive(combo: Combo) {
    const next = !combo.is_active;
    setCombos((arr) => arr.map((x) => x.id === combo.id ? { ...x, is_active: next } : x));
    const { error } = await supabase.from("combos").update({ is_active: next }).eq("id", combo.id);
    if (error) { toast.error("تعذّر التحديث"); void load(); }
  }

  async function del(combo: Combo) {
    if (!confirm(`حذف الكومبو "${combo.name}"؟`)) return;
    const { error } = await supabase.from("combos").delete().eq("id", combo.id);
    if (error) toast.error(error.message);
    else { toast.success("تم الحذف"); void load(); }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Gift className="h-4 w-4" /> الكومبوهات (العروض المجمّعة)</CardTitle>
          <Button onClick={() => setCreating(true)}><Plus className="ml-1 h-4 w-4" /> كومبو جديد</Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            اجمع عدة أصناف بسعر خاص. البوت يقترحها على الزبائن لما يسألوا عن العروض، أو لما تكون أوفر من شراء الأصناف منفصلة.
          </p>
          {combos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا يوجد كومبوهات بعد.</p>
          ) : (
            <div className="space-y-3">
              {combos.map((c) => {
                const msrp = c.items.reduce((s, ci) => {
                  const m = menu.find((x) => x.id === ci.menu_item_id);
                  return s + (m ? Number(m.price) * ci.qty : 0);
                }, 0);
                const savings = msrp - Number(c.price);
                return (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {c.image_url ? (
                          <img src={c.image_url} alt={c.name} className="h-14 w-14 rounded object-cover" />
                        ) : (
                          <div className="h-14 w-14 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">لا صورة</div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name} {!c.is_active && <Badge variant="destructive" className="mr-2">معطّل</Badge>}</div>
                          {c.description && <div className="text-sm text-muted-foreground truncate">{c.description}</div>}
                          <div className="text-xs text-muted-foreground mt-1">
                            {c.items.length} أصناف · سعر الكومبو <span className="font-mono">{c.price}</span>
                            {savings > 0 && <span className="text-green-600 dark:text-green-400 mr-2">(توفير {savings})</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                        <Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => del(c)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <ComboDialog
          restaurantId={restaurantId}
          menu={menu}
          combo={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function ComboDialog({ restaurantId, menu, combo, onClose, onSaved }: {
  restaurantId: string;
  menu: MenuLite[];
  combo: Combo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [price, setPrice] = useState<number>(Number(combo?.price ?? 0));
  const [imageUrl, setImageUrl] = useState<string | null>(combo?.image_url ?? null);
  const [items, setItems] = useState<ComboItem[]>(combo?.items ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const msrp = items.reduce((s, ci) => {
    const m = menu.find((x) => x.id === ci.menu_item_id);
    return s + (m ? Number(m.price) * ci.qty : 0);
  }, 0);

  async function uploadImage(file: File) {
    setUploading(true);
    const path = `${restaurantId}/combo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
  }

  function addItemRow() {
    if (!menu.length) return;
    setItems((arr) => [...arr, { menu_item_id: menu[0].id, qty: 1 }]);
  }

  async function save() {
    if (!name.trim()) return toast.error("الاسم مطلوب");
    if (!items.length) return toast.error("أضف صنف واحد على الأقل");
    if (items.some((i) => !i.menu_item_id || i.qty < 1)) return toast.error("تحقّق من الأصناف والكميات");
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price) || 0,
      image_url: imageUrl,
      items,
    };
    const { error } = combo
      ? await supabase.from("combos").update(payload).eq("id", combo.id)
      : await supabase.from("combos").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(combo ? "تم التعديل" : "تم الإنشاء");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{combo ? "تعديل الكومبو" : "كومبو جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: كومبو العائلة" /></div>
          <div className="space-y-1"><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>السعر الخاص</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              {msrp > 0 && (
                <p className="text-xs text-muted-foreground">
                  السعر المعتاد للأصناف: <span className="font-mono">{msrp}</span>
                  {Number(price) > 0 && Number(price) < msrp && (
                    <span className="text-green-600 dark:text-green-400 mr-2">(توفير {msrp - Number(price)} — {Math.round(((msrp - Number(price)) / msrp) * 100)}%)</span>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>الصورة</Label>
              <div className="flex items-center gap-2">
                {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" />}
                <label className={`cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = ""; }} />
                  <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : (imageUrl ? "تغيير" : "رفع")}
                  </span>
                </label>
                {imageUrl && <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)}>إزالة</Button>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>الأصناف داخل الكومبو</Label>
              <Button variant="outline" size="sm" onClick={addItemRow}><Plus className="ml-1 h-4 w-4" /> إضافة صنف</Button>
            </div>
            {items.length === 0 && <p className="text-xs text-muted-foreground">لم تُضِف أصنافاً بعد.</p>}
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select value={it.menu_item_id} onValueChange={(v) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, menu_item_id: v } : x))}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {menu.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.price})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={it.qty} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} className="w-20" />
                <Button variant="ghost" size="icon" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
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
