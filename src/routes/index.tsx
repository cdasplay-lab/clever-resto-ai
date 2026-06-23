import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Bot,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Clock,
  TrendingUp,
  ShieldCheck,
  Zap,
  ArrowLeft,
  CheckCircle2,
  Send,
  Image as ImageIcon,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "وكيل ذكي لمطعمك — يرد، يستلم الطلبات، ويبيع 24/7" },
      {
        name: "description",
        content:
          "منصة وكيل AI للمطاعم: يرد على الزبائن في تيليجرام وواتساب وإنستغرام، يستلم الطلبات تلقائياً، ويفهم المنيو من صورة واحدة.",
      },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "وكيل ذكي لمطعمك — يرد ويبيع 24/7" },
      {
        property: "og:description",
        content: "ارفع صورة منيو واحدة، واتركنا نتولى الردود والطلبات نيابة عنك.",
      },
      { property: "og:locale", content: "ar_IQ" },
    ],
  }),
  component: Landing,
});

function Landing() {
  // Render the landing immediately — no blocking splash. If a session exists,
  // redirect in the background. This eliminates a slow LCP on first visit.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.replace("/dashboard");
      }
    });
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-base font-bold">مطعمي AI</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">المزايا</a>
            <a href="#how" className="hover:text-foreground">كيف يشتغل</a>
            <a href="#pricing" className="hover:text-foreground">الأسعار</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">دخول</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">ابدأ مجاناً</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-14 text-center md:pt-24 md:pb-28">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            وكيل AI متخصص للمطاعم — يرد بلهجتك
          </div>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-6xl">
            خلي وكيل ذكي يرد على زبائنك
            <br />
            <span className="bg-gradient-to-l from-foreground to-muted-foreground bg-clip-text text-transparent">
              ويستلم طلباتك 24 ساعة
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            ارفع صورة منيو واحدة. نحوّلها أصناف وأسعار تلقائياً، ونربط مطعمك بـ تيليجرام وواتساب
            وإنستغرام — والوكيل يرد، يقترح، ويسجّل الطلب لحسابك.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link to="/auth">
                ابدأ مجاناً
                <ArrowLeft className="mr-1 h-4 w-4" />
              </Link>
            </Button>
            <a
              href="#how"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent"
            >
              شوف كيف يشتغل
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            بدون بطاقة ائتمان · إعداد بأقل من 5 دقائق
          </p>

          {/* Mock chat */}
          <div className="mx-auto mt-14 max-w-2xl rounded-2xl border border-border bg-card p-4 text-right shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium">دردشة تيليجرام · مطعم البيت</span>
              </div>
              <span className="text-xs text-muted-foreground">مباشر</span>
            </div>
            <div className="space-y-3 py-4">
              <Bubble side="right" text="السلام عليكم، عندكم برغر؟" />
              <Bubble
                side="left"
                text="وعليكم السلام 👋 إي عدنا — برغر كلاسيك بـ 7,000 د.ع، وبرغر دجاج بـ 6,000 د.ع. تحب توصيل لو استلام؟"
              />
              <Bubble side="right" text="توصيل، اثنين كلاسيك" />
              <Bubble
                side="left"
                text="تمام ✅ المجموع 14,000 د.ع + توصيل. اكتبلي العنوان والاسم لو سمحت."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Logos / trust */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4">
          <Stat value="24/7" label="ردود فورية" />
          <Stat value="< 5 ث" label="متوسط الرد" />
          <Stat value="+38%" label="زيادة الطلبات" />
          <Stat value="4 قنوات" label="تيليجرام · واتساب · IG · FB" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="المزايا"
          title="كل اللي يحتاجه مطعمك بمكان واحد"
          subtitle="من استلام الطلب إلى تحليل المبيعات — بدون أي خبرة تقنية."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Feature
            icon={<ImageIcon className="h-5 w-5" />}
            title="ارفع منيو من صورة"
            text="صور المنيو وارفعها — الذكاء الاصطناعي يستخرج الأصناف والأسعار تلقائياً."
          />
          <Feature
            icon={<MessageSquare className="h-5 w-5" />}
            title="رد ذكي بلهجتك"
            text="الوكيل يفهم لهجة زبائنك ويرد بأسلوب مطعمك — رسمي أو ودود."
          />
          <Feature
            icon={<ShoppingBag className="h-5 w-5" />}
            title="استلام طلبات تلقائي"
            text="يجمع الأصناف، العنوان، ورقم الهاتف ويرسلها مباشرة لوحة التحكم."
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="ربط بضغطة زر"
            text="اربط بوت تيليجرام مالك بنفسك — بدون دوخات API."
          />
          <Feature
            icon={<Clock className="h-5 w-5" />}
            title="يحترم أوقات الدوام"
            text="يرد للزبائن خارج الدوام بأن المطعم مغلق ويعرض ساعات العمل."
          />
          <Feature
            icon={<BarChart3 className="h-5 w-5" />}
            title="تحليلات وأرباح"
            text="شوف المبيعات اليومية، الأصناف الأكثر طلباً، والقنوات الأنشط."
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60 bg-muted/30 cv-auto">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionHeader
            eyebrow="الخطوات"
            title="ابدأ بـ 3 خطوات فقط"
            subtitle="من التسجيل لأول طلب — أقل من 5 دقائق."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Step
              n="1"
              title="سجّل مطعمك"
              text="أنشئ حساب مجاني وأضف اسم المطعم واللغة وأوقات الدوام."
            />
            <Step
              n="2"
              title="ارفع المنيو"
              text="صور المنيو وارفعها — يطلع جدول الأصناف جاهز للتعديل."
            />
            <Step
              n="3"
              title="اربط القناة"
              text="حط توكن بوت تيليجرام، والوكيل يبدأ يرد فوراً."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="الأسعار"
          title="ابدأ مجاناً — وسع لما تكبر"
          subtitle="بدون عقود. تكدر تلغي بأي وقت."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <PricingCard
            name="مجاني"
            price="0"
            period="للأبد"
            features={[
              "حتى 100 محادثة شهرياً",
              "قناة تيليجرام",
              "استخراج المنيو من الصور",
              "لوحة طلبات أساسية",
            ]}
            cta="ابدأ مجاناً"
            highlighted={false}
          />
          <PricingCard
            name="احترافي"
            price="49"
            period="شهرياً"
            features={[
              "محادثات غير محدودة",
              "كل القنوات (واتساب · IG · FB)",
              "تحليلات متقدمة",
              "دعم فني مخصص",
            ]}
            cta="ابدأ التجربة"
            highlighted
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/60 cv-auto">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            مطعمك جاهز يبيع وأنت نايم؟
          </h2>
          <p className="mt-3 text-muted-foreground">
            انضم لعشرات المطاعم اللي تستخدم وكيل AI لاستلام الطلبات بدون توقف.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link to="/auth">
                ابدأ الآن مجاناً
                <ArrowLeft className="mr-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> بيانات مشفّرة
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> نتائج بأول أسبوع
            </span>
            <span className="inline-flex items-center gap-1">
              <Send className="h-3.5 w-3.5" /> دعم سريع
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} مطعمي AI — جميع الحقوق محفوظة</div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">الخصوصية</Link>
            <Link to="/terms" className="hover:text-foreground">الشروط</Link>
            <a href="#pricing" className="hover:text-foreground">الأسعار</a>
            <Link to="/auth" className="hover:text-foreground">دخول</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Bubble({ side, text }: { side: "left" | "right"; text: string }) {
  const isUser = side === "right";
  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "rounded-br-sm bg-muted text-foreground"
            : "rounded-bl-sm bg-foreground text-background"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold md:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/20">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-4 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
        {n}
      </div>
      <h3 className="mt-2 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  period,
  features,
  cta,
  highlighted,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        highlighted
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 right-6 rounded-full bg-background px-3 py-0.5 text-xs font-medium text-foreground">
          الأكثر شعبية
        </div>
      )}
      <div className="text-sm opacity-80">{name}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-bold">${price}</span>
        <span className="text-sm opacity-70">/ {period}</span>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        asChild
        className="mt-6 w-full"
        variant={highlighted ? "secondary" : "default"}
      >
        <Link to="/auth">{cta}</Link>
      </Button>
    </div>
  );
}
