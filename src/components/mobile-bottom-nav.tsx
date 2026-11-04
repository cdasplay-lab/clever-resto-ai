import { Home, MessageSquare, MoreHorizontal, ShoppingBag } from "lucide-react";

const ITEMS = [
  { value: "overview", label: "الرئيسية", icon: Home },
  { value: "orders", label: "الطلبات", icon: ShoppingBag },
  { value: "conversations", label: "المحادثات", icon: MessageSquare },
  { value: "more", label: "المزيد", icon: MoreHorizontal },
];

export function MobileBottomNav({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const active = ITEMS.some((item) => item.value === value) ? value : "more";
  return (
    <nav dir="rtl" className="mada-bottom-nav" aria-label="التنقل الرئيسي">
      {ITEMS.map(({ value: key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-current={active === key ? "page" : undefined}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
