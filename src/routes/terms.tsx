import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

const UPDATED = "23 حزيران 2026";

function TermsPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">→ العودة للرئيسية</Link>
        <h1 className="mt-4 text-3xl font-bold">شروط الاستخدام</h1>
        <p className="mt-2 text-sm text-muted-foreground">آخر تحديث: {UPDATED}</p>

        <div className="mt-8 space-y-6 leading-relaxed text-sm md:text-base">
          <section>
            <h2 className="text-xl font-semibold mb-2">١. قبول الشروط</h2>
            <p>
              باستخدامك منصّة «مطعمي AI» (الخدمة)، فإنك توافق على هذه الشروط. إذا لم توافق
              عليها، يُرجى عدم استخدام الخدمة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٢. وصف الخدمة</h2>
            <p>
              نوفّر للمطاعم مساعد ذكاء اصطناعي يستقبل طلبات الزبائن عبر تطبيقات المراسلة،
              ولوحة تحكّم لإدارة المنيو والفروع والطلبات والاشتراك.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٣. الحساب والاشتراك</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>أنت مسؤول عن دقّة بيانات مطعمك (المنيو، الأسعار، الفروع، ساعات العمل).</li>
              <li>تخضع الخدمة لباقة اشتراك بحدود استخدام شهرية (عدد الردود والطلبات).</li>
              <li>عند تجاوز حدّ الباقة قد يتوقف البوت عن الرد حتى التجديد أو الترقية.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٤. الاستخدام المقبول</h2>
            <p>
              يُمنع استخدام الخدمة لأي غرض غير قانوني، أو لإرسال محتوى مسيء أو مضلّل، أو
              لإساءة استخدام أنظمة المراسلة. نحتفظ بحقّ إيقاف أي حساب يخالف ذلك.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٥. دقّة المساعد الذكي</h2>
            <p>
              يبذل المساعد جهده لفهم الطلبات بدقّة، لكنه نظام آلي قد يخطئ أحياناً. تقع على
              المطعم مسؤولية مراجعة الطلبات قبل التحضير. لا نتحمّل مسؤولية أخطاء ناتجة عن
              بيانات منيو غير صحيحة أو سوء فهم لغوي.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٦. المدفوعات</h2>
            <p>
              تُسجَّل المدفوعات وفق ما يُتّفق عليه عند تفعيل الباقة. الرسوم غير قابلة للاسترداد
              عن المدد المستهلكة ما لم يُنصّ على غير ذلك.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٧. حدود المسؤولية</h2>
            <p>
              تُقدَّم الخدمة «كما هي». لا نتحمّل أضراراً غير مباشرة ناتجة عن انقطاع الخدمة أو
              فقدان بيانات خارج سيطرتنا، وذلك إلى الحدّ الذي يسمح به القانون.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٨. التعديلات</h2>
            <p>
              قد نحدّث هذه الشروط من وقت لآخر، ويسري التحديث فور نشره على هذه الصفحة.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">٩. التواصل</h2>
            <p>
              لأي استفسار حول الشروط، راسلنا على:
              <span className="font-mono" dir="ltr"> cdasplay@gmail.com</span>
            </p>
          </section>

          <p className="pt-4 text-sm text-muted-foreground">
            اطّلع أيضاً على <Link to="/privacy" className="underline hover:text-foreground">سياسة الخصوصية</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
