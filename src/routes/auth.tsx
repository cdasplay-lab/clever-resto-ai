import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { MadaLogo, MadaMark } from "@/components/mada-logo";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("تم إرسال رابط تغيير كلمة السر للإيميل");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (e: any) {
      toast.error(e.message ?? "خطأ");
    } finally {
      setForgotLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب! تحقق من بريدك أو سجل دخول.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/dashboard";
      }
    } catch (e: any) {
      toast.error(e.message ?? "خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) {
        toast.error(result.error.message ?? "فشل تسجيل الدخول");
        setOauthLoading(null);
        return;
      }
      if (result.redirected) return; // browser will redirect
      window.location.href = "/dashboard";
    } catch (e: any) {
      toast.error(e.message ?? "خطأ");
      setOauthLoading(null);
    }
  }

  return (
    <div className="mada-auth relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-10" dir="rtl">
      <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-primary/10" />
      <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full border border-primary/[0.07]" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-primary/[0.045] blur-2xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden min-h-[680px] flex-col justify-between rounded-[2.5rem] bg-primary p-12 text-primary-foreground shadow-[0_40px_90px_-50px_oklch(0.28_0.08_155/0.9)] lg:flex">
          <MadaLogo className="[&_div]:text-white" />
          <div>
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 backdrop-blur">
              <Sparkles className="h-7 w-7 text-mada-gold" />
            </div>
            <h1 className="max-w-lg text-5xl font-bold leading-[1.3]">إدارة مطعمك<br />بذكاء وسهولة</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-white/70">من الطلبات إلى التحليلات والـ AI Agent، كل ما تحتاجه في منصة واحدة مرتبة.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-white/80">
            {["طلبات مباشرة", "تحليلات ذكية", "إدارة كاملة"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 rounded-2xl bg-white/[0.07] px-3 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-mada-gold" /> {feature}
              </div>
            ))}
          </div>
        </section>

        <Card className="mx-auto w-full max-w-lg border-0 bg-card/90 p-1 shadow-[0_30px_80px_-50px_oklch(0.22_0.04_150/0.55)] backdrop-blur">
          <CardHeader className="px-6 pb-4 pt-7 sm:px-9 sm:pt-9">
            <div className="mb-7 flex justify-center lg:hidden">
              <MadaLogo />
            </div>
            <div className="mb-5 hidden justify-center lg:flex"><MadaMark className="h-14 w-14" /></div>
            <CardTitle className="text-center text-2xl sm:text-3xl">{mode === "signin" ? "أهلاً برجعتك" : "ابدأ رحلتك مع Mada"}</CardTitle>
            <CardDescription className="pt-1 text-center">{mode === "signin" ? "سجل دخولك لإدارة مطعمك" : "أنشئ حسابك وخلّي مطعمك أذكى"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-7 sm:px-9 sm:pb-9">
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl"
              onClick={() => oauth("google")}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === "google" ? "..." : "متابعة بحساب Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl"
              onClick={() => oauth("apple")}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === "apple" ? "..." : "متابعة بحساب Apple"}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">أو</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">الإيميل</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة السر</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={loading}>
              {loading ? "..." : mode === "signin" ? <>دخول إلى المنصة <ArrowLeft className="h-4 w-4" /></> : <>إنشاء حساب <ArrowLeft className="h-4 w-4" /></>}
            </Button>
            {mode === "signin" && (
              <button
                type="button"
                className="w-full text-sm text-primary hover:underline"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
              >
                نسيت كلمة السر؟
              </button>
            )}
            <button
              type="button"
              className="w-full text-sm font-medium text-primary hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "ما عندك حساب؟ أنشئ حسابك الآن" : "عندك حساب؟ سجل دخول"}
            </button>
          </form>

          {forgotOpen && (
            <form onSubmit={sendReset} className="space-y-3 rounded-2xl border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label htmlFor="forgot-email">إيميلك</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  placeholder="ندزلك رابط تغيير كلمة السر"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={forgotLoading}>
                  {forgotLoading ? "..." : "إرسال الرابط"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          )}
          <p className="text-center text-[11px] leading-5 text-muted-foreground">بتسجيلك أنت توافق على شروط الاستخدام وسياسة الخصوصية</p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
