import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

const UPDATED = "23 حزيران 2026";

function PrivacyPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">→ العودة للرئيسية</Link>
        <h1 className="mt-4 text-3xl font-bold">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-muted-foreground">آخر تحديث: {UPDATED}</p>

        <div className="mt-8 space-y-6 leading-relaxed text-sm md:text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">١. من نحن</h2>
            <p>
              منصّة «مطعمي AI» تزوّد المطاعم بمساعد ذكاء اصطناعي يستقبل طلبات الزبائن عبر
              تطبيقات المراسلة (مثل تيليجرام). تشرح هذه السياسة البيانات التي نعالجها نيابةً
              عن المطعم، وكيف نحميها.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٢. البيانات التي نجمعها</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li><b>بيانات الطلب:</b> الأصناف المطلوبة، الأسعار، وقت الطلب وحالته.</li>
              <li><b>بيانات التواصل:</b> اسم الزبون ورقم هاتفه لإتمام الطلب والتوصيل.</li>
              <li><b>الموقع الجغرافي:</b> إذا شارك الزبون موقعه (GPS) أو عنوانه، نستخدمه فقط
                للتحقق من نطاق التوصيل وإيصال الطلب.</li>
              <li><b>محتوى المحادثة:</b> الرسائل المتبادلة مع البوت لتقديم الخدمة وتحسينها.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٣. كيف نستخدم البيانات</h2>
            <p>
              نستخدم البيانات حصراً لتشغيل خدمة استقبال الطلبات: فهم طلب الزبون، تأكيده،
              حساب التوصيل، وإشعار المطعم. لا نبيع بياناتك ولا نشاركها مع أطراف إعلانية.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٤. مشاركة البيانات</h2>
            <p>
              تُشارَك بيانات الطلب مع <b>المطعم</b> صاحب الخدمة لتحضير الطلب وتوصيله. نستعين
              بمزوّدي بنية تحتية (الاستضافة ومزوّد نموذج الذكاء الاصطناعي) لمعالجة الرسائل،
              ضمن اتفاقيات تحفظ سرّية البيانات.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٥. الاحتفاظ بالبيانات</h2>
            <p>
              نحتفظ ببيانات الطلبات والمحادثات للمدة اللازمة لتشغيل الخدمة وحفظ سجلّ الطلبات
              للمطعم. يمكن للمطعم أو الزبون طلب حذف بياناته كما هو موضّح أدناه.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٦. حقوقك</h2>
            <p>
              يحقّ للزبون طلب الاطلاع على بياناته أو تصحيحها أو حذفها. لتقديم الطلب، تواصل مع
              المطعم مباشرةً، أو معنا عبر البريد أدناه وسنتعامل مع طلبك خلال مدة معقولة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٧. الأمان</h2>
            <p>
              نطبّق ضوابط وصول وتشفيراً للاتصالات، ونقيّد الوصول للبيانات على ما تتطلّبه الخدمة.
              لا يمكن ضمان أمان مطلق لأي نظام، لكننا نلتزم بحماية بياناتك بأفضل الممارسات.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٨. التواصل</h2>
            <p>
              لأي استفسار حول الخصوصية أو لطلب حذف البيانات، راسلنا على:
              <span className="font-mono" dir="ltr"> cdasplay@gmail.com</span>
            </p>
          </section>

          <p className="pt-4 text-sm text-muted-foreground">
            اطّلع أيضاً على <Link to="/terms" className="underline hover:text-foreground">شروط الاستخدام</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
