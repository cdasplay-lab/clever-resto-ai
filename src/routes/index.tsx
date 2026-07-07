import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LandingFX, AuroraCanvas, RevealWords, LiveChatDemo } from "@/components/landing-fx";
import { Button } from "@/components/ui/button";
import {
  Bot,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Bell,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  Inbox,
  MapPin,
  Brain,
  Headset,
  AlertCircle,
  Building2,
  LineChart,
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
      { name: "theme-color", content: "#0B0614" },
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

/* Fixed neon palette — the landing is intentionally dark regardless of theme */
const C = {
  bg: "#0B0614",
  bg2: "#120A20",
  card: "#1A0F2E",
  line: "rgba(240,235,255,.09)",
  pink: "#FF3D81",
  cyan: "#4DE1FF",
  violet: "#8B5CF6",
  cream: "#F2EEFF",
  muted: "#9D93B8",
};

function Landing() {
  // Landing is always shown, even for signed-in users. They can go to the
  // dashboard from the nav CTA.

  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{ background: C.bg, color: C.cream }}
    >
      <LandingFX />

      {/* ============================= NAV ============================= */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{ borderColor: C.line, background: "rgba(11,6,20,.72)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: `linear-gradient(135deg, ${C.pink}, ${C.violet})` }}
            >
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-base font-black tracking-tight">
              مطعمي{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, ${C.pink}, ${C.cyan})` }}
              >
                AI
              </span>
            </span>
          </div>
          <nav className="hidden items-center gap-7 text-sm md:flex" style={{ color: C.muted }}>
            <a href="#features" className="transition-colors hover:text-white">المزايا</a>
            <a href="#how" className="transition-colors hover:text-white">كيف يشتغل</a>
            <a href="#pricing" className="transition-colors hover:text-white">الأسعار</a>
            <a href="#contact" className="transition-colors hover:text-white">تواصل</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="hidden rounded-full px-4 py-2 text-sm transition-colors hover:text-white sm:inline-flex"
              style={{ color: C.muted }}
            >
              دخول
            </Link>
            <Link
              to="/auth"
              className="rounded-full border px-5 py-2 text-sm font-bold backdrop-blur transition-colors"
              style={{
                borderColor: "rgba(255,61,129,.45)",
                background: "rgba(255,61,129,.12)",
                color: C.cream,
              }}
            >
              جرّب الديمو
            </Link>
          </div>
        </div>
      </header>

      {/* ============================= HERO ============================= */}
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <AuroraCanvas />
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: "radial-gradient(1100px 550px at 50% 0%, transparent, rgba(11,6,20,.6) 75%)" }}
        />
        <div className="relative z-[2] mx-auto max-w-4xl pt-20 pb-16">
          <div
            className="mb-7 inline-flex items-center gap-2 text-xs tracking-[.25em]"
            style={{ color: C.cyan }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            وكيل ذكاء اصطناعي عراقي — يرد بلهجتك
          </div>
          <h1 className="text-[clamp(42px,8.5vw,104px)] font-black leading-[1.15] tracking-tight">
            <RevealWords text="مطعمك صار" />
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${C.pink}, ${C.violet} 50%, ${C.cyan})` }}
            >
              <RevealWords text="يفكّر بروحه" delay={0.3} />
            </span>
          </h1>
          <p
            className="mx-auto mt-7 max-w-xl text-base font-light leading-loose md:text-lg"
            style={{ color: C.muted }}
          >
            يستقبل رسائل زبائنك على تيليجرام وواتساب، يفهم الطلب، يؤكّد العنوان والتوصيل،
            ويرسل الطلب جاهزاً للوحة مطعمك — 24 ساعة، بلا توقف.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/auth"
              data-magnetic
              className="inline-flex h-13 items-center gap-2 rounded-full px-9 py-4 text-base font-bold text-white shadow-[0_10px_40px_rgba(255,61,129,.35)] transition-shadow hover:shadow-[0_14px_55px_rgba(255,61,129,.5)]"
              style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.violet})` }}
            >
              جرّب الديمو
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              data-magnetic
              className="inline-flex items-center gap-2 rounded-full border px-8 py-4 text-sm font-medium backdrop-blur transition-colors"
              style={{ borderColor: C.line, background: "rgba(11,6,20,.4)", color: C.cream }}
            >
              شلون يشتغل؟
            </a>
          </div>
          <p className="mt-5 text-xs" style={{ color: C.muted }}>
            بدون بطاقة ائتمان · إعداد بأقل من 5 دقائق
          </p>
        </div>
      </section>

      {/* ======================= KINETIC STRIPS ======================= */}
      <div
        className="relative z-[2] overflow-hidden border-y py-6"
        style={{ borderColor: C.line, background: "rgba(18,10,32,.6)" }}
        aria-hidden
      >
        <div className="fx-marquee flex w-max gap-14 whitespace-nowrap font-black" style={{ fontSize: "clamp(20px,2.6vw,30px)" }}>
          {[...Array(2)].map((_, k) => (
            <span key={k} className="flex items-center gap-14">
              {["برياني", "مسگوف", "دولمة", "كباب", "تشريب", "گص", "بتيتة چاب", "معدنوس"].map((w) => (
                <span key={w} className="flex items-center gap-14" style={{ color: C.muted }}>
                  {w} <span style={{ color: C.pink, fontSize: ".6em" }}>✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ============================= PAIN ============================= */}
      <section className="relative z-[2] mx-auto max-w-6xl px-4 py-24">
        <SectionHeader
          eyebrow="المشكلة"
          title="رسائل أكثر من ما تكدر ترد عليها"
          subtitle="كل دقيقة تأخير برد = زبون يروح لمطعم ثاني. والخطأ بالعنوان = طلب ضايع وخسارة."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NeonCard icon={<MessageSquare className="h-5 w-5" />} title="رسائل تتراكم" text="عشرات المحادثات بنفس الوقت على أكثر من تطبيق — ما تكدر تلحق عليها كلها." danger />
          <NeonCard icon={<Clock className="h-5 w-5" />} title="ردود متأخرة" text="الزبون ينتظر دقائق… وإذا تأخرت يطلب من غيرك. وقت الذروة أصعب." danger />
          <NeonCard icon={<Inbox className="h-5 w-5" />} title="طلبات تضيع" text="رسالة تنفقد بين المحادثات، أو تننسى، أو ما تنكتب صح بالمطبخ." danger />
          <NeonCard icon={<MapPin className="h-5 w-5" />} title="عناوين غلط" text="عنوان ناقص أو مبهم = الدليفري يلف ويدور، والطلب يوصل بارد أو ما يوصل." danger />
          <NeonCard icon={<AlertCircle className="h-5 w-5" />} title="أسئلة متكررة" text="نفس الأسئلة كل يوم: السعر؟ التوصيل؟ الدوام؟ — وقت يضيع بلا فايدة." danger />
          <NeonCard icon={<Headset className="h-5 w-5" />} title="شكاوى بلا متابعة" text="شكوى زبون تضيع بالزحمة، فتخسر زبون كان ممكن ترجعه برسالة وحدة." danger />
        </div>
      </section>

      {/* =========================== HOW =========================== */}
      <section
        id="how"
        className="relative z-[2] border-y"
        style={{ borderColor: C.line, background: "rgba(18,10,32,.7)" }}
      >
        <div className="mx-auto max-w-6xl px-4 py-24">
          <SectionHeader
            eyebrow="الحل"
            title="الوكيل يشتغل بأربع خطوات"
            subtitle="من أول رسالة لحد ما يوصل الطلب للوحة مطعمك — تلقائياً وبلا تدخّل."
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard n="٠١" icon={<MessageSquare className="h-5 w-5" />} title="يستقبل الرسالة" text="يستلم رسالة الزبون من تيليجرام أو واتساب فوراً، بأي صيغة كتبها." />
            <StepCard n="٠٢" icon={<Brain className="h-5 w-5" />} title="يفهم الطلب" text="يفهم الأصناف والكميات حتى لو الزبون كتب بلهجته، ويبني السلة." />
            <StepCard n="٠٣" icon={<ClipboardCheck className="h-5 w-5" />} title="يؤكّد التفاصيل" text="يتأكد من العنوان، الهاتف، ونوع التوصيل، ويعرض الفاتورة قبل التأكيد." />
            <StepCard n="٠٤" icon={<LayoutDashboard className="h-5 w-5" />} title="يرسل للوحة" text="الطلب يوصل جاهزاً للوحة المطعم، وينبّهك صوتياً عشان ما يفوتك." />
          </div>
        </div>
      </section>

      {/* ===================== LIVE DEMO ===================== */}
      <section className="relative z-[2] mx-auto max-w-6xl px-4 py-24">
        <SectionHeader
          eyebrow="شوفه بعينك"
          title="هذا هو، يشتغل قدامك"
          subtitle="محادثة حقيقية بين زبون والوكيل — من السؤال للتأكيد خلال ثوانٍ."
        />
        <div className="mx-auto mt-12 grid max-w-4xl items-center gap-10 lg:grid-cols-2">
          <div className="mx-auto w-full max-w-[360px]">
            <LiveChatDemo />
          </div>
          <div className="space-y-6">
            <DemoPoint color={C.pink} title="يفهم العراقي عدل" text="«اريد اثنين برياني بس بلا بصل» — بحث ذكي يفهم الغلطات الإملائية والأسماء المحلية للأكلات." />
            <DemoPoint color={C.violet} title="يبيع أكثر منك" text="اقتراحات مدروسة بلحظتها حسب محتوى السلة — ترفع متوسط قيمة الطلب بدون إزعاج." />
            <DemoPoint color={C.cyan} title="ذاكرة زبون" text="يتذكر عنوان الزبون وطلباته السابقة، فيخدمه أسرع كل مرة يرجع بيها." />
          </div>
        </div>
      </section>

      {/* ========================= FEATURES ========================= */}
      <section
        id="features"
        className="relative z-[2] border-y"
        style={{ borderColor: C.line, background: "rgba(18,10,32,.7)" }}
      >
        <div className="mx-auto max-w-6xl px-4 py-24">
          <SectionHeader
            eyebrow="المزايا"
            title="كل اللي يحتاجه مطعمك"
            subtitle="من استلام الطلب إلى تحليل المبيعات — بدون أي خبرة تقنية."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NeonCard icon={<ShoppingBag className="h-5 w-5" />} title="استلام طلبات ذكي" text="يفهم الطلب ويبني السلة ويعرض الفاتورة قبل التأكيد." />
            <NeonCard icon={<MapPin className="h-5 w-5" />} title="نطاقات التوصيل" text="يتأكد إن عنوان الزبون داخل منطقة توصيل الفرع قبل القبول." />
            <NeonCard icon={<Brain className="h-5 w-5" />} title="ذاكرة الزبون" text="يتذكر طلبات الزبون وعنوانه، فيخدمه أسرع المرة الجاية." />
            <NeonCard icon={<Bell className="h-5 w-5" />} title="تنبيهات المالك" text="ينبّهك بأي طلب جديد أو مخزون قارب ينفد، فوراً." />
            <NeonCard icon={<Headset className="h-5 w-5" />} title="تحويل لموظف بشري" text="إذا احتاج تدخّل بشري، يحوّل المحادثة لك بضغطة." />
            <NeonCard icon={<AlertCircle className="h-5 w-5" />} title="إدارة الشكاوى" text="يلتقط الشكوى، يسجّلها، وينبّهك عشان تتصرف بسرعة." />
            <NeonCard icon={<Building2 className="h-5 w-5" />} title="فروع متعددة" text="يوجّه كل طلب للفرع الأقرب بنطاقه الجغرافي الخاص." />
            <NeonCard icon={<LineChart className="h-5 w-5" />} title="تحليلات وأرباح" text="مبيعات يومية، أصناف رائجة، وقنوات أنشط — بلمحة." />
          </div>
        </div>
      </section>

      {/* ============================ PRICING ============================ */}
      <section id="pricing" className="relative z-[2] mx-auto max-w-6xl px-4 py-24">
        <SectionHeader
          eyebrow="الأسعار"
          title="باقة تكبر وية مطعمك"
          subtitle="بدون عقود. تكدر تبدّل أو تلغي بأي وقت."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <PricingCard
            name="المبتدئ"
            tagline="لمطعم يبدأ بقناة وحدة"
            price="حسب الاتفاق"
            features={["فرع واحد", "قناة تيليجرام", "استخراج المنيو من الصور", "لوحة طلبات أساسية", "تنبيه طلب جديد"]}
            cta="ابدأ الآن"
          />
          <PricingCard
            name="الاحترافي"
            tagline="الأكثر طلباً للمطاعم النشطة"
            price="حسب الاتفاق"
            features={["حتى ٣ فروع", "كل القنوات (تيليجرام · واتساب)", "نطاقات توصيل + ذاكرة زبون", "إدارة شكاوى + تحويل بشري", "تحليلات متقدمة"]}
            cta="جرّب الاحترافي"
            highlighted
          />
          <PricingCard
            name="الأعمال"
            tagline="لسلاسل المطاعم متعددة الفروع"
            price="تواصل معنا"
            features={["فروع غير محدودة", "أولوية دعم فني", "تقارير وتحليلات موسّعة", "وصول API للتكامل", "مدير حساب مخصّص"]}
            cta="تواصل معنا"
          />
        </div>
      </section>

      {/* =========================== FINAL CTA =========================== */}
      <section id="contact" className="relative z-[2] overflow-hidden border-t px-4 py-32 text-center" style={{ borderColor: C.line }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(600px 320px at 50% 100%, rgba(255,61,129,.14), transparent 70%)` }}
        />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-[clamp(32px,5.5vw,72px)] font-black leading-[1.3] tracking-tight">
            مستقبل مطعمك
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${C.pink}, ${C.violet}, ${C.cyan})` }}
            >
              يبدأ برسالة وحدة
            </span>
          </h2>
          <p className="mt-5 font-light" style={{ color: C.muted }}>
            جرّب الديمو اليوم، وشوف بنفسك كيف الوكيل يرد ويستلم الطلبات بدالك.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/auth"
              data-magnetic
              className="inline-flex items-center gap-2 rounded-full px-9 py-4 text-base font-bold text-white shadow-[0_10px_40px_rgba(255,61,129,.35)]"
              style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.violet})` }}
            >
              جرّب الديمو الآن
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <a
              href="mailto:cdasplay@gmail.com"
              data-magnetic
              className="inline-flex items-center gap-2 rounded-full border px-8 py-4 text-sm font-medium backdrop-blur"
              style={{ borderColor: C.line, background: "rgba(11,6,20,.4)", color: C.cream }}
            >
              <Send className="h-4 w-4" />
              تواصل معنا
            </a>
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" style={{ color: C.muted }}>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> بيانات مشفّرة</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> نتائج بأول أسبوع</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> إعداد بأقل من 5 دقائق</span>
          </div>
        </div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="relative z-[2] border-t" style={{ borderColor: C.line }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs md:flex-row" style={{ color: C.muted }}>
          <div>© {new Date().getFullYear()} مطعمي AI — صُنع بحُب في العراق 🇮🇶</div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-white">المزايا</a>
            <a href="#pricing" className="hover:text-white">الأسعار</a>
            <Link to="/privacy" className="hover:text-white">الخصوصية</Link>
            <Link to="/terms" className="hover:text-white">الشروط</Link>
            <Link to="/auth" className="hover:text-white">دخول</Link>
          </div>
        </div>
      </footer>

      {/* marquee keyframes (scoped) */}
      <style>{`
        .fx-marquee{animation:fx-mq 30s linear infinite}
        @keyframes fx-mq{to{transform:translateX(50%)}}
        @media (prefers-reduced-motion:reduce){.fx-marquee{animation:none}}
      `}</style>
    </div>
  );
}

/* ============================ COMPONENTS ============================ */

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-medium tracking-[.3em]" style={{ color: C.cyan }}>{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{title}</h2>
      <p className="mt-4 font-light leading-loose" style={{ color: C.muted }}>{subtitle}</p>
    </div>
  );
}

function NeonCard({ icon, title, text, danger }: { icon: React.ReactNode; title: string; text: string; danger?: boolean }) {
  return (
    <div
      className="group rounded-2xl border p-6 transition-colors duration-300 hover:border-[#FF3D81]/50"
      style={{ borderColor: C.line, background: C.card }}
    >
      <div
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
        style={
          danger
            ? { background: "rgba(255,61,129,.12)", color: C.pink }
            : { background: "rgba(77,225,255,.1)", color: C.cyan }
        }
      >
        {icon}
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: C.muted }}>{text}</p>
    </div>
  );
}

function StepCard({ n, icon, title, text }: { n: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="relative rounded-2xl border p-6 pt-8" style={{ borderColor: C.line, background: C.card }}>
      <div
        className="pointer-events-none absolute -top-5 left-4 text-5xl font-black"
        style={{ WebkitTextStroke: `1.5px rgba(255,61,129,.5)`, color: "transparent" }}
      >
        {n}
      </div>
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(139,92,246,.14)", color: C.violet }}>
        {icon}
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: C.muted }}>{text}</p>
    </div>
  );
}

function DemoPoint({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="mt-1 h-full w-1 shrink-0 rounded-full" style={{ background: color, minHeight: 44 }} />
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-sm font-light leading-relaxed" style={{ color: C.muted }}>{text}</p>
      </div>
    </div>
  );
}

function PricingCard({
  name, tagline, price, features, cta, highlighted,
}: {
  name: string; tagline: string; price: string; features: string[]; cta: string; highlighted?: boolean;
}) {
  return (
    <div
      className="relative flex flex-col rounded-2xl border p-7"
      style={
        highlighted
          ? { borderColor: "rgba(255,61,129,.6)", background: "linear-gradient(170deg, rgba(255,61,129,.12), rgba(139,92,246,.08)), #1A0F2E", boxShadow: "0 24px 80px rgba(255,61,129,.15)" }
          : { borderColor: C.line, background: C.card }
      }
    >
      {highlighted && (
        <div
          className="absolute -top-3 right-6 rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.violet})` }}
        >
          الأكثر طلباً
        </div>
      )}
      <div className="text-lg font-black">{name}</div>
      <div className="mt-1 text-xs" style={{ color: C.muted }}>{tagline}</div>
      <div className="mt-5 text-2xl font-black">{price}</div>
      <ul className="mt-6 flex-1 space-y-3 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: highlighted ? C.pink : C.cyan }} />
            <span style={{ color: C.cream }}>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        asChild
        className="mt-7 w-full rounded-full border-0 font-bold text-white"
        style={
          highlighted
            ? { background: `linear-gradient(90deg, ${C.pink}, ${C.violet})` }
            : { background: "rgba(240,235,255,.08)", color: C.cream }
        }
      >
        <Link to="/auth">{cta}</Link>
      </Button>
    </div>
  );
}
