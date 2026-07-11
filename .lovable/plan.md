
## الهدف
توفير Callback URL ثابت يتماشى مع متطلبات Meta لتوصيل رسائل WhatsApp Cloud API بالبوت، مع توجيه كل رسالة للمطعم الصحيح حسب `phone_number_id`.

## الخطوات

### 1. تعديل قاعدة البيانات
- إضافة عمودين على جدول `restaurants`:
  - `whatsapp_phone_number_id text unique` — المعرّف اللي ترسل عليه Meta.
  - `whatsapp_business_account_id text` — اختياري للتحقق.
- بدون تعديل RLS (الوصول من الـ webhook عبر service role).

### 2. إنشاء endpoint عام
ملف جديد: `src/routes/api/public/meta-webhook.ts`
- `GET`: verification handshake الرسمي من Meta.
  - يقرأ `hub.mode`, `hub.verify_token`, `hub.challenge`.
  - يقارن التوكن مع `META_VERIFY_TOKEN` (secret).
  - يرجّع `hub.challenge` كنص خام (200) عند التطابق، وإلا 403.
- `POST`: استقبال الأحداث.
  - يتحقق من توقيع `X-Hub-Signature-256` باستخدام `META_APP_SECRET` (HMAC-SHA256 على الـ raw body، مقارنة `timingSafeEqual`).
  - يفكّ الحمولة ويستخرج `entry[].changes[].value.messages[]` مع `phone_number_id`.
  - يبحث عن المطعم عبر `whatsapp_phone_number_id`. لو مو موجود، يرد 200 بصمت (Meta تتطلب 200 دائماً حتى ما تعيد).
  - Idempotency: يخزّن `message.id` في `processed_updates` قبل المعالجة.
  - يستدعي `agent-run` (نفس البوت الحالي) مع channel = `whatsapp` وطبقة إرسال WhatsApp.

### 3. طبقة إرسال WhatsApp
`supabase/functions/_shared/whatsapp.ts`:
- `sendWhatsAppText(phoneNumberId, to, text)` و `sendWhatsAppLocation(...)`.
- يستخدم `META_WHATSAPP_TOKEN` (secret) ويستدعي `graph.facebook.com/v20.0/{phoneNumberId}/messages`.

### 4. تعديل `agent-run` بشكل مقتصر
- إضافة تفريع channel: لو `whatsapp`، يستدعي دوال whatsapp بدل telegram (بنفس منطق الرد/الموقع/السانيتايزر الموجود). بدون تغيير منطق العميل.

### 5. الأسرار المطلوبة (بعد الموافقة على الخطة)
- `META_VERIFY_TOKEN` — نولّده تلقائياً (`generate_secret`) لكن مشترك مع Meta لذلك سنطلب من المستخدم يكتب قيمة قوية من عنده و يلصقها في Meta ثم عندنا (shared secret).
- `META_APP_SECRET` — من App Settings في Meta (نطلبه بـ `add_secret`).
- `META_WHATSAPP_TOKEN` — Access token دائم للـ System User (نطلبه بـ `add_secret`).

### 6. ما نعطيه للمستخدم
- Callback URL: `https://project--69d6f4f9-fc25-4aef-bc41-e7320569fc12.lovable.app/api/public/meta-webhook`
- Verify Token: القيمة اللي وضعها المستخدم.
- خطوات ربط رقم واتساب بمطعم: كتابة `phone_number_id` في صفحة المطعم (سنضيف حقل بسيط في `branches-tab` أو `dashboard` لاحقاً — خارج نطاق هالخطة إذا ما طلبتها).

## ملاحظات
- الرد على Meta خلال ثوانٍ: نعالج الرسالة async (fire-and-forget) ونرجّع 200 فوراً.
- لا تسريب PII في الرد.
- لا نغيّر أي شي بتلي‌غرام.
