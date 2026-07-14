import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  component: DataDeletionPage,
  head: () => ({
    meta: [
      { title: "حذف بيانات المستخدم — Mada" },
      { name: "description", content: "تعليمات حذف بيانات المستخدم من منصة Mada." },
      { property: "og:title", content: "حذف بيانات المستخدم — Mada" },
      { property: "og:description", content: "كيفية طلب حذف بياناتك من منصة Mada." },
      { property: "og:url", content: "https://clever-resto-ai.lovable.app/data-deletion" },
    ],
    links: [{ rel: "canonical", href: "https://clever-resto-ai.lovable.app/data-deletion" }],
  }),
});

const UPDATED = "13 تموز 2026";
const EMAIL = "cdasplay@gmail.com";

function DataDeletionPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">→ العودة للرئيسية</Link>
        <h1 className="mt-4 text-3xl font-bold">تعليمات حذف بيانات المستخدم</h1>
        <p className="mt-2 text-sm text-muted-foreground">آخر تحديث: {UPDATED}</p>

        <div className="mt-8 space-y-6 leading-relaxed text-sm md:text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">١. ما البيانات التي نحتفظ بها</h2>
            <p>
              تحتفظ منصّة «Mada» ببيانات الطلبات والمحادثات التي يتبادلها الزبون مع بوت
              المطعم عبر واتساب أو تيليجرام، بما في ذلك: اسم الزبون، رقم الهاتف، الموقع الجغرافي
              إن شاركه، الأصناف المطلوبة، ومحتوى الرسائل.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٢. كيف تطلب حذف بياناتك</h2>
            <p>لطلب حذف كامل بياناتك من أنظمتنا، اتبع الخطوات التالية:</p>
            <ol className="list-decimal pr-6 space-y-2 mt-2">
              <li>
                أرسل بريداً إلكترونياً إلى:{" "}
                <span className="font-mono" dir="ltr">{EMAIL}</span>
              </li>
              <li>
                استخدم عنوان الرسالة: <b>«طلب حذف بيانات»</b>
              </li>
              <li>
                اذكر في نص الرسالة: <b>رقم الهاتف</b> الذي استخدمته للتواصل مع البوت، واسم
                المطعم الذي طلبت منه.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٣. مدة المعالجة</h2>
            <p>
              سنقوم بمعالجة طلبك وحذف بياناتك خلال مدة أقصاها <b>30 يوماً</b> من تاريخ استلام
              الطلب، وسنرسل لك تأكيداً عبر البريد الإلكتروني عند اكتمال الحذف.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٤. البيانات المستثناة</h2>
            <p>
              قد نحتفظ ببعض السجلات المحاسبية أو القانونية التي يفرض القانون الاحتفاظ بها،
              بشكلٍ مجهول الهوية (بدون معلومات تعريفية عنك).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٥. حذف حساب فيسبوك/واتساب</h2>
            <p>
              إذا كنت وصلت إلينا عبر تسجيل دخول فيسبوك أو ربط واتساب، فإن حذف بياناتك من
              منصّتنا لا يحذف حسابك على فيسبوك أو واتساب. لإدارة صلاحيات التطبيق، توجّه إلى
              إعدادات فيسبوك ← التطبيقات والمواقع.
            </p>
          </section>

          <p className="pt-4 text-sm text-muted-foreground">
            اطّلع أيضاً على{" "}
            <Link to="/privacy" className="underline hover:text-foreground">سياسة الخصوصية</Link>{" "}
            و<Link to="/terms" className="underline hover:text-foreground">شروط الاستخدام</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
