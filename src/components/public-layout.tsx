import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { MadaLogo } from "@/components/mada-logo";
import { Button } from "@/components/ui/button";

export function PublicHeader() {
  return (
    <header className="mada-public-header">
      <Link to="/" aria-label="MADA AI — الرئيسية">
        <MadaLogo compact />
      </Link>
      <Button variant="outline" size="sm" asChild>
        <Link to="/auth">
          دخول إلى المنصة
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t px-6 py-7 text-xs text-muted-foreground">
      <span dir="ltr">MADA AI</span>
      <nav className="flex flex-wrap gap-5" aria-label="الصفحات القانونية">
        <Link to="/privacy">الخصوصية</Link>
        <Link to="/terms">الشروط</Link>
        <Link to="/data-deletion">حذف البيانات</Link>
      </nav>
    </footer>
  );
}

export function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mada-auth-layout" dir="rtl">
      <aside className="mada-auth-story">
        <Link to="/">
          <MadaLogo className="text-white" />
        </Link>
        <div className="py-16">
          <p className="mb-5 text-xs text-action">من أول رسالة إلى تأكيد الطلب</p>
          <h1 className="text-5xl font-semibold leading-[1.4] xl:text-6xl">
            كل طلب.
            <br />
            <span className="text-action">تحت السيطرة.</span>
          </h1>
          <p className="mt-6 max-w-sm leading-8 text-white/60">
            طلباتك ورسائل زبائنك وأدوات مطعمك، في مكان واحد.
          </p>
          <div className="mt-10 border-t border-white/15 pt-7">
            {[
              "استقبال الطلبات ومتابعتها",
              "محادثات موحدة مع تحويل للموظف",
              "فروع ومنيو وتحليلات",
            ].map((text) => (
              <p key={text} className="mb-4 flex items-center gap-3 text-sm text-white/80">
                <Check className="h-4 w-4 text-action" />
                {text}
              </p>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/50">
          <ShieldCheck className="h-4 w-4" />
          مساحة خاصة لإدارة مطعمك
        </p>
      </aside>
      <section className="mada-auth-form">
        <Link to="/" className="mb-10 lg:hidden">
          <MadaLogo />
        </Link>
        <div className="w-full max-w-[420px]">{children}</div>
        <Link to="/" className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          العودة للرئيسية
        </Link>
      </section>
    </div>
  );
}

const LEGAL = [
  { to: "/privacy", label: "سياسة الخصوصية" },
  { to: "/terms", label: "شروط الاستخدام" },
  { to: "/data-deletion", label: "حذف البيانات" },
] as const;
export function DocumentLayout({
  title,
  updated,
  active,
  children,
}: {
  title: string;
  updated: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mada-document-layout">
        <aside className="mada-document-nav">
          <p className="mb-4 px-3 text-xs font-medium text-muted-foreground">الوثائق القانونية</p>
          <nav aria-label="الوثائق القانونية">
            {LEGAL.map(({ to, label }) => (
              <Link key={to} to={to} aria-current={active === to ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="mada-document-article">
          <p className="mb-3 text-xs text-muted-foreground">MADA AI / الوثائق القانونية</p>
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className="mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            آخر تحديث: {updated}
          </p>
          <div className="mt-9 space-y-6 text-sm leading-8 md:text-base">{children}</div>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
