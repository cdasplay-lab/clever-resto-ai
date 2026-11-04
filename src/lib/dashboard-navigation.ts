import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  Code2,
  CreditCard,
  Home,
  Link2,
  Megaphone,
  MessageSquare,
  Settings,
  Share2,
  ShieldAlert,
  ShoppingBag,
  Users,
  UtensilsCrossed,
} from "lucide-react";

export const DASHBOARD_GROUPS = [
  {
    label: "اليومي",
    items: [
      {
        value: "overview",
        label: "الرئيسية",
        description: "الطلبات الجارية ونشاط مطعمك اليوم",
        icon: Home,
      },
      {
        value: "orders",
        label: "الطلبات",
        description: "تابع الطلب من الاستلام إلى التوصيل",
        icon: ShoppingBag,
      },
      {
        value: "conversations",
        label: "المحادثات",
        description: "كل رسائل الزبائن وتحويلها للموظف",
        icon: MessageSquare,
      },
      {
        value: "menu",
        label: "المنيو",
        description: "الأصناف والأسعار والتوفر والإضافات",
        icon: UtensilsCrossed,
      },
      {
        value: "branches",
        label: "الفروع",
        description: "الفروع وساعات العمل ومناطق التوصيل",
        icon: Building2,
      },
    ],
  },
  {
    label: "النمو",
    items: [
      {
        value: "customers",
        label: "الزبائن",
        description: "بيانات الزبائن وسجل طلباتهم",
        icon: Users,
      },
      {
        value: "marketing",
        label: "التسويق",
        description: "حملات مطعمك ورسائلك التسويقية",
        icon: Megaphone,
      },
      { value: "combos", label: "الكومبوهات", description: "الوجبات المجمعة والعروض", icon: Boxes },
      {
        value: "social",
        label: "ستوري وتعليقات",
        description: "متابعة تفاعل قنوات التواصل",
        icon: Share2,
      },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { value: "channels", label: "القنوات", description: "ربط وإدارة قنوات التواصل", icon: Link2 },
      {
        value: "analytics",
        label: "التحليلات",
        description: "تقارير المبيعات وأداء الوكيل",
        icon: BarChart3,
      },
      {
        value: "subscription",
        label: "الاشتراك",
        description: "باقتك وحدود استخدامك",
        icon: CreditCard,
      },
      {
        value: "health",
        label: "صحة الوكيل",
        description: "سجلات التشغيل والأخطاء",
        icon: Activity,
      },
      {
        value: "complaints",
        label: "الشكاوى",
        description: "متابعة الشكاوى ومعالجتها",
        icon: ShieldAlert,
      },
      {
        value: "integration",
        label: "تكامل API",
        description: "ربط أنظمتك وإدارة مفاتيح التكامل",
        icon: Code2,
      },
      {
        value: "settings",
        label: "الإعدادات",
        description: "معلومات المطعم وشخصية الوكيل",
        icon: Settings,
      },
    ],
  },
] as const;

export const DASHBOARD_ITEMS = DASHBOARD_GROUPS.flatMap((group) => [...group.items]);
export type DashboardTab = (typeof DASHBOARD_ITEMS)[number]["value"];
export const isDashboardTab = (value: string): value is DashboardTab =>
  DASHBOARD_ITEMS.some((item) => item.value === value);
