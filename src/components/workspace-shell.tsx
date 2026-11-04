import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, ArrowUpLeft, LogOut, Store } from "lucide-react";
import { MadaLogo } from "@/components/mada-logo";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DASHBOARD_GROUPS, DASHBOARD_ITEMS } from "@/lib/dashboard-navigation";

export function WorkspaceShell({
  name,
  tab,
  onNavigate,
  onLogout,
  children,
}: {
  name: string;
  tab: string;
  onNavigate: (value: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const current = DASHBOARD_ITEMS.find((item) => item.value === tab);
  return (
    <div dir="rtl" className="mada-workspace">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-50 focus:rounded-lg focus:bg-action focus:p-3 focus:text-ink"
      >
        انتقل للمحتوى
      </a>
      <aside className="mada-sidebar" aria-label="أقسام مطعمك">
        <Link to="/" className="border-b border-sidebar-border px-6 py-6">
          <MadaLogo className="text-sidebar-foreground" />
        </Link>
        <button
          type="button"
          onClick={() => onNavigate("branches")}
          className="mx-4 mt-4 flex min-w-0 items-center gap-3 rounded-lg border border-sidebar-border p-3 text-start hover:bg-sidebar-accent"
        >
          <Store className="h-5 w-5 shrink-0 text-action" />
          <span className="min-w-0">
            <strong className="block truncate text-sm">{name}</strong>
            <span className="text-[11px] text-sidebar-foreground/60">الفروع والتوصيل</span>
          </span>
          <ArrowUpLeft className="ms-auto h-4 w-4 shrink-0" />
        </button>
        <nav className="pb-3">
          {DASHBOARD_GROUPS.map((group) => (
            <section className="mada-sidebar-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className="mada-nav-item"
                  aria-current={tab === value ? "page" : undefined}
                  onClick={() => onNavigate(value)}
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <button type="button" onClick={onLogout} className="mada-nav-item">
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="mada-workspace-main">
        <header className="mada-topbar">
          <Link to="/" className="lg:hidden">
            <MadaLogo compact />
          </Link>
          <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
            <Store className="h-4 w-4" />
            <span className="truncate">{name}</span>
            <span className="px-1 opacity-50">/</span>
            <span>{current?.label || "أقسام المطعم"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <time className="me-3 hidden text-xs text-muted-foreground md:block">
              {new Intl.DateTimeFormat("ar-IQ", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Asia/Baghdad",
              }).format(new Date())}
            </time>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onNavigate("health")}
              aria-label="صحة الوكيل"
            >
              <Activity className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label="تسجيل الخروج"
              className="lg:hidden"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="outline-none">
          <div className="mada-page-header">
            <h1>{tab === "overview" ? "مطعمك، بنظرة واحدة." : current?.label || "أقسام مطعمك"}</h1>
            <p>
              {tab === "overview"
                ? `${name} · تابع الطلبات والرسائل من مكان واحد`
                : current?.description || "كل الأدوات اللي تحتاجها لإدارة مطعمك"}
            </p>
          </div>
          {children}
        </main>
      </div>
      <MobileBottomNav value={tab} onChange={onNavigate} />
    </div>
  );
}

export function AllSections({ onNavigate }: { onNavigate: (value: string) => void }) {
  return (
    <div className="space-y-7">
      {DASHBOARD_GROUPS.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{group.label}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {group.items.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onNavigate(value)}
                className="mada-panel group flex min-h-24 flex-col items-start gap-2 p-4 text-start transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className="h-5 w-5" />
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <strong className="text-sm font-medium">{label}</strong>
                <span className="hidden text-xs text-muted-foreground sm:block">{description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
