import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Copy, LogOut, Plus, Trash2, Search, MessageSquare, Send, Instagram, Facebook, Phone, BarChart3, Link2, CheckCircle2, Radio, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

type OpenHours = Record<string, { open: string; close: string; closed: boolean }>;
type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  language: string;
  tone: string;
  currency: string;
  min_order: number;
  platform_webhook_url: string | null;
  platform_webhook_secret: string | null;
  open_hours: OpenHours | null;
};
type MenuOptionChoice = { name: string; price_delta?: number };
type MenuOptionGroup = { name: string; type: "single" | "multi"; required?: boolean; choices: MenuOptionChoice[] };
type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  is_available: boolean;
  image_url: string | null;
  options?: MenuOptionGroup[];
};
type Order = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  total: number;
  status: string;
  created_at: string;
  items: any;
};
type Conversation = {
  id: string;
  channel: string;
  customer_handle: string | null;
  customer_name: string | null;
  state: string;
  last_message_at: string;
  is_bot_paused?: boolean;
  last_message?: string | null;
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

function channelMeta(ch: string) {
  const c = ch.toLowerCase();
  if (c === "telegram") return { label: "Telegram", icon: Send, color: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
  if (c === "whatsapp") return { label: "WhatsApp", icon: Phone, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (c === "instagram") return { label: "Instagram", icon: Instagram, color: "bg-pink-500/15 text-pink-400 border-pink-500/30" };
  if (c === "facebook") return { label: "Facebook", icon: Facebook, color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  return { label: ch, icon: MessageSquare, color: "bg-muted text-muted-foreground border-border" };
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ي`;
  return new Date(iso).toLocaleDateString("ar");
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.replace("/auth");
        return;
      }
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      setRestaurant(data as any);
      setLoading(false);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">إعداد المطعم</h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" onClick={logout}><LogOut className="ml-2 h-4 w-4" />خروج</Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>أنشئ مطعمك الأول</CardTitle>
              <CardDescription>هذا المطعم هو الذي سيتعامل معه الـ AI Agent.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCreating(true);
                  const fd = new FormData(e.currentTarget as HTMLFormElement);
                  const { data: sess } = await supabase.auth.getUser();
                  const { data, error } = await supabase
                    .from("restaurants")
                    .insert({
                      owner_id: sess.user!.id,
                      name: String(fd.get("name") || ""),
                      description: String(fd.get("description") || ""),
                      currency: String(fd.get("currency") || "IQD"),
                      min_order: Number(fd.get("min_order") || 0),
                    })
                    .select()
                    .single();
                  setCreating(false);
                  if (error) return toast.error(error.message);
                  setRestaurant(data as any);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>اسم المطعم</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-2">
                  <Label>وصف</Label>
                  <Textarea name="description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>العملة</Label>
                    <Input name="currency" defaultValue="IQD" />
                  </div>
                  <div className="space-y-2">
                    <Label>الحد الأدنى للطلب</Label>
                    <Input name="min_order" type="number" defaultValue="0" />
                  </div>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <RestaurantManager restaurant={restaurant} onLogout={logout} onChange={setRestaurant} />;
}

function RestaurantManager({
  restaurant,
  onLogout,
  onChange,
}: {
  restaurant: Restaurant;
  onLogout: () => void;
  onChange: (r: Restaurant) => void;
}) {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{restaurant.name}</h1>
            <p className="text-sm text-muted-foreground">لوحة إدارة الـ AI Agent</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={onLogout}><LogOut className="ml-2 h-4 w-4" />خروج</Button>
          </div>
        </div>

        <Tabs defaultValue="menu" dir="rtl">
          <TabsList className="mb-4">
            <TabsTrigger value="menu">المنيو</TabsTrigger>
            <TabsTrigger value="orders">الطلبات</TabsTrigger>
            <TabsTrigger value="conversations">المحادثات</TabsTrigger>
            <TabsTrigger value="channels">القنوات</TabsTrigger>
            <TabsTrigger value="analytics">التحليلات</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
            <TabsTrigger value="integration">الربط مع منصتك</TabsTrigger>
          </TabsList>

          <TabsContent value="menu"><MenuTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="orders"><OrdersTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="conversations"><ConversationsTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="channels"><ChannelsTab restaurant={restaurant} /></TabsContent>
          <TabsContent value="analytics"><AnalyticsTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="settings"><SettingsTab restaurant={restaurant} onChange={onChange} /></TabsContent>
          <TabsContent value="integration"><IntegrationTab restaurant={restaurant} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MenuTab({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("menu_items")
      .select("id,name,description,category,price,is_available,image_url,options")
      .eq("restaurant_id", restaurantId)
      .order("category", { nullsFirst: false })
      .order("name");
    setItems((data as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [restaurantId]);

  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function setItemImage(item: MenuItem, file: File) {
    const url = await uploadImage(file);
    if (!url) return;
    const { error } = await supabase.from("menu_items").update({ image_url: url }).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("تم رفع الصورة");
    load();
  }

  async function removeItemImage(item: MenuItem) {
    await supabase.from("menu_items").update({ image_url: null }).eq("id", item.id);
    load();
  }

  async function toggleAvailable(item: MenuItem) {
    const next = !item.is_available;
    setItems((arr) => arr.map((x) => x.id === item.id ? { ...x, is_available: next } : x));
    const { error } = await supabase.from("menu_items").update({ is_available: next }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      setItems((arr) => arr.map((x) => x.id === item.id ? { ...x, is_available: item.is_available } : x));
      return;
    }
    toast.success(next ? "الصنف متوفر الآن" : "الصنف خلصان — الوكيل ما راح يبيعه");
  }

  async function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = (fd.get("image") as File | null);
    let image_url: string | null = null;
    if (file && file.size > 0) image_url = await uploadImage(file);
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: restaurantId,
        name: String(fd.get("name") || ""),
        description: String(fd.get("description") || "") || null,
        category: String(fd.get("category") || "") || null,
        price: Number(fd.get("price") || 0),
        image_url,
      })
      .select()
      .single();
    setAdding(false);
    if (error) return toast.error(error.message);
    // trigger embedding
    supabase.functions.invoke("menu-embed", { body: { menu_item_id: (data as any).id } }).catch(() => {});
    form.reset();
    toast.success("أضيف الصنف");
    load();
  }

  async function del(id: string) {
    if (!confirm("متأكد؟")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    load();
  }

  async function reembedAll() {
    toast("جاري حساب الـ embeddings ...");
    const { error } = await supabase.functions.invoke("menu-embed", { body: { restaurant_id: restaurantId } });
    if (error) toast.error(error.message);
    else toast.success("تمت إعادة الفهرسة");
  }

  const [aiUploading, setAiUploading] = useState(false);
  async function aiUploadMenu(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAiUploading(true);
    const tid = toast.loading(`جاري قراءة ${files.length} صورة بالذكاء الاصطناعي ...`);
    try {
      const images: string[] = [];
      for (const f of Array.from(files)) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        images.push(b64);
      }
      const { data, error } = await supabase.functions.invoke("menu-extract", {
        body: { restaurant_id: restaurantId, images },
      });
      toast.dismiss(tid);
      if (error) return toast.error(error.message);
      if ((data as any)?.error) return toast.error((data as any).error);
      const n = (data as any)?.inserted ?? 0;
      if (n === 0) toast.warning("ما تم استخراج أي صنف، جرب صورة أوضح");
      else toast.success(`تمت إضافة ${n} صنف من الصورة 🎉`);
      load();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message || "فشل الرفع");
    } finally {
      setAiUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>إضافة صنف</CardTitle>
          <label className={`cursor-pointer ${aiUploading ? "opacity-60 pointer-events-none" : ""}`}>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { aiUploadMenu(e.target.files); e.currentTarget.value = ""; }}
            />
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              {aiUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              رفع منيو بالذكاء الاصطناعي
            </span>
          </label>
        </CardHeader>
        <CardContent>
          <form onSubmit={addItem} className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Input name="name" placeholder="اسم الصنف" required />
            <Input name="category" placeholder="الصنف (مثلاً: ساندويش)" />
            <Input name="price" placeholder="السعر" type="number" required />
            <Input name="description" placeholder="وصف مختصر" />
            <Input name="image" type="file" accept="image/*" />
            <Button type="submit" disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="ml-1 h-4 w-4" />إضافة</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>المنيو ({items.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={reembedAll}>إعادة فهرسة AI</Button>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد أصناف بعد</p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {it.image_url ? (
                        <img src={it.image_url} alt={it.name} className="h-14 w-14 rounded object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">لا صورة</div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.name} {it.category && <Badge variant="secondary" className="mr-2">{it.category}</Badge>}{Array.isArray(it.options) && it.options.length > 0 && <Badge variant="outline" className="mr-2">{it.options.length} خيارات</Badge>}</div>
                        {it.description && <div className="text-sm text-muted-foreground truncate">{it.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono">{it.price}</div>
                      {!it.is_available && <Badge variant="destructive">خلصان</Badge>}
                      <Button
                        variant={it.is_available ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleAvailable(it)}
                        title={it.is_available ? "ضع كخلصان" : "أعد توفيره"}
                      >
                        {it.is_available ? "خلصان" : "متوفر"}
                      </Button>
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setItemImage(it, f); e.currentTarget.value = ""; }} />
                        <span className="inline-flex h-9 items-center rounded-md border px-2 text-xs hover:bg-accent">{it.image_url ? "تغيير الصورة" : "رفع صورة"}</span>
                      </label>
                      {it.image_url && <Button variant="ghost" size="sm" onClick={() => removeItemImage(it)}>حذف الصورة</Button>}
                      <EditItemDialog item={it} onSaved={load} />
                      <Button variant="ghost" size="icon" onClick={() => del(it.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <OptionsEditor item={it} onSaved={load} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OptionsEditor({ item, onSaved }: { item: MenuItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<MenuOptionGroup[]>(Array.isArray(item.options) ? item.options : []);
  const [saving, setSaving] = useState(false);

  function update(next: MenuOptionGroup[]) { setGroups(next); }
  function addGroup() { update([...groups, { name: "", type: "single", required: false, choices: [{ name: "", price_delta: 0 }] }]); }
  function removeGroup(gi: number) { update(groups.filter((_, i) => i !== gi)); }
  function addChoice(gi: number) {
    const next = [...groups]; next[gi] = { ...next[gi], choices: [...next[gi].choices, { name: "", price_delta: 0 }] }; update(next);
  }
  function removeChoice(gi: number, ci: number) {
    const next = [...groups]; next[gi] = { ...next[gi], choices: next[gi].choices.filter((_, i) => i !== ci) }; update(next);
  }

  async function save() {
    setSaving(true);
    // Filter out empty groups/choices
    const clean = groups
      .map((g) => ({ ...g, name: g.name.trim(), choices: g.choices.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), price_delta: Number(c.price_delta || 0) })) }))
      .filter((g) => g.name && g.choices.length > 0);
    const { error } = await supabase.from("menu_items").update({ options: clean as any }).eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الخيارات");
    setOpen(false);
    onSaved();
  }

  return (
    <div className="mt-2 border-t pt-2">
      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)}>
        {open ? "إخفاء الخيارات" : `الخيارات / الإضافات (${groups.length})`}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="rounded border bg-muted/30 p-2">
              <div className="flex items-center gap-2">
                <Input placeholder="اسم المجموعة (مثلاً: الحجم)" value={g.name} onChange={(e) => { const n = [...groups]; n[gi] = { ...g, name: e.target.value }; update(n); }} className="h-8" />
                <Select value={g.type} onValueChange={(v) => { const n = [...groups]; n[gi] = { ...g, type: v as any }; update(n); }}>
                  <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">اختيار واحد</SelectItem>
                    <SelectItem value="multi">متعدد</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={!!g.required} onChange={(e) => { const n = [...groups]; n[gi] = { ...g, required: e.target.checked }; update(n); }} />
                  إلزامي
                </label>
                <Button variant="ghost" size="icon" onClick={() => removeGroup(gi)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 space-y-1">
                {g.choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <Input placeholder="اسم الخيار (مثلاً: كبير)" value={c.name} onChange={(e) => { const n = [...groups]; const ch = [...n[gi].choices]; ch[ci] = { ...c, name: e.target.value }; n[gi] = { ...g, choices: ch }; update(n); }} className="h-8" />
                    <Input type="number" placeholder="فرق السعر" value={c.price_delta ?? 0} onChange={(e) => { const n = [...groups]; const ch = [...n[gi].choices]; ch[ci] = { ...c, price_delta: Number(e.target.value) }; n[gi] = { ...g, choices: ch }; update(n); }} className="h-8 w-28" />
                    <Button variant="ghost" size="icon" onClick={() => removeChoice(gi, ci)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => addChoice(gi)}><Plus className="ml-1 h-3 w-3" />إضافة خيار</Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addGroup}><Plus className="ml-1 h-3 w-3" />مجموعة جديدة</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ الخيارات"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}



const ORDER_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "قيد الاستلام" },
  { value: "confirmed", label: "مؤكد" },
  { value: "preparing", label: "قيد التحضير" },
  { value: "out_for_delivery", label: "بالطريق" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغى" },
];

function OrdersTab({ restaurantId }: { restaurantId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("id,customer_name,customer_phone,delivery_address,total,status,created_at,items")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50);
    setOrders((data as any) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId]);

  async function changeStatus(orderId: string, status: string) {
    setUpdating(orderId);
    const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", orderId);
    if (error) { toast.error(error.message); setUpdating(null); return; }
    // Notify customer on their channel (non-blocking)
    supabase.functions.invoke("notify-order-status", { body: { order_id: orderId } })
      .then(({ error: e }) => { if (e) toast.error("تم التحديث لكن فشل الإشعار: " + e.message); else toast.success("تم تحديث الحالة وإشعار الزبون"); })
      .finally(() => setUpdating(null));
  }

  return (
    <Card>
      <CardHeader><CardTitle>الطلبات الواردة</CardTitle></CardHeader>
      <CardContent>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو طلبات بعد</p> : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium min-w-0 truncate">{o.customer_name || "زبون"} — {o.customer_phone}</div>
                  <div className="flex items-center gap-2">
                    <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)} disabled={updating === o.id}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {updating === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{o.delivery_address}</div>
                <ul className="mt-2 text-sm">
                  {(Array.isArray(o.items) ? o.items : []).map((i: any, idx: number) => (
                    <li key={idx}>
                      {i.qty} × {i.name} — {i.unit_price}
                      {Array.isArray(i.selected_options) && i.selected_options.length > 0 && (
                        <span className="text-muted-foreground"> ({i.selected_options.map((s: any) => `${s.group}: ${s.choice}`).join("، ")})</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-left font-mono">الإجمالي: {o.total}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsTab({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ daily: { day: string; orders: number; revenue: number }[]; totals: { orders: number; revenue: number; convs: number; aov: number }; topItems: { name: string; qty: number }[] }>({
    daily: [], totals: { orders: 0, revenue: 0, convs: 0, aov: 0 }, topItems: [],
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: orders }, { count: convCount }] = await Promise.all([
        supabase.from("orders").select("id,total,status,created_at,items").eq("restaurant_id", restaurantId).gte("created_at", since).limit(1000),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).gte("created_at", since),
      ]);
      const list = (orders as any[]) || [];
      const byDay = new Map<string, { orders: number; revenue: number }>();
      const itemQty = new Map<string, number>();
      let totalRev = 0;
      for (const o of list) {
        const day = (o.created_at as string).slice(0, 10);
        const cur = byDay.get(day) || { orders: 0, revenue: 0 };
        cur.orders += 1;
        if (o.status !== "cancelled") { cur.revenue += Number(o.total || 0); totalRev += Number(o.total || 0); }
        byDay.set(day, cur);
        for (const it of (Array.isArray(o.items) ? o.items : [])) {
          itemQty.set(it.name, (itemQty.get(it.name) || 0) + Number(it.qty || 0));
        }
      }
      const daily = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day: day.slice(5), ...v }));
      const topItems = Array.from(itemQty.entries()).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
      const ordersCount = list.length;
      setData({
        daily,
        totals: { orders: ordersCount, revenue: totalRev, convs: convCount || 0, aov: ordersCount ? Math.round(totalRev / ordersCount) : 0 },
        topItems,
      });
      setLoading(false);
    })();
  }, [restaurantId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>الطلبات (30 يوم)</CardDescription><CardTitle className="text-2xl">{data.totals.orders}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>الإيرادات</CardDescription><CardTitle className="text-2xl">{data.totals.revenue.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>المحادثات</CardDescription><CardTitle className="text-2xl">{data.totals.convs}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>متوسط قيمة الطلب</CardDescription><CardTitle className="text-2xl">{data.totals.aov.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />الطلبات اليومية</CardTitle></CardHeader>
        <CardContent>
          {data.daily.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو بيانات</p> : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>الأكثر طلباً</CardTitle></CardHeader>
        <CardContent>
          {data.topItems.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو طلبات بعد</p> : (
            <ul className="space-y-2">
              {data.topItems.map((i, idx) => (
                <li key={i.name} className="flex items-center justify-between border-b pb-1 text-sm">
                  <span>{idx + 1}. {i.name}</span>
                  <Badge variant="secondary">{i.qty}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConversationsTab({ restaurantId }: { restaurantId: string }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "urgent">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  async function loadConvs() {
    const { data } = await supabase
      .from("conversations")
      .select("id,channel,customer_handle,customer_name,state,last_message_at,is_bot_paused")
      .eq("restaurant_id", restaurantId)
      .order("last_message_at", { ascending: false })
      .limit(100);
    const list = (data as Conversation[]) ?? [];
    // fetch last message preview for each (parallel, small N)
    const withPreview = await Promise.all(
      list.map(async (c) => {
        const { data: m } = await supabase
          .from("messages")
          .select("content,role")
          .eq("conversation_id", c.id)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...c, last_message: m?.content ?? null };
      }),
    );
    setConvs(withPreview);
  }
  useEffect(() => {
    loadConvs();
    const ch = supabase
      .channel(`convs-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `restaurant_id=eq.${restaurantId}` }, () => loadConvs())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => loadConvs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId]);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selected)
      .order("created_at")
      .then(({ data }) => setMessages(data ?? []));
    const ch = supabase
      .channel(`msgs-${selected}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected]);

  const channels = Array.from(new Set(convs.map((c) => c.channel)));
  const filtered = convs.filter((c) => {
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (filter === "open" && !["greeting", "collecting_items", "confirm"].includes(c.state)) return false;
    if (filter === "urgent" && c.state !== "handoff") return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = (c.customer_name || "").toLowerCase().includes(q)
        || (c.customer_handle || "").toLowerCase().includes(q)
        || (c.last_message || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const selectedConv = convs.find((c) => c.id === selected);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* List */}
      <Card className="lg:col-span-2 flex flex-col max-h-[75vh]">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>المحادثات</CardTitle>
            <Badge variant="secondary">{filtered.length}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو الرسالة…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "urgent"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${filter === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
              >
                {f === "all" ? "الكل" : f === "open" ? "مفتوح" : "عاجل"}
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-border" />
            <button
              onClick={() => setChannelFilter("all")}
              className={`rounded-md border px-2.5 py-1 text-xs ${channelFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
            >كل القنوات</button>
            {channels.map((c) => {
              const m = channelMeta(c);
              const Icon = m.icon;
              return (
                <button
                  key={c}
                  onClick={() => setChannelFilter(c)}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${channelFilter === c ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                >
                  <Icon className="h-3 w-3" />{m.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ما اكو محادثات</p> : (
            <ul className="space-y-1">
              {filtered.map((c) => {
                const m = channelMeta(c.channel);
                const Icon = m.icon;
                const isSel = selected === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={`w-full rounded-lg border p-3 text-right transition ${isSel ? "border-primary bg-accent/60" : "border-transparent hover:bg-accent/40"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${m.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{c.customer_name || c.customer_handle || "زبون"}</div>
                            {c.customer_handle && c.customer_name && (
                              <div className="truncate text-xs text-muted-foreground">{c.customer_handle}</div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.last_message_at)}</div>
                      </div>
                      {c.last_message && (
                        <div className="mt-1.5 truncate text-xs text-muted-foreground">{c.last_message}</div>
                      )}
                      <div className="mt-1.5 flex items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] ${m.color}`}>{m.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{c.state}</Badge>
                        {c.is_bot_paused && <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">موظف</Badge>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Thread */}
      <Card className="lg:col-span-3 flex flex-col max-h-[75vh]">
        <CardHeader className="pb-3">
          {selectedConv ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {(() => { const m = channelMeta(selectedConv.channel); const Icon = m.icon; return (
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${m.color}`}><Icon className="h-5 w-5" /></div>
                ); })()}
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{selectedConv.customer_name || selectedConv.customer_handle || "زبون"}</CardTitle>
                  <CardDescription className="text-xs truncate">{selectedConv.customer_handle} · {channelMeta(selectedConv.channel).label}</CardDescription>
                </div>
              </div>
              <HandoffControls conv={selectedConv} onChange={loadConvs} />
            </div>
          ) : <CardTitle>الرسائل</CardTitle>}
        </CardHeader>
        <CardContent className="flex-1 space-y-2 overflow-y-auto">
          {!selected ? <p className="text-sm text-muted-foreground">اختر محادثة من القائمة</p> : messages.length === 0 ? <p className="text-sm text-muted-foreground">لا رسائل</p> : messages.map((m) => {
            const isHuman = m.role === "assistant" && m.name === "human";
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-accent" : isHuman ? "bg-emerald-600 text-white" : m.role === "assistant" ? "bg-primary text-primary-foreground" : "bg-muted text-xs font-mono"}`}>
                  <div className="mb-0.5 text-[10px] opacity-70">{m.role === "user" ? "عميل" : isHuman ? "موظف" : m.role === "assistant" ? "بوت" : m.role}</div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
        {selectedConv && (
          <Composer conversationId={selectedConv.id} disabled={!selectedConv.is_bot_paused} onSent={() => {/* realtime will refresh */}} />
        )}
      </Card>
    </div>
  );
}

function HandoffControls({ conv, onChange }: { conv: Conversation; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const { error } = await supabase
      .from("conversations")
      .update({ is_bot_paused: !conv.is_bot_paused })
      .eq("id", conv.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(conv.is_bot_paused ? "تم تشغيل البوت" : "تم إيقاف البوت — تكدر ترد يدوياً");
    onChange();
  }
  return (
    <Button size="sm" variant={conv.is_bot_paused ? "default" : "outline"} disabled={busy} onClick={toggle}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : conv.is_bot_paused ? "رجّع للبوت" : "تولّى المحادثة"}
    </Button>
  );
}

function Composer({ conversationId, disabled, onSent }: { conversationId: string; disabled: boolean; onSent: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  async function send() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-manual-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ conversation_id: conversationId, text: t }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الإرسال");
      setText("");
      onSent();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="border-t p-3">
      {disabled && (
        <p className="mb-2 text-xs text-muted-foreground">البوت شغّال. اضغط "تولّى المحادثة" حتى ترد يدوياً.</p>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="اكتب ردك…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={disabled || sending}
        />
        <Button onClick={send} disabled={disabled || sending || !text.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function SettingsTab({ restaurant, onChange }: { restaurant: Restaurant; onChange: (r: Restaurant) => void }) {
  const [r, setR] = useState<Restaurant>({ ...restaurant, open_hours: restaurant.open_hours && Object.keys(restaurant.open_hours).length ? restaurant.open_hours : defaultHours() });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { data, error } = await supabase.from("restaurants").update({
      name: r.name, description: r.description, tone: r.tone, language: r.language,
      currency: r.currency, min_order: r.min_order,
      open_hours: r.open_hours as any,
      platform_webhook_url: r.platform_webhook_url, platform_webhook_secret: r.platform_webhook_secret,
    }).eq("id", r.id).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    onChange(data as any);
    toast.success("تم الحفظ");
  }
  function updateDay(day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) {
    const hours = { ...(r.open_hours || defaultHours()) };
    hours[day] = { ...hours[day], ...patch };
    setR({ ...r, open_hours: hours });
  }
  const hours = r.open_hours || defaultHours();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>إعدادات المطعم</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>الاسم</Label><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>اللغة</Label><Input value={r.language} onChange={(e) => setR({ ...r, language: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>نبرة الرد</Label><Input value={r.tone} onChange={(e) => setR({ ...r, tone: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>الوصف</Label><Textarea value={r.description ?? ""} onChange={(e) => setR({ ...r, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>العملة</Label><Input value={r.currency} onChange={(e) => setR({ ...r, currency: e.target.value })} /></div>
            <div className="space-y-2"><Label>الحد الأدنى للطلب</Label><Input type="number" value={r.min_order} onChange={(e) => setR({ ...r, min_order: Number(e.target.value) })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>رابط Webhook لمنصتك (يُرسل إليه الطلب المؤكد)</Label><Input value={r.platform_webhook_url ?? ""} onChange={(e) => setR({ ...r, platform_webhook_url: e.target.value })} placeholder="https://your-saas.com/api/incoming-order" /></div>
            <div className="space-y-2 md:col-span-2"><Label>سر Webhook (للتحقق من التوقيع HMAC-SHA256)</Label><Input value={r.platform_webhook_secret ?? ""} onChange={(e) => setR({ ...r, platform_webhook_secret: e.target.value })} placeholder="optional" /></div>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أوقات العمل</CardTitle>
          <CardDescription>الوكيل راح يعرف اشتغل الحين أو لا، ويرد على الزبون بناءً عليها.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {DAYS.map((d) => {
              const h = hours[d.key] || { open: "10:00", close: "23:00", closed: false };
              return (
                <div key={d.key} className="grid grid-cols-12 items-center gap-2 rounded-lg border p-2">
                  <div className="col-span-3 text-sm font-medium">{d.label}</div>
                  <label className="col-span-3 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={h.closed} onChange={(e) => updateDay(d.key, { closed: e.target.checked })} />
                    مغلق
                  </label>
                  <div className="col-span-3">
                    <Input type="time" value={h.open} disabled={h.closed} onChange={(e) => updateDay(d.key, { open: e.target.value })} />
                  </div>
                  <div className="col-span-3">
                    <Input type="time" value={h.close} disabled={h.closed} onChange={(e) => updateDay(d.key, { close: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </div>
          <Button onClick={save} disabled={saving} className="mt-4">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ أوقات العمل"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationTab({ restaurant }: { restaurant: Restaurant }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-api`;

  async function generate() {
    setGenerating(true);
    const { data, error } = await supabase.rpc("create_api_key", { p_restaurant_id: restaurant.id, p_label: "platform" });
    setGenerating(false);
    if (error) return toast.error(error.message);
    setApiKey(data as string);
  }
  function copy(t: string) { navigator.clipboard.writeText(t); toast.success("نسخ"); }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>مفتاح API لمنصتك</CardTitle><CardDescription>استخدمه بهيدر <code>X-API-Key</code></CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {apiKey ? (
            <div className="rounded-md border bg-muted p-3 font-mono text-sm break-all">
              {apiKey}
              <Button variant="ghost" size="icon" className="mr-2" onClick={() => copy(apiKey)}><Copy className="h-4 w-4" /></Button>
              <p className="mt-2 text-xs text-destructive">احفظه الحين، ما راح ينعرض مرة ثانية.</p>
            </div>
          ) : (
            <Button onClick={generate} disabled={generating}>{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "توليد مفتاح جديد"}</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>نقاط نهاية API</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Endpoint method="GET" url={`${baseUrl}/menu`} desc="جلب المنيو" />
          <Endpoint method="POST" url={`${baseUrl}/menu`} desc="إضافة صنف" />
          <Endpoint method="PUT" url={`${baseUrl}/menu`} desc="استبدال المنيو كامل (bulk)" />
          <Endpoint method="GET" url={`${baseUrl}/orders`} desc="الطلبات" />
          <Endpoint method="PATCH" url={`${baseUrl}/orders/{id}`} desc="تحديث حالة طلب" />
          <Endpoint method="GET" url={`${baseUrl}/conversations`} desc="المحادثات" />
          <Endpoint method="GET" url={`${baseUrl}/conversations/{id}`} desc="رسائل محادثة" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ربط Telegram</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>الـ webhook مال البوت يحتاج يشير إلى:</p>
          <div className="rounded bg-muted p-2 font-mono break-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook</div>
          <p className="text-muted-foreground">تم ربط بوت Telegram عبر Connector. كلم البوت لتجريب الـ Agent (تأكد أنك سجلت الـ webhook).</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Endpoint({ method, url, desc }: { method: string; url: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 rounded border p-2 font-mono text-xs">
      <Badge variant="outline">{method}</Badge>
      <span className="flex-1 break-all">{url}</span>
      <span className="text-muted-foreground font-sans">{desc}</span>
    </div>
  );
}

type ChannelKey = "telegram" | "whatsapp" | "instagram" | "facebook";

function ChannelsTab({ restaurant }: { restaurant: Restaurant }) {
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;
  const [values, setValues] = useState<Record<ChannelKey, string>>({
    telegram: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
  });
  const [saved, setSaved] = useState<Record<ChannelKey, boolean>>({
    telegram: false,
    whatsapp: false,
    instagram: false,
    facebook: false,
  });
  const [savingKey, setSavingKey] = useState<ChannelKey | null>(null);

  const COL: Record<ChannelKey, string> = {
    telegram: "telegram_bot_username",
    whatsapp: "whatsapp_number",
    instagram: "instagram_handle",
    facebook: "facebook_page",
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("telegram_bot_username, whatsapp_number, instagram_handle, facebook_page")
        .eq("id", restaurant.id)
        .maybeSingle();
      if (!data) return;
      const next: Record<ChannelKey, string> = {
        telegram: data.telegram_bot_username || "",
        whatsapp: (data as any).whatsapp_number || "",
        instagram: (data as any).instagram_handle || "",
        facebook: (data as any).facebook_page || "",
      };
      setValues(next);
      setSaved({
        telegram: !!next.telegram,
        whatsapp: !!next.whatsapp,
        instagram: !!next.instagram,
        facebook: !!next.facebook,
      });
    })();
  }, [restaurant.id]);

  function clean(key: ChannelKey, v: string) {
    const t = v.trim();
    if (key === "whatsapp") return t.replace(/[^\d+]/g, "");
    if (key === "telegram" || key === "instagram") return t.replace(/^@/, "");
    return t;
  }

  async function save(key: ChannelKey) {
    const v = clean(key, values[key]);
    if (!v) return toast.error("ادخل القيمة أولاً");
    setSavingKey(key);
    const { error } = await supabase
      .from("restaurants")
      .update({ [COL[key]]: v } as any)
      .eq("id", restaurant.id);
    setSavingKey(null);
    if (error) return toast.error(error.message);
    setValues((s) => ({ ...s, [key]: v }));
    setSaved((s) => ({ ...s, [key]: true }));
    toast.success("تم الربط");
  }

  async function disconnect(key: ChannelKey) {
    const { error } = await supabase
      .from("restaurants")
      .update({ [COL[key]]: null } as any)
      .eq("id", restaurant.id);
    if (error) return toast.error(error.message);
    setValues((s) => ({ ...s, [key]: "" }));
    setSaved((s) => ({ ...s, [key]: false }));
    toast.success("تم الفصل");
  }

  function copy(t: string) { navigator.clipboard.writeText(t); toast.success("نسخ الرابط"); }

  const FIELDS: Record<ChannelKey, { label: string; placeholder: string; hint?: string }> = {
    telegram: { label: "اسم البوت (Bot Username)", placeholder: "my_restaurant_bot", hint: "بدون @" },
    whatsapp: { label: "رقم الواتساب (مع كود الدولة)", placeholder: "+9647712345678" },
    instagram: { label: "حساب إنستغرام", placeholder: "my_restaurant", hint: "بدون @" },
    facebook: { label: "اسم صفحة فيسبوك أو رابطها", placeholder: "MyRestaurantPage" },
  };

  const channels: ChannelKey[] = ["telegram", "whatsapp", "instagram", "facebook"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> القنوات</CardTitle>
          <CardDescription>اربط قنوات مطعمك بضغطة وحدة. ادخل المعرّف واضغط ربط.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {channels.map((key) => {
          const meta = channelMeta(key);
          const Icon = meta.icon;
          const f = FIELDS[key];
          const isConnected = saved[key];
          return (
            <Card key={key} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${meta.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <CardDescription className="text-xs">
                      {isConnected ? "متصل" : "غير متصل"}
                    </CardDescription>
                  </div>
                </div>
                {isConnected && (
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 ml-1" /> مفعّل
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">{f.label}</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={f.placeholder}
                      value={values[key]}
                      onChange={(e) => setValues((s) => ({ ...s, [key]: e.target.value }))}
                      dir="ltr"
                    />
                    {isConnected ? (
                      <Button variant="outline" onClick={() => disconnect(key)}>فصل</Button>
                    ) : (
                      <Button onClick={() => save(key)} disabled={savingKey === key}>
                        {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Link2 className="h-4 w-4 ml-1" /> ربط</>)}
                      </Button>
                    )}
                  </div>
                  {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                </div>

                {key === "telegram" && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">رابط الـ Webhook</summary>
                    <div className="mt-2 flex items-center gap-2 rounded bg-muted p-2 font-mono text-[11px] break-all">
                      <span className="flex-1">{webhookUrl}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(webhookUrl)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
