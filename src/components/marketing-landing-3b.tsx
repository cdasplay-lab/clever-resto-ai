import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  BellRing,
  Bot,
  Check,
  CheckCircle2,
  ChefHat,
  CircleDollarSign,
  Clock3,
  Headphones,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageCircle,
  PackageCheck,
  Play,
  Printer,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { MadaLogo, MadaMark } from "@/components/mada-logo";

const palette = {
  paper: "#f7f2e7",
  paperLight: "#fffdf8",
  ink: "#173f31",
  green: "#1f6044",
  greenDark: "#123e2d",
  gold: "#b8872d",
  goldSoft: "#e8d6ad",
  line: "rgba(174, 132, 56, .27)",
  muted: "#66746d",
};

const channels = [
  { name: "واتساب", mark: "W", color: "#25a75b", copy: "طلبات وردود تلقائية على مدار الساعة" },
  { name: "إنستغرام", mark: "◎", color: "#bc3b79", copy: "حوّل رسائل الصفحة إلى طلبات منظمة" },
  { name: "فيسبوك", mark: "f", color: "#3668ad", copy: "استقبل الزبائن من Messenger مباشرة" },
  { name: "تيليجرام", mark: "➤", color: "#2a9dcc", copy: "قناة جاهزة للتجربة والطلبات الفورية" },
];

const features: Array<{
  icon: LucideIcon;
  title: string;
  copy: string;
}> = [
  {
    icon: Bot,
    title: "وكيل يفهم اللهجة",
    copy: "يفهم الطلب حتى لو انكتب بعفوية أو بأخطاء، ويسأل فقط عن التفاصيل الناقصة.",
  },
  {
    icon: ShoppingBag,
    title: "طلب كامل بلا تخمين",
    copy: "يبني السلة، يراجع الخيارات والكميات، ولا يرسل الطلب قبل التأكيد الصريح.",
  },
  {
    icon: MapPin,
    title: "فروع ومناطق توصيل",
    copy: "يتحقق من عنوان الزبون ويوجّه الطلب للفرع الصحيح حسب التغطية.",
  },
  {
    icon: Headphones,
    title: "تحويل ذكي للموظف",
    copy: "عند الشكوى أو الحالة الحساسة يسلّم المحادثة مع ملخص واضح للموظف.",
  },
  {
    icon: BellRing,
    title: "تنبيه لحظي للمطبخ",
    copy: "يوصل الطلب مؤكداً مع رقم واضح ووقت التحضير، بلا رسائل ضائعة.",
  },
  {
    icon: BarChart3,
    title: "مراقبة ونتائج",
    copy: "تعرف القناة الأقوى، سرعة التأكيد، الطلبات المتكررة وأداء كل فرع.",
  },
];

const plans = [
  {
    name: "البداية",
    description: "لمطعم واحد يريد تشغيل أول قناة",
    price: "حسب الاتفاق",
    items: ["فرع واحد", "قناة تيليجرام", "لوحة الطلبات", "تنبيه طلب جديد"],
  },
  {
    name: "الاحترافي",
    description: "للمطاعم النشطة ومتعددة القنوات",
    price: "الأكثر طلباً",
    items: ["حتى 3 فروع", "كل القنوات", "ذاكرة الزبون", "تحليلات وتحويل بشري"],
    featured: true,
  },
  {
    name: "الأعمال",
    description: "للسلاسل والعمليات الأكبر",
    price: "تواصل معنا",
    items: ["فروع غير محدودة", "تقارير موسعة", "تكاملات خاصة", "دعم بأولوية"],
  },
];

function useLandingReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-ml3b-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => (node.dataset.visible = "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

export function MarketingLanding3B() {
  const [menuOpen, setMenuOpen] = useState(false);
  useLandingReveal();

  return (
    <div
      dir="rtl"
      className="ml3b min-h-screen overflow-x-hidden"
      style={{ background: palette.paper, color: palette.ink }}
    >
      <LandingStyles />

      <header className="sticky top-0 z-50 border-b border-[#d9c69f]/45 bg-[#fbf7ee]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-[74px] max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to="/" aria-label="Mada — الصفحة الرئيسية" className="shrink-0">
            <MadaLogo compact />
          </Link>

          <nav
            className="hidden items-center gap-9 text-sm font-medium lg:flex"
            aria-label="التنقل الرئيسي"
          >
            <a className="ml3b-nav" href="#agent">
              الوكيل
            </a>
            <a className="ml3b-nav" href="#channels">
              القنوات
            </a>
            <a className="ml3b-nav" href="#platform">
              المنصة
            </a>
            <a className="ml3b-nav" href="#pricing">
              الأسعار
            </a>
            <a className="ml3b-nav" href="#contact">
              تواصل معنا
            </a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <Link
              to="/auth"
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#315747] transition hover:bg-white/70"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/auth"
              className="ml3b-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              جرّب المنصة
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-[#d7c49d] bg-white/60 lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#d9c69f]/45 bg-[#fbf7ee] px-5 py-5 lg:hidden">
            <nav className="mx-auto grid max-w-[1480px] gap-2 text-sm font-bold">
              {[
                ["#agent", "الوكيل"],
                ["#channels", "القنوات"],
                ["#platform", "المنصة"],
                ["#pricing", "الأسعار"],
                ["#contact", "تواصل معنا"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-xl px-4 py-3 hover:bg-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </a>
              ))}
              <Link
                to="/auth"
                className="ml3b-primary mt-2 rounded-xl px-5 py-3 text-center text-white"
              >
                جرّب المنصة
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main>
        <section id="agent" className="relative px-4 pb-7 pt-7 sm:px-7 lg:px-10 lg:pt-10">
          <div className="ml3b-grain pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-[1480px] items-center gap-9 xl:grid-cols-[.78fr_1.55fr] xl:gap-11">
            <div className="order-1 px-1 text-center xl:text-right" data-ml3b-reveal>
              <div className="mb-6 inline-flex items-center gap-2 rounded-xl border border-[#d9bd82] bg-[#f4ead2] px-4 py-2 text-xs font-bold text-[#765c2e]">
                <Sparkles className="h-3.5 w-3.5 text-[#b8872d]" />
                شاهد الوكيل يعمل الآن
              </div>
              <h1 className="text-[clamp(2.8rem,5.6vw,6.2rem)] font-extrabold leading-[1.18] tracking-[-.055em] text-[#194d39]">
                من أول رسالة...
                <br />
                إلى طلب جاهز <span className="text-[#b8872d]">للمطبخ.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-[610px] text-lg leading-9 text-[#586960] xl:mx-0 xl:text-xl">
                يفهم، يقترح، يؤكد ويتابع — وأنت تراقب كل شيء لحظة بلحظة من لوحة واحدة.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3 xl:justify-start">
                <Link
                  to="/auth"
                  className="ml3b-primary inline-flex min-w-[188px] items-center justify-center gap-3 rounded-xl px-7 py-4 text-base font-bold text-white"
                >
                  شغّل التجربة
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <a
                  href="#platform"
                  className="inline-flex min-w-[188px] items-center justify-center gap-3 rounded-xl border border-[#306a52] bg-white/55 px-7 py-4 text-base font-bold text-[#22543f] transition hover:bg-white"
                >
                  <Play className="h-4 w-4" />
                  استكشف المنصة
                </a>
              </div>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[#68766f] xl:justify-start">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#2f7d59]" />
                  بدون بطاقة ائتمان
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-[#2f7d59]" />
                  إعداد سريع
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#2f7d59]" />
                  بيانات معزولة لكل مطعم
                </span>
              </div>
            </div>

            <div className="order-2" data-ml3b-reveal style={{ transitionDelay: "120ms" }}>
              <JourneyBoard />
            </div>
          </div>

          <div className="relative mx-auto mt-8 max-w-[1320px]" data-ml3b-reveal>
            <ResultsRibbon />
          </div>
        </section>

        <section id="platform" className="px-4 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-[1320px] items-center gap-11 rounded-[2rem] border border-[#d5bd8e]/65 bg-[#fffdf8]/75 p-5 shadow-[0_30px_90px_-60px_rgba(37,72,53,.42)] sm:p-8 lg:grid-cols-[.9fr_1.25fr] lg:p-10">
            <div data-ml3b-reveal>
              <SectionTag icon={LayoutDashboard}>المنصة</SectionTag>
              <h2 className="mt-5 text-[clamp(2rem,4.2vw,4.25rem)] font-extrabold leading-[1.2] tracking-[-.04em]">
                رؤية شاملة لأداء مطعمك
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#65736c]">
                من أول طلب لآخر طبق — كل البيانات في لوحة واحدة حتى تتخذ قرارات أسرع وأذكى.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <FeatureTick icon={PackageCheck} text="طلبات مؤكدة ومنظمة" />
                <FeatureTick icon={Users} text="ذاكرة لكل زبون" />
                <FeatureTick icon={Store} text="إدارة فروع متعددة" />
                <FeatureTick icon={BarChart3} text="تقارير أداء مباشرة" />
              </div>
              <Link
                to="/auth"
                className="mt-8 inline-flex items-center gap-2 font-bold text-[#1f6044] hover:underline"
              >
                افتح لوحة التجربة <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <div data-ml3b-reveal style={{ transitionDelay: "120ms" }}>
              <DashboardPreview />
            </div>
          </div>
        </section>

        <section
          id="channels"
          className="border-y border-[#dbc69c]/50 bg-[#f0e8d8]/60 px-4 py-16 sm:px-7 lg:px-10 lg:py-24"
        >
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto max-w-3xl text-center" data-ml3b-reveal>
              <SectionTag icon={MessageCircle}>القنوات</SectionTag>
              <h2 className="mt-5 text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold leading-[1.2] tracking-[-.045em]">
                كل رسائل زبائنك، موظف واحد ذكي
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#65736c]">
                نفس جودة الخدمة ونفس قواعد المطعم، مهما كانت القناة التي كتب منها الزبون.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {channels.map((channel, index) => (
                <article
                  key={channel.name}
                  className="group rounded-[1.6rem] border border-[#d8c59d] bg-[#fffdf8] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_-35px_rgba(33,77,55,.5)]"
                  data-ml3b-reveal
                  style={{ transitionDelay: `${index * 60}ms` }}
                >
                  <div
                    className="grid h-12 w-12 place-items-center rounded-2xl text-xl font-extrabold text-white shadow-lg"
                    style={{ background: channel.color }}
                    aria-hidden
                  >
                    {channel.mark}
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold">{channel.name}</h3>
                  <p className="mt-2 leading-7 text-[#68766f]">{channel.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto max-w-3xl text-center" data-ml3b-reveal>
              <SectionTag icon={Sparkles}>المزايا</SectionTag>
              <h2 className="mt-5 text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold leading-[1.2] tracking-[-.045em]">
                مو مجرد ردود — هذا موظف متكامل
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#65736c]">
                قلبه وكيل طلبات، وحوله الأمان والمراقبة والأدوات التي يحتاجها مطعم حقيقي.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <article
                  key={feature.title}
                  className="ml3b-feature rounded-[1.6rem] border border-[#dac69e] bg-[#fffdf8] p-7"
                  data-ml3b-reveal
                  style={{ transitionDelay: `${(index % 3) * 70}ms` }}
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e7efe8] text-[#1f6044]">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold">{feature.title}</h3>
                  <p className="mt-3 leading-7 text-[#68766f]">{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#164b36] px-4 py-16 text-white sm:px-7 lg:px-10 lg:py-24">
          <div className="ml3b-dark-orb pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-[1320px]">
            <div className="mx-auto max-w-3xl text-center" data-ml3b-reveal>
              <SectionTag icon={ChefHat} dark>
                كيف يشتغل
              </SectionTag>
              <h2 className="mt-5 text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold leading-[1.2] tracking-[-.045em]">
                ثلاث مراحل واضحة، وطلب بلا أخطاء
              </h2>
            </div>
            <div className="relative mt-12 grid gap-5 lg:grid-cols-3">
              <div
                className="absolute left-[16%] right-[16%] top-12 hidden h-px bg-[#d1ad68]/50 lg:block"
                aria-hidden
              />
              {[
                {
                  n: "01",
                  icon: MessageCircle,
                  title: "يستقبل ويفهم",
                  copy: "يقرأ رسالة الزبون ويحدد الأصناف والكميات والخيارات الناقصة.",
                },
                {
                  n: "02",
                  icon: CheckCircle2,
                  title: "يراجع ويؤكد",
                  copy: "يعرض ملخصاً واضحاً ولا ينشئ الطلب إلا بعد موافقة الزبون.",
                },
                {
                  n: "03",
                  icon: ChefHat,
                  title: "يسلّم للمطبخ",
                  copy: "يوصل الطلب للفرع الصحيح مع رقم الطلب ووقت التحضير.",
                },
              ].map((step, index) => (
                <article
                  key={step.n}
                  className="relative rounded-[1.6rem] border border-white/15 bg-white/7 p-7 backdrop-blur"
                  data-ml3b-reveal
                  style={{ transitionDelay: `${index * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="relative z-10 grid h-14 w-14 place-items-center rounded-full bg-[#d3ae67] text-[#173f31] shadow-[0_0_0_8px_rgba(211,174,103,.12)]">
                      <step.icon className="h-6 w-6" />
                    </div>
                    <span className="text-4xl font-extrabold text-white/12">{step.n}</span>
                  </div>
                  <h3 className="mt-7 text-2xl font-extrabold">{step.title}</h3>
                  <p className="mt-3 leading-8 text-white/68">{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-3xl text-center" data-ml3b-reveal>
              <SectionTag icon={CircleDollarSign}>الباقات</SectionTag>
              <h2 className="mt-5 text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold leading-[1.2] tracking-[-.045em]">
                باقة تكبر ويه مطعمك
              </h2>
              <p className="mt-5 text-lg text-[#65736c]">
                السعر النهائي يعتمد على الفروع والقنوات وحجم الطلبات.
              </p>
            </div>
            <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
              {plans.map((plan, index) => (
                <article
                  key={plan.name}
                  className={`relative rounded-[1.7rem] border p-7 ${
                    plan.featured
                      ? "border-[#1f6044] bg-[#174b37] text-white shadow-[0_30px_70px_-40px_rgba(22,75,54,.78)] lg:-translate-y-3"
                      : "border-[#d9c59d] bg-[#fffdf8]"
                  }`}
                  data-ml3b-reveal
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  {plan.featured && (
                    <span className="absolute left-6 top-6 rounded-full bg-[#d3ae67] px-3 py-1 text-xs font-extrabold text-[#173f31]">
                      موصى به
                    </span>
                  )}
                  <h3 className="text-2xl font-extrabold">{plan.name}</h3>
                  <p
                    className={`mt-2 min-h-12 leading-7 ${plan.featured ? "text-white/68" : "text-[#6b776f]"}`}
                  >
                    {plan.description}
                  </p>
                  <div
                    className={`my-6 border-t ${plan.featured ? "border-white/15" : "border-[#e5d8bd]"}`}
                  />
                  <div className="text-2xl font-extrabold">{plan.price}</div>
                  <ul className="mt-7 space-y-4">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm font-medium">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full ${plan.featured ? "bg-white/12" : "bg-[#e5eee7] text-[#1f6044]"}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/auth"
                    className={`mt-8 flex items-center justify-center rounded-xl px-5 py-3.5 text-sm font-extrabold transition ${
                      plan.featured
                        ? "bg-[#d3ae67] text-[#173f31] hover:bg-[#e1c17f]"
                        : "border border-[#2d684f] text-[#22543f] hover:bg-[#edf2ed]"
                    }`}
                  >
                    ابدأ الآن
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="px-4 pb-8 sm:px-7 lg:px-10">
          <div
            className="relative mx-auto max-w-[1320px] overflow-hidden rounded-[2rem] bg-[#174b37] px-6 py-14 text-center text-white sm:px-12 lg:py-20"
            data-ml3b-reveal
          >
            <div className="ml3b-cta-pattern pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative mx-auto max-w-3xl">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#d3ae67] text-[#173f31] shadow-xl">
                <ChefHat className="h-7 w-7" />
              </div>
              <h2 className="mt-6 text-[clamp(2.1rem,4.8vw,4.7rem)] font-extrabold leading-[1.2] tracking-[-.045em]">
                خلّ أول طلب ذكي يبدأ اليوم
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/72">
                جرّب الوكيل وشوف كيف يحول الرسالة إلى طلب مؤكد، قبل أي التزام.
              </p>
              <Link
                to="/auth"
                className="mt-8 inline-flex items-center gap-3 rounded-xl bg-[#d3ae67] px-8 py-4 font-extrabold text-[#173f31] transition hover:-translate-y-0.5 hover:bg-[#e3c583]"
              >
                شغّل التجربة
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-9 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-5 border-t border-[#dac8a5] pt-8 text-sm text-[#6a766f] md:flex-row">
          <MadaLogo compact />
          <div>© {new Date().getFullYear()} Mada — منصة المطاعم الذكية</div>
          <nav
            className="flex flex-wrap items-center justify-center gap-5"
            aria-label="روابط قانونية"
          >
            <Link to="/privacy" className="hover:text-[#1f6044]">
              الخصوصية
            </Link>
            <Link to="/terms" className="hover:text-[#1f6044]">
              الشروط
            </Link>
            <Link to="/auth" className="hover:text-[#1f6044]">
              تسجيل الدخول
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function JourneyBoard() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % 3), 2600);
    return () => window.clearInterval(timer);
  }, []);

  const cards = [
    <CustomerMessageCard key="message" />,
    <UnderstoodOrderCard key="understood" />,
    <ConfirmedOrderCard key="confirmed" />,
  ];

  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] border border-[#d9c49b] bg-[#173f31] shadow-[0_36px_90px_-50px_rgba(19,59,43,.7)] sm:min-h-[620px] lg:min-h-[690px]">
      <img
        src="/landing/kitchen-hero.webp"
        alt="فريق مطبخ يعمل أثناء استلام الطلبات"
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,39,29,.08)_0%,rgba(13,39,29,.02)_42%,rgba(247,242,231,.95)_64%,#f7f2e7_100%)]" />
      <div className="absolute inset-x-0 bottom-0 top-[18%] hidden items-end gap-4 px-5 pb-7 lg:grid lg:grid-cols-3 xl:px-7">
        {[
          <CustomerMessageCard key="m" />,
          <UnderstoodOrderCard key="u" />,
          <ConfirmedOrderCard key="c" />,
        ].map((card, index) => (
          <div
            key={index}
            className={`ml3b-journey-card transition duration-700 ${active === index ? "-translate-y-3 opacity-100" : "translate-y-1 opacity-[.86]"}`}
            aria-current={active === index ? "step" : undefined}
          >
            {card}
          </div>
        ))}
      </div>

      <div className="absolute inset-x-4 bottom-5 lg:hidden">
        <div className="mb-3 flex justify-center gap-2" aria-label={`المرحلة ${active + 1} من 3`}>
          {[0, 1, 2].map((index) => (
            <button
              type="button"
              key={index}
              className={`h-2 rounded-full transition-all ${active === index ? "w-8 bg-[#b8872d]" : "w-2 bg-[#1f6044]/30"}`}
              onClick={() => setActive(index)}
              aria-label={`عرض المرحلة ${index + 1}`}
            />
          ))}
        </div>
        <div className="mx-auto max-w-[360px]" aria-live="polite">
          {cards[active]}
        </div>
      </div>

      <div className="absolute left-5 top-5 rounded-xl border border-white/30 bg-[#fffdf8]/88 px-4 py-2 text-xs font-extrabold text-[#194d39] backdrop-blur">
        تجربة مباشرة
      </div>
    </div>
  );
}

function StageHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#dfd2b8] px-5 py-4">
      <span className="text-lg font-extrabold text-[#244f3d]">{title}</span>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#235f45] text-sm font-extrabold text-white">
        {number}
      </span>
    </div>
  );
}

function CustomerMessageCard() {
  return (
    <article className="overflow-hidden rounded-[1.35rem] border border-[#ddcba7] bg-[#fffdf8]/96 shadow-[0_20px_60px_-35px_rgba(38,62,48,.55)] backdrop-blur">
      <StageHeader number="1" title="رسالة الزبون" />
      <div className="px-4 py-3 text-xs text-[#708078]">واتساب · الآن</div>
      <div className="mx-4 rounded-2xl rounded-br-sm border border-[#d7d9c9] bg-[#eef3e9] p-4 text-sm font-medium leading-7 text-[#284c3b]">
        مرحباً، أبغي عشاء لـ4 أشخاص، شيء صحي وبدون جلوتين. عندكم اقتراح؟
        <div className="mt-2 text-left text-[10px] text-[#7a8881]">21:42</div>
      </div>
      <div className="mx-4 my-3 w-14 rounded-full bg-[#edf0e9] px-4 py-2 text-center font-extrabold tracking-[.2em] text-[#7d8a83]">
        •••
      </div>
      <div className="m-4 flex items-center justify-between rounded-xl border border-[#e1d7c3] px-3 py-3 text-xs text-[#8a918d]">
        <span>اكتب رسالة...</span>
        <MessageCircle className="h-4 w-4" />
      </div>
    </article>
  );
}

function UnderstoodOrderCard() {
  return (
    <article className="overflow-hidden rounded-[1.35rem] border border-[#ddcba7] bg-[#fffdf8]/96 shadow-[0_20px_60px_-35px_rgba(38,62,48,.55)] backdrop-blur">
      <StageHeader number="2" title="فهم الطلب" />
      <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-[#587267]">
        تم فهم الطلب واقتراح الأنسب <CheckCircle2 className="h-4 w-4 text-[#2f7d59]" />
      </div>
      <img
        src="/landing/salmon-plate.webp"
        alt="اقتراح وجبة سلمون مشوي"
        className="mx-auto aspect-[1.35] w-[calc(100%-1.5rem)] rounded-xl object-cover"
      />
      <div className="px-4 py-3 text-center">
        <div className="font-extrabold text-[#244f3d]">سلمون مشوي مع رز</div>
        <div className="mt-1 text-xs text-[#6e7b74]">صحي · بدون جلوتين</div>
      </div>
      <div className="mx-4 mb-4 rounded-xl border border-[#e3d7bf] px-3 py-2.5 text-center text-xs font-bold text-[#5b6b63]">
        تعديل أو إضافة طلب
      </div>
    </article>
  );
}

function ConfirmedOrderCard() {
  return (
    <article className="overflow-hidden rounded-[1.35rem] border border-[#ddcba7] bg-[#fffdf8]/96 shadow-[0_20px_60px_-35px_rgba(38,62,48,.55)] backdrop-blur">
      <StageHeader number="3" title="تم التأكيد" />
      <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-[#587267]">
        تم تأكيد الطلب بنجاح <CheckCircle2 className="h-4 w-4 text-[#2f7d59]" />
      </div>
      <div className="mx-4 rounded-xl border border-[#e0d6c2] p-4 text-sm">
        <div className="mb-3 font-extrabold text-[#244f3d]">ملخص الطلب</div>
        <OrderLine name="سلمون مشوي مع رز" qty="×2" />
        <OrderLine name="سلطة أفوكادو" qty="×1" />
        <OrderLine name="مياه غازية" qty="×2" />
        <div className="mt-3 flex items-center justify-between border-t border-[#e6dcc8] pt-3 font-extrabold">
          <span>الإجمالي</span>
          <span>286 ر.س</span>
        </div>
      </div>
      <div className="mx-4 mt-3 rounded-xl bg-[#f4ecdb] px-4 py-3 text-center">
        <div className="text-[10px] text-[#7d817a]">وقت التحضير المتوقع</div>
        <div className="mt-1 text-lg font-extrabold text-[#b17e23]">23 دقيقة</div>
      </div>
      <div className="m-4 flex items-center justify-between rounded-xl border border-[#e0d6c2] px-3 py-3 text-xs font-bold text-[#496457]">
        <span>تم إرسال التذكرة للمطبخ · K-1048</span>
        <Printer className="h-4 w-4" />
      </div>
    </article>
  );
}

function OrderLine({ name, qty }: { name: string; qty: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[#50635a]">
      <span>{name}</span>
      <span className="font-bold">{qty}</span>
    </div>
  );
}

function ResultsRibbon() {
  return (
    <div className="grid overflow-hidden rounded-[1.5rem] border border-[#d8bf8c] bg-[#fffdf8]/82 shadow-[0_18px_60px_-48px_rgba(31,78,55,.45)] backdrop-blur md:grid-cols-[1fr_1fr_1fr_1.35fr]">
      <Metric value="98%" label="ردود تلقائية" />
      <Metric value="0" label="طلبات مكررة" />
      <Metric value="+31%" label="طلبات إضافية" />
      <div className="flex flex-col items-center justify-center gap-3 border-t border-[#e0cfad] px-5 py-5 md:border-r md:border-t-0">
        <div className="text-sm font-bold">يتصل أينما كان زبائنك</div>
        <div className="flex gap-2">
          {channels.map((channel) => (
            <span
              key={channel.name}
              className="grid h-10 w-10 place-items-center rounded-xl text-base font-extrabold text-white shadow-sm"
              style={{ background: channel.color }}
              title={channel.name}
            >
              {channel.mark}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-[#e0cfad] px-5 py-5 text-center md:border-b-0 md:border-r">
      <div className="text-4xl font-extrabold tracking-tight text-[#1c573f]">{value}</div>
      <div className="mt-1 text-sm font-medium text-[#52665c]">{label}</div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-[#d8c7a6] bg-[#fdfbf5] shadow-[0_28px_70px_-45px_rgba(32,75,53,.6)]">
      <div className="flex h-10 items-center justify-between border-b border-[#e7dcc6] px-4 text-[10px] text-[#79837d]">
        <span>مطعم النخيل · نظرة عامة</span>
        <span className="h-2 w-2 rounded-full bg-[#52a16f]" />
      </div>
      <div className="grid min-h-[410px] grid-cols-[72px_1fr] sm:grid-cols-[105px_1fr]">
        <aside className="border-l border-[#e7dcc6] bg-[#f6f2e8] p-2 sm:p-3">
          <div className="mb-5 hidden justify-center sm:flex">
            <MadaMark className="h-8 w-8" />
          </div>
          {[LayoutDashboard, ShoppingBag, Store, BarChart3, ShieldCheck].map((Icon, index) => (
            <div
              key={index}
              className={`mb-2 flex items-center gap-2 rounded-lg p-2 text-[10px] ${index === 0 ? "bg-[#dfe8df] font-extrabold text-[#1f6044]" : "text-[#68766f]"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">
                {["الرئيسية", "الطلبات", "الفروع", "التقارير", "الإعدادات"][index]}
              </span>
            </div>
          ))}
        </aside>
        <div className="p-3 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniStat label="إجمالي الطلبات" value="1,248" trend="+18%" />
            <MiniStat label="وقت التأكيد" value="00:34" trend="-12%" />
            <MiniStat label="قيمة الطلب" value="126 ر.س" trend="+22%" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_.8fr]">
            <div className="rounded-xl border border-[#e5dbc7] bg-white p-3">
              <div className="text-xs font-extrabold">الطلبات</div>
              <div
                className="mt-3 flex h-32 items-end gap-1.5"
                aria-label="مخطط الطلبات خلال الأسبوع"
              >
                {[28, 42, 34, 58, 47, 72, 55, 81, 69, 93, 78, 98].map((height, index) => (
                  <span
                    key={index}
                    className="ml3b-bar flex-1 rounded-t bg-[#4f976c]/75"
                    style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#e5dbc7] bg-white p-3">
              <div className="text-xs font-extrabold">حسب القناة</div>
              <div className="mx-auto mt-5 grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(#4d9b6a_0_48%,#d16b73_48%_70%,#4c70ad_70%_88%,#6b66a2_88%)]">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-xs font-extrabold">
                  1,248
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.1fr]">
            <div className="rounded-xl border border-[#e5dbc7] bg-white p-3">
              <div className="text-xs font-extrabold">نسبة التأكيد</div>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-3xl font-extrabold text-[#1f6044]">98%</span>
                <svg
                  viewBox="0 0 130 42"
                  className="h-10 w-28"
                  role="img"
                  aria-label="اتجاه نسبة التأكيد"
                >
                  <path
                    d="M2 33 C18 30, 21 13, 37 19 S58 29, 70 15 S94 18, 106 10 S120 11, 128 5"
                    fill="none"
                    stroke="#4f976c"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[#e5dbc7] bg-[#eee5d5]">
              <img
                src="/landing/salmon-plate.webp"
                alt="طبق مقترح من الوكيل"
                className="h-full min-h-28 w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#173f31]/85 to-transparent p-3 pt-8 text-xs font-extrabold text-white">
                اقتراحات ترفع متوسط الطلب
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-[#e5dbc7] bg-white p-3">
      <div className="text-[9px] text-[#78847e]">{label}</div>
      <div className="mt-2 text-lg font-extrabold text-[#214d3a]">{value}</div>
      <div
        className={`mt-1 text-[9px] font-bold ${trend.startsWith("-") ? "text-[#c45252]" : "text-[#38875a]"}`}
      >
        {trend}
      </div>
    </div>
  );
}

function SectionTag({
  icon: Icon,
  dark = false,
  children,
}: {
  icon: LucideIcon;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold ${dark ? "bg-white/10 text-[#e6c883]" : "border border-[#dac28f] bg-[#f5ead3] text-[#7c6130]"}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </div>
  );
}

function FeatureTick({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e0d2b6] bg-white/70 px-4 py-3 text-sm font-bold">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e1ebe3] text-[#1f6044]">
        <Icon className="h-4 w-4" />
      </span>
      {text}
    </div>
  );
}

function LandingStyles() {
  return (
    <style>{`
      .ml3b { font-family: "Tajawal", ui-sans-serif, system-ui, sans-serif; }
      .ml3b * { box-sizing: border-box; }
      .ml3b-primary {
        background: linear-gradient(135deg, #24684a, #174b37);
        box-shadow: 0 14px 32px -20px rgba(23, 75, 55, .9);
        transition: transform .25s ease, box-shadow .25s ease, background .25s ease;
      }
      .ml3b-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 38px -20px rgba(23, 75, 55, 1); background: linear-gradient(135deg, #2a7653, #174b37); }
      .ml3b-nav { position: relative; color: #415f51; transition: color .2s ease; }
      .ml3b-nav::after { content: ""; position: absolute; inset-inline: 50%; bottom: -9px; height: 2px; background: #b8872d; transition: inset-inline .25s ease; }
      .ml3b-nav:hover { color: #174b37; }
      .ml3b-nav:hover::after { inset-inline: 0; }
      .ml3b-grain {
        opacity: .32;
        background-image:
          radial-gradient(circle at 15% 15%, rgba(184, 135, 45, .16), transparent 28%),
          radial-gradient(circle at 85% 38%, rgba(31, 96, 68, .13), transparent 31%);
      }
      [data-ml3b-reveal] { opacity: 0; transform: translateY(24px); transition: opacity .75s ease, transform .75s cubic-bezier(.22,1,.36,1); }
      [data-ml3b-reveal][data-visible="true"] { opacity: 1; transform: translateY(0); }
      .ml3b-journey-card { animation: ml3b-float 7s ease-in-out infinite; }
      .ml3b-journey-card:nth-child(2) { animation-delay: -2.2s; }
      .ml3b-journey-card:nth-child(3) { animation-delay: -4.4s; }
      .ml3b-feature { transition: transform .28s ease, box-shadow .28s ease, border-color .28s ease; }
      .ml3b-feature:hover { transform: translateY(-5px); border-color: #c9a867; box-shadow: 0 26px 54px -42px rgba(31, 96, 68, .7); }
      .ml3b-bar { transform-origin: bottom; animation: ml3b-grow .9s both cubic-bezier(.22,1,.36,1); }
      .ml3b-dark-orb { background: radial-gradient(circle at 15% 15%, rgba(211,174,103,.19), transparent 30%), radial-gradient(circle at 85% 90%, rgba(122,185,142,.11), transparent 28%); }
      .ml3b-cta-pattern { background: radial-gradient(circle at 18% 20%, rgba(211,174,103,.18), transparent 25%), linear-gradient(120deg, transparent 35%, rgba(255,255,255,.04) 35% 36%, transparent 36% 64%, rgba(255,255,255,.04) 64% 65%, transparent 65%); }
      @keyframes ml3b-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
      @keyframes ml3b-grow { from { transform: scaleY(.05); opacity: .15; } to { transform: scaleY(1); opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        .ml3b *, .ml3b *::before, .ml3b *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
        [data-ml3b-reveal] { opacity: 1; transform: none; }
      }
    `}</style>
  );
}
