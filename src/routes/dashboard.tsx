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
import { Loader2, Copy, LogOut, Plus, Trash2, Search, MessageSquare, Send, Instagram, Facebook, Phone } from "lucide-react";

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
type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  is_available: boolean;
  image_url: string | null;
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
            <Button variant="ghost" onClick={logout}><LogOut className="ml-2 h-4 w-4" />خروج</Button>
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
          <Button variant="ghost" onClick={onLogout}><LogOut className="ml-2 h-4 w-4" />خروج</Button>
        </div>

        <Tabs defaultValue="menu" dir="rtl">
          <TabsList className="mb-4">
            <TabsTrigger value="menu">المنيو</TabsTrigger>
            <TabsTrigger value="orders">الطلبات</TabsTrigger>
            <TabsTrigger value="conversations">المحادثات</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
            <TabsTrigger value="integration">الربط مع منصتك</TabsTrigger>
          </TabsList>

          <TabsContent value="menu"><MenuTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="orders"><OrdersTab restaurantId={restaurant.id} /></TabsContent>
          <TabsContent value="conversations"><ConversationsTab restaurantId={restaurant.id} /></TabsContent>
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
      .select("id,name,description,category,price,is_available,image_url")
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إضافة صنف</CardTitle>
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
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="h-14 w-14 rounded object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">لا صورة</div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.name} {it.category && <Badge variant="secondary" className="mr-2">{it.category}</Badge>}</div>
                      {it.description && <div className="text-sm text-muted-foreground truncate">{it.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono">{it.price}</div>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setItemImage(it, f); e.currentTarget.value = ""; }} />
                      <span className="inline-flex h-9 items-center rounded-md border px-2 text-xs hover:bg-accent">{it.image_url ? "تغيير الصورة" : "رفع صورة"}</span>
                    </label>
                    {it.image_url && <Button variant="ghost" size="sm" onClick={() => removeItemImage(it)}>حذف الصورة</Button>}
                    <Button variant="ghost" size="icon" onClick={() => del(it.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTab({ restaurantId }: { restaurantId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    supabase
      .from("orders")
      .select("id,customer_name,customer_phone,delivery_address,total,status,created_at,items")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setOrders((data as any) ?? []));
    const ch = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        supabase
          .from("orders").select("id,customer_name,customer_phone,delivery_address,total,status,created_at,items")
          .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(50)
          .then(({ data }) => setOrders((data as any) ?? []));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId]);

  return (
    <Card>
      <CardHeader><CardTitle>الطلبات الواردة</CardTitle></CardHeader>
      <CardContent>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو طلبات بعد</p> : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{o.customer_name || "زبون"} — {o.customer_phone}</div>
                  <Badge>{o.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{o.delivery_address}</div>
                <ul className="mt-2 text-sm">
                  {(Array.isArray(o.items) ? o.items : []).map((i: any, idx: number) => (
                    <li key={idx}>{i.qty} × {i.name} — {i.unit_price}</li>
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

function ConversationsTab({ restaurantId }: { restaurantId: string }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  async function loadConvs() {
    const { data } = await supabase
      .from("conversations")
      .select("id,channel,customer_handle,customer_name,state,last_message_at")
      .eq("restaurant_id", restaurantId)
      .order("last_message_at", { ascending: false })
      .limit(50);
    setConvs((data as any) ?? []);
  }
  useEffect(() => { loadConvs(); }, [restaurantId]);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selected)
      .order("created_at")
      .then(({ data }) => setMessages(data ?? []));
  }, [selected]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle>المحادثات</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto">
          {convs.length === 0 ? <p className="text-sm text-muted-foreground">ما اكو محادثات</p> : (
            <ul className="space-y-1">
              {convs.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-md p-2 text-right text-sm hover:bg-accent ${selected === c.id ? "bg-accent" : ""}`}
                  >
                    <div className="font-medium">{c.customer_name || c.customer_handle}</div>
                    <div className="text-xs text-muted-foreground">{c.channel} · {c.state}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle>الرسائل</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto">
          {!selected ? <p className="text-sm text-muted-foreground">اختر محادثة</p> : messages.map((m) => (
            <div key={m.id} className={`rounded-lg p-2 text-sm ${m.role === "user" ? "bg-accent" : m.role === "assistant" ? "bg-primary/10" : "bg-muted text-xs font-mono"}`}>
              <div className="text-xs text-muted-foreground">{m.role}{m.name ? `:${m.name}` : ""}</div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ restaurant, onChange }: { restaurant: Restaurant; onChange: (r: Restaurant) => void }) {
  const [r, setR] = useState(restaurant);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { data, error } = await supabase.from("restaurants").update({
      name: r.name, description: r.description, tone: r.tone, language: r.language,
      currency: r.currency, min_order: r.min_order,
      platform_webhook_url: r.platform_webhook_url, platform_webhook_secret: r.platform_webhook_secret,
    }).eq("id", r.id).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    onChange(data as any);
    toast.success("تم الحفظ");
  }
  return (
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
