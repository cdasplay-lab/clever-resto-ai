import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import {
  ShoppingBag,
  MessageSquare,
  UtensilsCrossed,
  BarChart3,
  Menu as MenuIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { value: string; label: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY: Item[] = [
  { value: "orders", label: "الطلبات", icon: ShoppingBag },
  { value: "conversations", label: "المحادثات", icon: MessageSquare },
  { value: "menu", label: "المنيو", icon: UtensilsCrossed },
  { value: "analytics", label: "تحليلات", icon: BarChart3 },
];

const MORE: { value: string; label: string }[] = [
  { value: "branches", label: "الفروع" },
  { value: "channels", label: "القنوات" },
  { value: "customers", label: "الزبائن" },
  { value: "social", label: "ستوري/تعليقات" },
  { value: "marketing", label: "تسويق" },
  { value: "combos", label: "كومبوهات" },
  { value: "complaints", label: "الشكاوى" },
  { value: "subscription", label: "الاشتراك" },
  { value: "health", label: "صحة البوت" },
  { value: "settings", label: "الإعدادات" },
];

export function MobileBottomNav({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <nav
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur md:hidden"
      aria-label="التنقل"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-5">
        {PRIMARY.map((it) => {
          const active = value === it.value;
          const Icon = it.icon;
          return (
            <button
              key={it.value}
              type="button"
              onClick={() => onChange(it.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              <span className="leading-none">{it.label}</span>
            </button>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                MORE.some((m) => m.value === value) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <MenuIcon className="h-5 w-5" />
              <span className="leading-none">المزيد</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-safe">
            <SheetHeader>
              <SheetTitle className="text-right">المزيد</SheetTitle>
            </SheetHeader>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MORE.map((m) => {
                const active = value === m.value;
                return (
                  <SheetClose
                    key={m.value}
                    active={active}
                    label={m.label}
                    onSelect={() => onChange(m.value)}
                  />
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

// Small wrapper so each item closes the sheet on tap.
import { SheetClose as RadixSheetClose } from "@/components/ui/sheet";
function SheetClose({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <RadixSheetClose asChild>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "rounded-lg border px-3 py-3 text-sm transition-colors",
          active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-card text-foreground hover:bg-accent",
        )}
      >
        {label}
      </button>
    </RadixSheetClose>
  );
}
