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
  Bell,
  TrendingUp,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  Play,
  Inbox,
  MapPin,
  Brain,
  Headset,
  AlertCircle,
  Building2,
  LineChart,
  Languages,
  Mic,
  Volume2,
  Clock,
  Send,
  LayoutDashboard,
  ClipboardCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مطعمي AI — موظف ذكاء اصطناعي يستلم طلبات مطعمك 24/7" },
      {
        name: "description",
        content:
          "وكيل ذكاء اصطناعي للمطاعم في العراق والشرق الأوسط: يستقبل رسائل الزبائن على تيليجرام وواتساب، يفهم الطلب، يؤكّد التوصيل، ويرسل الطلب للوحة التحكم — بلهجتك المحلية.",
      },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "مطعمي AI — موظف ذكاء اصطناعي لمطعمك" },
      {
        property: "og:description",
        content: "يرد على زبائنك، يستلم الطلبات، ويدير مطعمك تلقائياً 24/7.",
      },
      { property: "og:locale", content: "ar_IQ" },
    ],
  }),
  component: Landing,
});

function Landing() {
  // Render immediately; redirect logged-in users in the background.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/dashboard");
    });
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* ============================= NAV ============================= */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-base font-bold">مطعمي AI</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">المزايا</a>
            <a href="#how" className="transition-colors hover:text-foreground">كيف يشتغل</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">الأسعار</a>
            <a href="#contact" className="transition-colors hover:text-foreground">تواصل</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">دخول</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">جرّب الديمو</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ============================= HERO ============================= */}
      <section className="relative overflow-hidden">
        {/* Warm restaurant lighting — amber glow + soft brand wash, no neon */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(55% 45% at 50% -5%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)," +
              "radial-gradient(40% 35% at 85% 8%, color-mix(in oklab, oklch(0.74 0.15 55) 14%, transparent), transparent 70%)," +
              "radial-gradient(35% 30% at 12% 18%, color-mix(in oklab, oklch(0.70 0.13 35) 10%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-16 md:pt-24 md:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              مصمّم لمطاعم العراق والشرق الأوسط — يرد بلهجتك
            </div>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
              موظف ذكاء اصطناعي
              <br />
              <span className="bg-gradient-to-l from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                يستلم طلبات مطعمك بدالك
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
              يستقبل رسائل زبائنك على تيليجرام وواتساب، يفهم الطلب، يؤكّد العنوان والتوصيل،
              ويرسل الطلب جاهزاً للوحة مطعمك — ويتعامل مع الشكاوى وينبّهك. كل هذا 24 ساعة، بلا توقف.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link to="/auth">
                  جرّب الديمو
                  <ArrowLeft className="mr-1 h-4 w-4" />
                </Link>
              </Button>
              <a
                href="#video"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-input bg-background/60 px-6 text-sm font-medium backdrop-blur transition-colors hover:bg-accent"
              >
                <Play className="h-4 w-4" />
                شاهد الفيديو
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              بدون بطاقة ائتمان · إعداد بأقل من 5 دقائق
            </p>
          </div>

          {/* Hero media — the money shot: customer message → AI reply → dashboard */}
          <div className="mx-auto mt-14 max-w-5xl">
            <MediaPlaceholder
              kind="video"
              icon={<Play className="h-6 w-6" />}
              label="فيديو البطل: رسالة الزبون ← رد الوكيل ← الطلب في اللوحة"
              hint="لقطة متحركة بثلاث مراحل متتابعة على شاشة واحدة: (1) رسالة زبون تصل بتيليجرام، (2) الوكيل يرد بلهجة عراقية ويبني السلة، (3) الطلب يظهر فوراً في لوحة تحكم المطعم."
              aspect="16 / 9"
            />
            {/* 3-stage annotation strip */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FlowTag icon={<MessageSquare className="h-4 w-4" />} n="١" text="الزبون يرسل رسالة" />
              <FlowTag icon={<Brain className="h-4 w-4" />} n="٢" text="الوكيل يفهم ويرد" />
              <FlowTag icon={<LayoutDashboard className="h-4 w-4" />} n="٣" text="الطلب يوصل للوحة" />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TRUST STRIP / STATS ===================== */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4">
          <Stat value="24/7" label="ردود فورية بلا توقف" />
          <Stat value="‹ ثانيتين" label="متوسط زمن الرد" />
          <Stat value="بلهجتك" label="عربي · كردي · تركماني" />
          <Stat value="قنوات متعددة" label="تيليجرام · واتساب · أكثر" />
        </div>
      </section>

      {/* ============================= PAIN ============================= */}
      <section className="mx-auto max-w-6xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="المشكلة"
          title="رسائل أكثر من ما تكدر ترد عليها"
          subtitle="كل دقيقة تأخير برد = زبون يروح لمطعم ثاني. والخطأ بالعنوان = طلب ضايع وخسارة."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PainCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="رسائل تتراكم"
            text="عشرات المحادثات بنفس الوقت على أكثر من تطبيق — ما تكدر تلحق عليها كلها."
          />
          <PainCard
            icon={<Clock className="h-5 w-5" />}
            title="ردود متأخرة"
            text="الزبون ينتظر دقائق… وإذا تأخرت يطلب من غيرك. وقت الذروة أصعب."
          />
          <PainCard
            icon={<Inbox className="h-5 w-5" />}
            title="طلبات تضيع"
            text="رسالة تنفقد بين المحادثات، أو تننسى، أو ما تنكتب صح بالمطبخ."
          />
          <PainCard
            icon={<MapPin className="h-5 w-5" />}
            title="عناوين غلط"
            text="عنوان ناقص أو مبهم = الدليفري يلف ويدور، والطلب يوصل بارد أو ما يوصل."
          />
          <PainCard
            icon={<AlertCircle className="h-5 w-5" />}
            title="أسئلة متكررة"
            text="نفس الأسئلة كل يوم: السعر؟ التوصيل؟ الدوام؟ — وقت يضيع بلا فايدة."
          />
          <PainCard
            icon={<Headset className="h-5 w-5" />}
            title="شكاوى بلا متابعة"
            text="شكوى زبون تضيع بالزحمة، فتخسر زبون كان ممكن ترجعه برسالة وحدة."
          />
        </div>
      </section>

      {/* =========================== SOLUTION =========================== */}
      <section id="how" className="relative border-t border-border/60 bg-muted/20 cv-auto">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(40% 50% at 50% 0%, color-mix(in oklab, oklch(0.74 0.15 55) 8%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionHeader
            eyebrow="الحل"
            title="الوكيل يشتغل بأربع خطوات"
            subtitle="من أول رسالة لحد ما يوصل الطلب للوحة مطعمك — تلقائياً وبلا تدخّل."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Step n="١" icon={<MessageSquare className="h-5 w-5" />} title="يستقبل الرسالة"
              text="يستلم رسالة الزبون من تيليجرام أو واتساب فوراً، بأي صيغة كتبها." />
            <Step n="٢" icon={<Brain className="h-5 w-5" />} title="يفهم الطلب"
              text="يفهم الأصناف والكميات حتى لو الزبون كتب بلهجته، ويبني السلة." />
            <Step n="٣" icon={<ClipboardCheck className="h-5 w-5" />} title="يؤكّد التفاصيل"
              text="يتأكد من العنوان، الهاتف، ونوع التوصيل، ويعرض الفاتورة قبل التأكيد." />
            <Step n="٤" icon={<LayoutDashboard className="h-5 w-5" />} title="يرسل للوحة"
              text="الطلب يوصل جاهزاً للوحة المطعم، وينبّهك صوتياً عشان ما يفوتك." />
          </div>
        </div>
      </section>

      {/* ======================= PRODUCT SHOWCASE ======================= */}
      <section className="mx-auto max-w-6xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="المنتج"
          title="كل شي قدامك بمكان واحد"
          subtitle="محادثات، طلبات، شكاوى، وتحليلات — بلوحة وحدة نظيفة وسهلة."
        />
        {/* Bento layout of labeled placeholders */}
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {/* Big: dashboard */}
          <div className="lg:col-span-2">
            <MediaPlaceholder
              kind="image"
              icon={<LayoutDashboard className="h-6 w-6" />}
              label="لقطة لوحة التحكم"
              hint="لوحة المطعم: قائمة الطلبات الحيّة بحالاتها، عدّاد الطلبات اليوم، والإيرادات — تصميم داكن نظيف."
              aspect="16 / 10"
            />
          </div>
          {/* Tall: chat */}
          <div>
            <MediaPlaceholder
              kind="image"
              icon={<MessageSquare className="h-6 w-6" />}
              label="محادثة تيليجرام/واتساب"
              hint="شاشة هاتف تعرض محادثة حقيقية: الزبون يطلب، والوكيل يرد ببطاقات أصناف وأسعار."
              aspect="3 / 4"
            />
          </div>
          {/* Three small cards */}
          <MediaPlaceholder
            kind="image"
            icon={<ShoppingBag className="h-6 w-6" />}
            label="بطاقة إدارة الطلب"
            hint="بطاقة طلب واحد: الأصناف، العنوان، زر الحالة التالية، وموقع الزبون على الخريطة."
            aspect="4 / 3"
          />
          <MediaPlaceholder
            kind="image"
            icon={<AlertCircle className="h-6 w-6" />}
            label="بطاقة الشكاوى"
            hint="بطاقة شكوى: نص الشكوى، حالتها، وزر رد سريع — عشان ترجع الزبون."
            aspect="4 / 3"
          />
          <MediaPlaceholder
            kind="image"
            icon={<LineChart className="h-6 w-6" />}
            label="بطاقة التحليلات"
            hint="رسم بياني صاعد للمبيعات اليومية + الأصناف الأكثر طلباً + القنوات الأنشط."
            aspect="4 / 3"
          />
        </div>
      </section>

      {/* ========================= FEATURE GRID ========================= */}
      <section id="features" className="border-t border-border/60 bg-muted/20 cv-auto">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionHeader
            eyebrow="المزايا"
            title="كل اللي يحتاجه مطعمك"
            subtitle="من استلام الطلب إلى تحليل المبيعات — بدون أي خبرة تقنية."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={<ShoppingBag className="h-5 w-5" />} title="استلام طلبات ذكي"
              text="يفهم الطلب ويبني السلة ويعرض الفاتورة قبل التأكيد." />
            <Feature icon={<MapPin className="h-5 w-5" />} title="نطاقات التوصيل"
              text="يتأكد إن عنوان الزبون داخل منطقة توصيل الفرع قبل القبول." />
            <Feature icon={<Brain className="h-5 w-5" />} title="ذاكرة الزبون"
              text="يتذكر طلبات الزبون وعنوانه، فيخدمه أسرع المرة الجاية." />
            <Feature icon={<Bell className="h-5 w-5" />} title="تنبيهات المالك"
              text="ينبّهك بأي طلب جديد أو مخزون قارب ينفد، فوراً." />
            <Feature icon={<Headset className="h-5 w-5" />} title="تحويل لموظف بشري"
              text="إذا احتاج تدخّل بشري، يحوّل المحادثة لك بضغطة." />
            <Feature icon={<AlertCircle className="h-5 w-5" />} title="إدارة الشكاوى"
              text="يلتقط الشكوى، يسجّلها، وينبّهك عشان تتصرف بسرعة." />
            <Feature icon={<Building2 className="h-5 w-5" />} title="فروع متعددة"
              text="يوجّه كل طلب للفرع الأقرب بنطاقه الجغرافي الخاص." />
            <Feature icon={<LineChart className="h-5 w-5" />} title="تحليلات وأرباح"
              text="مبيعات يومية، أصناف رائجة، وقنوات أنشط — بلمحة." />
          </div>
        </div>
      </section>

      {/* ========================= VIDEO DEMO ========================= */}
      <section id="video" className="mx-auto max-w-5xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="الديمو"
          title="شوف الوكيل وهو يشتغل"
          subtitle="فيديو قصير (٣٠ ثانية) يوريك رحلة طلب كاملة من أول رسالة لحد التوصيل."
        />
        <div className="mt-10">
          <MediaPlaceholder
            kind="video"
            icon={<Play className="h-7 w-7" />}
            label="فيديو توضيحي — ٣٠ ثانية"
            hint="سيناريو الفيديو: زبون يكتب «أكو توصيل؟» ← الوكيل يرحّب ويعرض المنيو ← الزبون يطلب صنفين ← الوكيل يحسب الفاتورة ويطلب الموقع ← الطلب يظهر باللوحة ويرن التنبيه ← الكابتن يستلم ← الزبون يتابع على الخريطة."
            aspect="16 / 9"
          />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> بدون موسيقى</span>
            <span className="inline-flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> تعليق صوتي عربي واضح</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> مؤثرات صوتية واقعية فقط</span>
          </div>
        </div>
      </section>

      {/* ===================== TRUST / LOCAL MARKET ===================== */}
      <section className="relative border-y border-border/60 bg-muted/30 cv-auto">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(45% 60% at 80% 50%, color-mix(in oklab, oklch(0.72 0.14 45) 8%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              صُنع لسوقك
            </div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              مبني لمطاعم العراق والشرق الأوسط
            </h2>
            <p className="mt-4 text-muted-foreground">
              مو أداة أجنبية مترجمة — الوكيل يفهم لهجتك، يتعامل مع طريقة شغل مطاعمنا الحقيقية،
              ويعرف العناوين والمناطق كما يكتبها الزبون فعلاً.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <TrustItem icon={<Languages className="h-4 w-4" />}
                text="يفهم العربية بلهجاتها (عراقي، خليجي، شامي) والكردي والتركماني." />
              <TrustItem icon={<MapPin className="h-4 w-4" />}
                text="نطاقات توصيل بالمحافظات والمناطق العراقية الحقيقية." />
              <TrustItem icon={<ShoppingBag className="h-4 w-4" />}
                text="يشتغل مع سير عمل المطاعم الفعلي: توصيل، استلام، فروع، كاش." />
              <TrustItem icon={<ShieldCheck className="h-4 w-4" />}
                text="بياناتك وبيانات زبائنك محمية ومشفّرة." />
            </ul>
          </div>
          <MediaPlaceholder
            kind="image"
            icon={<MapPin className="h-6 w-6" />}
            label="صورة: خريطة تغطية + محادثة بلهجة محلية"
            hint="تركيب بصري: خريطة عراقية مع نطاقات توصيل ملوّنة، وفوقها فقاعة محادثة بلهجة عراقية حقيقية."
            aspect="4 / 3"
          />
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 cv-auto">
        <SectionHeader
          eyebrow="الأسعار"
          title="باقة تكبر وية مطعمك"
          subtitle="بدون عقود. تكدر تبدّل أو تلغي بأي وقت."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <PricingCard
            name="المبتدئ"
            tagline="لمطعم يبدأ بقناة وحدة"
            price="حسب الاتفاق"
            features={[
              "فرع واحد",
              "قناة تيليجرام",
              "استخراج المنيو من الصور",
              "لوحة طلبات أساسية",
              "تنبيه طلب جديد",
            ]}
            cta="ابدأ الآن"
            highlighted={false}
          />
          <PricingCard
            name="الاحترافي"
            tagline="الأكثر طلباً للمطاعم النشطة"
            price="حسب الاتفاق"
            features={[
              "حتى ٣ فروع",
              "كل القنوات (تيليجرام · واتساب)",
              "نطاقات توصيل + ذاكرة زبون",
              "إدارة شكاوى + تحويل بشري",
              "تحليلات متقدمة",
            ]}
            cta="جرّب الاحترافي"
            highlighted
          />
          <PricingCard
            name="الأعمال"
            tagline="لسلاسل المطاعم متعددة الفروع"
            price="تواصل معنا"
            features={[
              "فروع غير محدودة",
              "أولوية دعم فني",
              "تقارير وتحليلات موسّعة",
              "وصول API للتكامل",
              "مدير حساب مخصّص",
            ]}
            cta="تواصل معنا"
            highlighted={false}
          />
        </div>
      </section>

      {/* =========================== FINAL CTA =========================== */}
      <section id="contact" className="relative overflow-hidden border-t border-border/60 cv-auto">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 70% at 50% 100%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)," +
              "radial-gradient(40% 50% at 80% 100%, color-mix(in oklab, oklch(0.74 0.15 55) 12%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-4xl px-4 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            خلّي طلبات مطعمك تشتغل
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-l from-foreground to-muted-foreground bg-clip-text text-transparent">
              {" "}حتى وأنت مشغول
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            جرّب الديمو اليوم، وشوف بنفسك كيف الوكيل يرد ويستلم الطلبات بدالك.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-7 text-base">
              <Link to="/auth">
                جرّب الديمو الآن
                <ArrowLeft className="mr-1 h-4 w-4" />
              </Link>
            </Button>
            <a
              href="mailto:cdasplay@gmail.com"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-input bg-background/60 px-6 text-sm font-medium backdrop-blur transition-colors hover:bg-accent"
            >
              <Send className="h-4 w-4" />
              تواصل معنا
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> بيانات مشفّرة</span>
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> نتائج بأول أسبوع</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> إعداد بأقل من 5 دقائق</span>
          </div>
        </div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} مطعمي AI — جميع الحقوق محفوظة</div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-foreground">المزايا</a>
            <a href="#pricing" className="hover:text-foreground">الأسعار</a>
            <Link to="/privacy" className="hover:text-foreground">الخصوصية</Link>
            <Link to="/terms" className="hover:text-foreground">الشروط</Link>
            <Link to="/auth" className="hover:text-foreground">دخول</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================ COMPONENTS ============================ */

// Labeled media frame. NO real asset — describes what goes here later.
function MediaPlaceholder({
  kind,
  icon,
  label,
  hint,
  aspect,
}: {
  kind: "video" | "image";
  icon: React.ReactNode;
  label: string;
  hint?: string;
  aspect: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/50 shadow-xl"
      style={{ aspectRatio: aspect }}
    >
      {/* subtle inner grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px)," +
            "linear-gradient(to bottom, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <span className="absolute right-3 top-3 z-10 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
        {kind === "video" ? "مكان فيديو — يُضاف لاحقاً" : "مكان صورة — تُضاف لاحقاً"}
      </span>
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground">
            {icon}
          </div>
          <div className="text-sm font-semibold md:text-base">{label}</div>
          {hint && <p className="mx-auto mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function FlowTag({ icon, n, text }: { icon: React.ReactNode; n: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
        {n}
      </span>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-medium">{text}</span>
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

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function PainCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-6">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
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

function Step({ n, icon, title, text }: { n: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-4 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
        {n}
      </div>
      <div className="mb-3 mt-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function TrustItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </span>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}

function PricingCard({
  name,
  tagline,
  price,
  features,
  cta,
  highlighted,
}: {
  name: string;
  tagline: string;
  price: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlighted ? "border-foreground bg-foreground text-background shadow-2xl" : "border-border bg-card"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 right-6 rounded-full bg-background px-3 py-0.5 text-xs font-medium text-foreground">
          الأكثر طلباً
        </div>
      )}
      <div className="text-lg font-bold">{name}</div>
      <div className={`mt-1 text-xs ${highlighted ? "opacity-80" : "text-muted-foreground"}`}>{tagline}</div>
      <div className="mt-5 text-2xl font-bold">{price}</div>
      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button asChild className="mt-6 w-full" variant={highlighted ? "secondary" : "default"}>
        <Link to="/auth">{cta}</Link>
      </Button>
    </div>
  );
}
