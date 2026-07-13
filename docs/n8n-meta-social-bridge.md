# ربط إنستغرام وفيسبوك مع المنصة عبر n8n (Meta Social Bridge)

هذا الدليل يشرح تشغيل طبقة الربط بين منصات التواصل (إنستغرام / فيسبوك) والمنصة،
باستخدام n8n workflow جاهز اسمه **Meta Social Bridge (IG/FB → Resto AI)**.

- رابط الـ workflow: https://momo121.app.n8n.cloud/workflow/wWBX4nj7bmgtmXvE
- رابط الـ webhook (بعد التفعيل): `https://momo121.app.n8n.cloud/webhook/meta-social`
- Verify Token المستخدم مع Meta: `clever-resto-verify`

## شنو يسوي الـ workflow

| الحدث من Meta | المسار داخل المنصة | الرد |
|---|---|---|
| رسالة خاصة (DM) إنستغرام أو ماسنجر | ينشئ/يلقى المحادثة بجدول `conversations` ويستدعي `agent-run` (نفس مسار تيليكرام وواتساب) | يرسل رد الوكيل كرسالة خاصة عبر Graph API |
| تعليق على منشور (فيسبوك أو إنستغرام) | يستدعي `social-reply` | ينشر الرد كتعليق فرعي |
| منشن على إنستغرام | يستدعي `social-reply` | ينشر الرد كتعليق |
| رد على ستوري | يستدعي `social-reply` بنوع `story_reply` | يرسل الرد كرسالة خاصة |

الرسائل الصادرة من الصفحة نفسها (echo) تنطاف تلقائياً حتى ما تصير حلقة ردود.

## خطوات التشغيل

### 1) إنشاء تطبيق Meta (مرة واحدة)

1. ادخل على https://developers.facebook.com → **My Apps** → **Create App** → نوع **Business**.
2. من لوحة التطبيق أضف منتجات: **Messenger** و **Instagram** (ولو تريد تعليقات فيسبوك: **Webhooks**).
3. اربط صفحة الفيسبوك مال المطعم بالتطبيق، وتأكد إن حساب الإنستغرام **حساب أعمال (Business)** ومربوط بنفس الصفحة.

### 2) الصلاحيات المطلوبة

من **App Review → Permissions** (أو أثناء توليد التوكن):

- `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `pages_manage_engagement`
- `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`

بوضع التطوير (Development Mode) تشتغل هاي الصلاحيات على الحسابات المضافة كـ Testers/Admins بدون مراجعة — كافي للتجربة. للإطلاق العام تحتاج App Review من Meta.

### 3) توليد Page Access Token

1. من **Graph API Explorer** (developers.facebook.com/tools/explorer) اختر تطبيقك.
2. اختر **Page Token** للصفحة، وفعّل الصلاحيات أعلاه.
3. حوّله لتوكن طويل الأمد (long-lived) من **Access Token Debugger** → Extend.

### 4) إعداد الـ Credentials بحساب n8n

من **Settings → Credentials** أنشئ ثلاثة:

| الاسم | النوع | القيم |
|---|---|---|
| Supabase apikey (service role) | Header Auth | Name: `apikey` — Value: مفتاح `service_role` من إعدادات Supabase |
| Supabase Bearer (service role) | Bearer Auth | نفس مفتاح `service_role` |
| Meta Page Access Token | Facebook Graph API | الـ Page Access Token من الخطوة 3 |

بعدين افتح الـ workflow واربط كل credential بالعقد المؤشرة بالأحمر، واضغط **Publish**.

> مفتاح `service_role` موجود بـ Supabase Dashboard → Project Settings → API. لا تحطه بأي مكان ثاني غير n8n Credentials.

### 5) تعبئة جدول الربط `meta_page_map`

بحساب n8n → **Data Tables** → `meta_page_map`، أضف سطر لكل مطعم/منصة:

| العمود | القيمة |
|---|---|
| `page_id` | معرف صفحة الفيسبوك، أو معرف حساب الإنستغرام (IG Business Account ID) |
| `platform` | `facebook` أو `instagram` |
| `restaurant_id` | معرف المطعم من جدول `restaurants` بقاعدة البيانات |

ملاحظة: الإنستغرام والفيسبوك إلهم معرفات مختلفة — أضف سطرين إذا المطعم يستخدم الاثنين.
تلقى الـ IG Account ID من Graph API Explorer بطلب: `GET /me/accounts?fields=instagram_business_account,name`.

### 6) ربط الـ Webhook بتطبيق Meta

بعد ما تضغط Publish بالـ workflow:

1. من لوحة التطبيق → **Webhooks** (أو إعدادات Messenger/Instagram → Webhooks):
   - **Callback URL**: `https://momo121.app.n8n.cloud/webhook/meta-social`
   - **Verify Token**: `clever-resto-verify`
   - اضغط **Verify and Save** — لازم ينجح فوراً.
2. اشترك بالحقول:
   - كائن **page**: `messages`, `feed`
   - كائن **instagram**: `messages`, `comments`, `mentions`
3. من إعدادات Messenger/Instagram → **Webhooks** اربط الصفحة نفسها بالاشتراك (Add Subscriptions للصفحة).

### 7) التجربة

1. دز رسالة خاصة لحساب الإنستغرام من حساب ثاني (لازم يكون Tester إذا التطبيق بوضع التطوير) — المفروض يرد وكيل الطلبات بالعراقي.
2. اكتب تعليق على منشور — المفروض يجي رد تسويقي قصير (إذا مفعّل `comment_replies_enabled` بأعلام المطعم).
3. راقب التنفيذات من تبويب **Executions** بالـ workflow لأي خطأ.

## حدود النسخة الحالية

- الرسائل الصوتية والصور بالـ DM ما مدعومة بعد (النص فقط) — نفس وضع واتساب الحالي تقريباً.
- الردود على التعليقات تحتاج علم `comment_replies_enabled` وردود الستوري علم `story_replies_enabled` بحقل `feature_flags` للمطعم.
- توثيق توقيع Meta (X-Hub-Signature-256) غير مفعّل بالـ workflow حالياً؛ حماية إضافية ممكن إضافتها لاحقاً.
- الـ Page Access Token واحد لكل الـ workflow — إذا صار عدكم أكثر من صفحة لأكثر من مطعم بتطبيقات منفصلة، نطور الجدول ليخزن توكن لكل صفحة.
