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
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "تسجيل دخول" : "حساب جديد"}</CardTitle>
          <CardDescription>منصة AI Agent مال المطاعم</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => oauth("google")}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === "google" ? "..." : "متابعة بحساب Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة السر</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "دخول" : "إنشاء حساب"}
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
              className="w-full text-sm text-muted-foreground hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "ما عندك حساب؟ سوي حساب" : "عندك حساب؟ سجل دخول"}
            </button>
          </form>

          {forgotOpen && (
            <form onSubmit={sendReset} className="space-y-3 rounded-lg border p-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
