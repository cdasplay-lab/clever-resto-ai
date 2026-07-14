import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
  SheetClose,
} from "@/components/ui/sheet";
import {
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  Grid2X2,
  HeartHandshake,
  Home,
  Link2,
  Megaphone,
  MessageSquare,
  PackageSearch,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { value: string; label: string; icon: React.ComponentType<{ className?: string }> };

// With RTL grid placement this order mirrors the Mada reference:
// reports · products · home · orders · more.
const PRIMARY: Item[] = [
  { value: "analytics", label: "التقارير", icon: BarChart3 },
  { value: "menu", label: "المنتجات", icon: UtensilsCrossed },
  { value: "overview", label: "الرئيسية", icon: Home },
  { value: "orders", label: "الطلبات", icon: ShoppingBag },
];

const MORE: Item[] = [
  { value: "conversations", label: "المحادثات", icon: MessageSquare },
  { value: "branches", label: "الفروع", icon: Building2 },
  { value: "channels", label: "القنوات", icon: Link2 },
  { value: "customers", label: "الزبائن", icon: Users },
  { value: "social", label: "ستوري وتعليقات", icon: Share2 },
  { value: "marketing", label: "التسويق", icon: Megaphone },
  { value: "combos", label: "الكومبوهات", icon: Boxes },
  { value: "complaints", label: "الشكاوى", icon: HeartHandshake },
  { value: "subscription", label: "الاشتراك", icon: CircleDollarSign },
  { value: "health", label: "صحة البوت", icon: Bot },
  { value: "integration", label: "تكامل API", icon: ShieldCheck },
  { value: "settings", label: "الإعدادات", icon: Settings },
];

export function MobileBottomNav({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const moreActive = MORE.some((m) => m.value === value);

  return (
    <nav
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-safe shadow-[0_-16px_45px_-30px_oklch(0.2_0.04_150/0.45)] backdrop-blur-xl md:hidden"
      aria-label="التنقل"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1">
        {PRIMARY.map((item) => {
          const active = value === item.value;
          const Icon = item.icon;
          const isHome = item.value === "overview";
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "group flex flex-col items-center justify-end gap-1 py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex h-8 w-10 items-center justify-center rounded-xl transition-all",
                  active && "bg-primary/10",
                  isHome && active && "-mt-4 h-12 w-14 rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_-12px_oklch(0.35_0.1_155/0.8)]",
                )}
              >
                <Icon className={cn("h-5 w-5", isHome && active && "h-6 w-6")} />
              </span>
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-end gap-1 py-1.5 text-[10px] font-medium transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className={cn("flex h-8 w-10 items-center justify-center rounded-xl", moreActive && "bg-primary/10")}>
                <Grid2X2 className="h-5 w-5" />
              </span>
              <span className="leading-none">المزيد</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82vh] overflow-y-auto rounded-t-[2rem] border-0 pb-safe">
            <SheetHeader>
              <SheetTitle className="flex items-center justify-between text-right text-xl">
                كل أدوات مطعمك
                <Store className="h-5 w-5 text-primary" />
              </SheetTitle>
            </SheetHeader>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {MORE.map((item) => {
                const active = value === item.value;
                const Icon = item.icon;
                return (
                  <SheetClose asChild key={item.value}>
                    <button
                      type="button"
                      onClick={() => onChange(item.value)}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-background text-foreground hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </button>
                  </SheetClose>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <PackageSearch className="h-3.5 w-3.5" /> كل مميزات منصتك محفوظة هنا
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
