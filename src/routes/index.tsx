import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpLeft,
  Building2,
  Check,
  CheckCircle2,
  Headset,
  Instagram,
  Menu,
  MessageSquare,
  Send,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import { MadaLogo } from "@/components/mada-logo";
import { ProductPreview } from "@/components/product-preview";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MADA AI — كل طلب. تحت السيطرة." },
      {
        name: "description",
        content:
          "منصة إدارة المطاعم ووكيل ذكي لاستقبال الرسائل وتأكيد الطلبات، مع المنيو والفروع والمحادثات في مكان واحد.",
      },
      { name: "theme-color", content: "#10120f" },
      { property: "og:title", content: "MADA AI — كل طلب. تحت السيطرة." },
      { property: "og:image", content: "/landing/restaurant-counter.webp" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ShoppingBag,
    title: "طلب واضح، من البداية.",
    text: "الوكيل يبني السلة، يحسب المجموع ويعرض الملخص قبل التأكيد.",
  },
  {
    icon: MessageSquare,
    title: "كل الرسائل، بمكان واحد.",
    text: "تابع المحادثات من لوحة موحدة وتولّ الرد وقت الحاجة.",
  },
  {
    icon: Building2,
    title: "فروعك، تحت نظرك.",
    text: "اضبط المنيو وساعات العمل ومناطق التوصيل لكل فرع.",
  },
  {
    icon: ShieldCheck,
    title: "تفاصيل ما تضيع.",
    text: "سجل للطلبات والشكاوى ونشاط الوكيل، مع صلاحيات مطعمك.",
  },
];
const PLANS = [
  {
    name: "المبتدئ",
    detail: "لبداية مرتبة",
    price: "حسب الاتفاق",
    features: ["فرع واحد", "قناة تيليجرام", "استخراج المنيو من الصور", "لوحة الطلبات وتنبيهاتها"],
  },
  {
    name: "الاحترافي",
    detail: "للمطعم اللي يكبر",
    price: "حسب الاتفاق",
    features: [
      "حتى ٣ فروع",
      "إدارة القنوات حسب الربط",
      "نطاقات التوصيل وذاكرة الزبون",
      "الشكاوى والتحويل والتحليلات",
    ],
  },
  {
    name: "الأعمال",
    detail: "لاحتياجات متعددة الفروع",
    price: "تواصل معنا",
    features: [
      "إعداد يناسب عدد فروعك",
      "وصول API للتكامل",
      "تقارير موسعة",
      "تحديد الدعم وحدود الباقة مع الفريق",
    ],
  },
];

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const landingRef = useScrollReveal();
  return (
    <div ref={landingRef} className="mada-landing" dir="rtl">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-50 focus:bg-action focus:p-3 focus:text-ink"
      >
        انتقل للمحتوى
      </a>
      <div className="mx-auto max-w-[1344px] px-5 sm:px-8 lg:px-12">
        <header className="mada-landing-header">
          <Link to="/" aria-label="MADA AI الرئيسية">
            <MadaLogo />
          </Link>
          <nav
            className="hidden items-center gap-8 text-sm text-white/70 md:flex"
            aria-label="الموقع"
          >
            <a href="#features" className="hover:text-action">
              المزايا
            </a>
            <a href="#how" className="hover:text-action">
              كيف يعمل
            </a>
            <a href="#pricing" className="hover:text-action">
              الأسعار
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="rounded-lg border border-white/30 px-5 py-2 text-sm hover:bg-white/5"
            >
              دخول
            </Link>
            <Button asChild className="hidden sm:inline-flex">
              <Link to="/auth">
                جرّب الوكيل
                <ArrowUpLeft className="h-4 w-4" />
              </Link>
            </Button>
            <button
              type="button"
              className="p-2 md:hidden"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>
        {menuOpen && (
          <nav
            id="mobile-menu"
            className="grid gap-1 border-b border-white/15 py-3 text-sm md:hidden"
            aria-label="قائمة الموقع"
          >
            {[
              { href: "#features", label: "المزايا" },
              { href: "#how", label: "كيف يعمل" },
              { href: "#pricing", label: "الأسعار" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-3 hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <main id="main">
          <section className="mada-landing-hero">
            <div>
              <p className="mada-enter mb-6 flex items-center gap-2 text-xs text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-action" />
                وكيل المطاعم الذكي
              </p>
              <h1 className="mada-enter" data-enter-delay="1">
                كل طلب.
                <br />
                <span className="whitespace-nowrap text-action">تحت السيطرة.</span>
              </h1>
              <p
                className="mada-enter mt-7 max-w-md text-base leading-8 text-white/65 md:text-lg"
                data-enter-delay="2"
              >
                وكيل ذكي يستقبل الرسائل ويؤكد الطلبات، وفريقك يركز على الخدمة.
              </p>
              <div className="mada-enter mt-8 flex flex-wrap gap-3" data-enter-delay="3">
                <Button size="lg" asChild className="mada-motion-cta">
                  <a href="#demo">
                    شاهد التجربة
                    <ArrowLeft className="h-4 w-4" />
                  </a>
                </Button>
                <a
                  href="#how"
                  className="flex min-h-12 items-center rounded-lg border border-white/35 px-6 text-sm hover:bg-white/5"
                >
                  كيف يعمل؟
                </a>
              </div>
              <p className="mada-enter mt-6 text-xs text-white/40" data-enter-delay="4">
                الطلبات والمحادثات والمنيو، في مساحة واحدة.
              </p>
            </div>
            <div className="mada-enter min-w-0" data-enter-delay="2">
              <ProductPreview />
            </div>
          </section>
        </main>
      </div>
      <section id="how" className="mada-light-section">
        <div className="mx-auto max-w-[1344px] px-5 py-14 sm:px-8 lg:px-12">
          <div data-reveal>
            <p className="mb-3 text-xs text-black/45">من الفكرة إلى التنفيذ</p>
            <h2 className="mada-landing-section-title">من الرسالة إلى الطلب.</h2>
          </div>
          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {[
              { title: "استقبل", text: "رسائل الزبائن تصل إلى مساحة موحدة." },
              { title: "افهم", text: "الوكيل يفهم الطلب ويرتب الأصناف والتوصيل." },
              { title: "نفّذ", text: "يعرض الملخص، ويثبت الطلب بعد التأكيد." },
            ].map((step, i) => (
              <div
                key={step.title}
                data-reveal
                data-reveal-delay={i}
                className="border-s border-black/15 ps-5"
              >
                <h3 className="flex items-center gap-3 text-2xl font-semibold">
                  <span className="text-base text-black/40" dir="ltr">
                    0{i + 1}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-3 text-sm text-black/60">{step.text}</p>
              </div>
            ))}
          </div>
          <div
            data-reveal="image"
            className="mada-scene-frame mt-12 h-44 overflow-hidden rounded-xl sm:h-64"
          >
            <img
              src="/landing/restaurant-counter.webp"
              alt="مساحة عمل مطعم بإضاءة دافئة"
              width={1672}
              height={941}
              loading="lazy"
              className="h-full w-full object-cover object-center"
            />
          </div>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-[1344px] px-5 py-20 sm:px-8 lg:px-12">
        <div data-reveal className="flex flex-wrap items-end justify-between gap-5">
          <h2 className="mada-landing-section-title">
            فريقك بالخدمة.
            <br />
            <span className="text-white/45">والوكيل يتابع.</span>
          </h2>
          <p className="max-w-sm text-sm leading-7 text-white/60">
            أدوات التشغيل والنمو كلها ضمن هوية واحدة، من شاشة الموبايل إلى اللابتوب.
          </p>
        </div>
        <div className="mt-12 grid gap-x-10 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <article
              key={title}
              data-reveal
              data-reveal-delay={i % 2}
              className="mada-feature-card flex gap-5 border-t border-white/20 py-8"
            >
              <Icon className="mt-1 h-6 w-6 shrink-0 text-action" />
              <div>
                <h3 className="text-xl font-medium">{title}</h3>
                <p className="mt-3 max-w-md text-sm leading-7 text-white/55">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section id="demo" className="mada-light-section">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div data-reveal>
            <p className="mb-3 text-xs text-black/45">جرّب الفكرة</p>
            <h2 className="mada-landing-section-title">
              رسالة بسيطة.
              <br />
              طلب مرتب.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-8 text-black/60">
              هاي محاكاة توضيحية لمسار الطلب. جرّب الخطوات، وبعدها افتح حسابك لإعداد مطعمك الحقيقي.
            </p>
            <div className="mt-7 flex items-center gap-5 text-black/50">
              <Send className="h-5 w-5" />
              <Instagram className="h-5 w-5" />
              <MessageSquare className="h-5 w-5" />
              <span className="text-xs">القنوات حسب إعداد مطعمك</span>
            </div>
          </div>
          <div data-reveal data-reveal-delay="1" className="min-w-0">
            <OrderDemo />
          </div>
        </div>
      </section>
      <section id="pricing" className="mada-light-section border-t border-black/15">
        <div className="mx-auto max-w-[1344px] px-5 py-20 sm:px-8 lg:px-12">
          <div data-reveal>
            <p className="mb-3 text-xs text-black/45">الاشتراك</p>
            <h2 className="mada-landing-section-title">باقة تناسب شغلك.</h2>
            <p className="mt-4 text-sm text-black/55">
              التكلفة وحدود الاستخدام تحدد عند تفعيل الباقة.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <article
                key={plan.name}
                data-reveal
                data-reveal-delay={i}
                className={`mada-pricing-card ${i === 1 ? "bg-ink text-white" : "bg-white/30"}`}
              >
                <span className={`text-xs ${i === 1 ? "text-action" : "text-black/50"}`}>
                  {plan.detail}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">{plan.name}</h3>
                <p className="mt-5 border-b border-current/20 pb-5 text-lg">{plan.price}</p>
                <ul className="my-6 flex-1 space-y-4 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={i === 1 ? "default" : "outline"}
                  className={i === 1 ? "" : "border-black/30 text-ink"}
                >
                  <Link to="/auth">
                    ابدأ الآن
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="contact"
        className="mx-auto flex max-w-[1344px] flex-col justify-between gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-center lg:px-12"
      >
        <div data-reveal>
          <p className="mb-3 text-xs text-action">جاهز للخطوة الجاية؟</p>
          <h2 className="mada-landing-section-title">خلّي شغلك أوضح.</h2>
        </div>
        <div data-reveal data-reveal-delay="1" className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="mada-motion-cta">
            <Link to="/auth">
              ابدأ بإعداد مطعمك
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <a
            href="mailto:cdasplay@gmail.com"
            className="flex items-center gap-2 rounded-lg border border-white/30 px-6 py-3 text-sm"
          >
            <Headset className="h-4 w-4" />
            تواصل ويانا
          </a>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1344px] flex-col justify-between gap-6 border-t border-white/20 px-5 py-8 text-xs text-white/50 sm:flex-row sm:px-8 lg:px-12">
        <MadaLogo compact />
        <nav className="flex flex-wrap gap-5" aria-label="السياسات">
          <Link to="/privacy">الخصوصية</Link>
          <Link to="/terms">الشروط</Link>
          <Link to="/data-deletion">حذف البيانات</Link>
        </nav>
        <span>من الرسالة إلى الطلب.</span>
      </footer>
    </div>
  );
}

function OrderDemo() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-black/20 bg-white/60 text-ink">
      <div className="flex items-center justify-between border-b border-black/15 bg-ink p-5 text-white">
        <MadaLogo compact />
        <span className="rounded-full border border-white/25 px-2 py-1 text-[10px]">
          عرض توضيحي
        </span>
      </div>
      <div className="space-y-4 p-5 sm:p-7">
        <p className="ms-auto w-fit max-w-[85%] rounded-xl bg-black/5 px-4 py-3 text-sm">
          أريد برجرين دجاج، توصيل رحيموا.
        </p>
        <p className="me-auto w-fit max-w-[85%] rounded-xl bg-action/25 px-4 py-3 text-sm">
          أكيد. المجموع 14,000 د.ع. أؤكد الطلب؟
        </p>
        {confirmed ? (
          <div role="status" className="rounded-lg border border-black/20 p-5">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              تم التأكيد في العرض التجريبي
            </p>
            <p className="mt-2 text-xs text-black/50">لم يُرسل طلب حقيقي للمطعم.</p>
            <Button variant="outline" className="mt-4" onClick={() => setConfirmed(false)}>
              جرّب مرة ثانية
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setConfirmed(true)}>
            أكد الطلب التجريبي
            <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
