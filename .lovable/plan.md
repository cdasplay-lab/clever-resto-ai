## الخطة

1. **استرجاع النسخة الصحيحة من History**
   - افتح History واختر آخر نسخة كانت قبل تعديلات الوكيل الأخيرة، تحديداً قبل التغييرات التي مست `agent-run` و`telegram-webhook` وملفات لوحة التحكم المتعلقة بالإيقاف/التحويل.
   - استخدم زر Revert من تلك النسخة حتى يرجع المشروع كما كان وقتها، بدل أي محاولة إصلاح يدوي جديدة.

2. **عدم تعديل الوكيل يدوياً**
   - لا أغير prompt الوكيل.
   - لا أغير handoff rules.
   - لا أغير telegram webhook logic.
   - لا أغير قاعدة البيانات أو migrations.
   - لا أضيف اختبارات أو refactors.

3. **تثبيت النسخة المسترجعة على الإنتاج**
   - بعد الاسترجاع، ننشر النسخة المسترجعة كما هي.
   - إذا كان عندك نشر إنتاج مفعّل، انشر من نفس النسخة المسترجعة بدون أي تغييرات إضافية.

4. **تحقق بسيط فقط**
   - اختبر رسالة Telegram جديدة.
   - نتأكد أن الوكيل يرد مثل ما كان قبل، وليس برسائل التكرار مثل: "حوّلتك لزميل بشري".

## ملاحظة مهمة
أنا ما أقدر أضغط زر History/Revert نيابةً عنك من داخل المحادثة. لازم أنت تختار النسخة من History لأن هذا استرجاع نظامي للمشروع، وليس تعديل كود.

<presentation-actions><presentation-open-history>View History</presentation-open-history></presentation-actions>

<presentation-actions><presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link></presentation-actions>