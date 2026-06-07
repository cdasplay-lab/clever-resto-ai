import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, LogOut, CheckCircle2, ArrowRight, ArrowLeft, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { MapsLocationField } from "@/components/maps-location-field";

type Restaurant = any;

const STEPS = [
  { id: 1, title: "معلومات المطعم" },
  { id: 2, title: "المنيو" },
  { id: 3, title: "أول فرع" },
  { id: 4, title: "بوت تيليجرام" },
];

export function OnboardingWizard({
  onDone,
  onLogout,
}: {
  onDone: (r: Restaurant) => void;
  onLogout: () => void;
}) {
  const [step, setStep] = useState(1);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("IQD");
  const [minOrder, setMinOrder] = useState("0");

  // Step 2
  const [menuFiles, setMenuFiles] = useState<File[]>([]);
  const [menuUploading, setMenuUploading] = useState(false);

  // Step 3
  const [branchName, setBranchName] = useState("الفرع الرئيسي");
  const [branchPhone, setBranchPhone] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchMapsUrl, setBranchMapsUrl] = useState("");
  const [branchLat, setBranchLat] = useState<number | null>(null);
  const [branchLng, setBranchLng] = useState<number | null>(null);

  // Step 4
  const [botToken, setBotToken] = useState("");

  async function submitStep1() {
    if (!name.trim()) return toast.error("اكتب اسم المطعم");
    setBusy(true);
    const { data: sess } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("restaurants")
      .insert({
        owner_id: sess.user!.id,
        name: name.trim(),
        description: description.trim() || null,
        currency: currency.trim() || "IQD",
        min_order: Number(minOrder) || 0,
      })
      .select()
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    setRestaurant(data);
    setStep(2);
  }

  async function uploadMenuImages() {
    if (!restaurant || !menuFiles.length) {
      setStep(3);
      return;
    }
    setMenuUploading(true);
    try {
      const urls: string[] = [];
      for (const file of menuFiles) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${restaurant.id}/menu/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("menu-images").getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      await supabase.from("restaurants").update({ menu_image_urls: urls }).eq("id", restaurant.id);
      toast.success("جاري استخراج المنيو بالخلفية...");
      // Fire-and-forget extraction
      supabase.functions
        .invoke("menu-extract", { body: { restaurant_id: restaurant.id, images: urls } })
        .catch(() => {});
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message || "فشل الرفع");
    } finally {
      setMenuUploading(false);
    }
  }

  async function submitStep3() {
    if (!restaurant) return;
    if (!branchName.trim()) return toast.error("اسم الفرع مطلوب");
    setBusy(true);
    const payload: any = {
      restaurant_id: restaurant.id,
      name: branchName.trim(),
      phone: branchPhone.trim() || null,
      address: branchAddress.trim() || null,
      google_maps_url: branchMapsUrl || null,
      latitude: branchLat,
      longitude: branchLng,
    };
    const { error } = await supabase.from("branches").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    setStep(4);
  }

  async function submitStep4() {
    if (!restaurant) return;
    if (!botToken.trim()) {
      // Skip — finalize
      onDone(restaurant);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-connect", {
        body: { restaurant_id: restaurant.id, bot_token: botToken.trim(), action: "connect" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("تم ربط البوت ✅");
      onDone(restaurant);
    } catch (e: any) {
      toast.error(e?.message || "فشل ربط البوت");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">إعداد المطعم</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={onLogout}>
              <LogOut className="ml-2 h-4 w-4" />خروج
            </Button>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-between gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                  step > s.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : step === s.id
                    ? "border-primary text-primary"
                    : "border-muted text-muted-foreground"
                }`}
              >
                {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
              <span className={`hidden text-xs sm:inline ${step === s.id ? "font-semibold" : "text-muted-foreground"}`}>
                {s.title}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step - 1].title}</CardTitle>
            <CardDescription>الخطوة {step} من {STEPS.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>اسم المطعم *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>وصف مختصر</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>العملة</Label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>الحد الأدنى للطلب</Label>
                    <Input type="number" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button onClick={submitStep1} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>التالي<ArrowLeft className="mr-2 h-4 w-4" /></>)}
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">
                  ارفع صور المنيو (PDF/صور). الـ AI راح يستخرج الأطباق والأسعار تلقائياً. تكدر تتجاوز وتضيف يدوياً بعدين.
                </p>
                <div className="rounded-lg border-2 border-dashed border-muted p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    id="menu-upload"
                    onChange={(e) => setMenuFiles(Array.from(e.target.files || []))}
                  />
                  <label htmlFor="menu-upload" className="cursor-pointer">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">اضغط لرفع صور المنيو</p>
                    <p className="text-xs text-muted-foreground">يمكنك رفع عدة صور</p>
                  </label>
                </div>
                {menuFiles.length > 0 && (
                  <div className="space-y-1">
                    {menuFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                        <span className="truncate">{f.name}</span>
                        <button onClick={() => setMenuFiles(menuFiles.filter((_, j) => j !== i))}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setStep(3)}>تجاوز</Button>
                  <Button onClick={uploadMenuImages} disabled={menuUploading}>
                    {menuUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>التالي<ArrowLeft className="mr-2 h-4 w-4" /></>)}
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>اسم الفرع *</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <Input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>العنوان</Label>
                  <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
                </div>
                <MapsLocationField
                  url={branchMapsUrl || null}
                  lat={branchLat}
                  lng={branchLng}
                  onChange={(url, lat, lng) => {
                    setBranchMapsUrl(url || "");
                    setBranchLat(lat);
                    setBranchLng(lng);
                  }}
                />

                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
                  <Button onClick={submitStep3} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>التالي<ArrowLeft className="mr-2 h-4 w-4" /></>)}
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                  <p className="font-semibold">كيف تجيب توكن البوت:</p>
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>افتح @BotFather بتيليجرام</li>
                    <li>اكتب /newbot واتبع التعليمات</li>
                    <li>انسخ التوكن (مثال: 12345:ABC...)</li>
                    <li>الصقه بالأسفل</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label>توكن البوت</Label>
                  <Input
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:AA..."
                    type="password"
                  />
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="ghost" onClick={() => onDone(restaurant!)}>أكمل لاحقاً</Button>
                  <Button onClick={submitStep4} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ربط وإنهاء"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
