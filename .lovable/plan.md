

اخترت 8 مميزات. راح أقسّمها على 4 مراحل، كل مرحلة تنفذ لحالها وتنختبر قبل ما ننتقل للي بعدها — حتى نضمن إنه الوكيل يبقى يرد بدون خربطة.

## مبدأ مهم لحماية الوكيل
- **ما أمس** نظام الـ tools/الـ system prompt الحالي إلا للضرورة. كل ميزة جديدة تضاف كـ **tool منفصلة** أو **حقل سياق إضافي** بحيث لو فشلت الميزة، الوكيل يظل يشتغل كالمعتاد.
- **كل قناة جديدة** عندها webhook منفصل، بس كلها تنتهي عند نفس `agent-run` بدون تغيير منطقه.
- **التدخل البشري** يوقف الوكيل لتلك المحادثة فقط (state=handoff موجود أصلاً)، ما يأثر على باقي المحادثات.

---

## المرحلة 1 — ربط متعدد القنوات (WhatsApp + Instagram + Facebook)

**قاعدة البيانات**
- جدول `channel_integrations` (restaurant_id, channel, config jsonb, webhook_secret, is_active). يخزن توكنات WhatsApp Business Cloud API و Facebook Page Access Token و Instagram Graph token.
- إضافة `bot_username` و `external_account_id` للجدول حتى نوجّه الرسالة الواردة للمطعم الصحيح.

**Edge functions جديدة** (كل وحدة معزولة)
- `whatsapp-webhook` — يستقبل من Meta Cloud API، يتحقق من التوقيع، يحفظ في `messages`، يستدعي `agent-run`.
- `messenger-webhook` — Facebook Page Messenger.
- `instagram-webhook` — Instagram DM (نفس Graph API لـ Meta).
- كلها تستخدم نفس `tgSendMedia`/`tgSend` pattern لكن بـ API الخاص بكل منصة. أحط الدوال بـ `_shared/channels/`.

**Dashboard**
- تبويب **القنوات**: المستخدم يدخل بيانات Meta (Page ID, Access Token, Verify Token) ويشوف الـ webhook URL يدزها لـ Meta.
- خانة المحادثات الموجودة أصلاً تعرض كل القنوات (هذا سويناه).

**ما أمس**
- `agent-run` يبقى كما هو 100%. القنوات تتعامل معه عبر `conversation_id` فقط.

**الأسرار المطلوبة** (راح أطلبها لما نوصل): `META_APP_SECRET` للتحقق من توقيع Meta webhooks.

---

## المرحلة 2 — Inbox تفاعلي (تدخّل بشري + رد يدوي)

**قاعدة البيانات**
- إضافة `is_bot_paused boolean default false` و `assigned_to uuid` على `conversations`.
- سياسات RLS تسمح للمالك بـ UPDATE على conversations و INSERT على messages.

**Backend**
- Edge function `send-manual-message` — تأخذ `conversation_id` + `text`، تكتشف القناة، تدز عبر الـ API المناسب (Telegram/WhatsApp/IG/FB)، وتحفظ الرسالة في `messages` بـ role=assistant و name='human'.
- في `agent-run`: في بداية الدالة، إذا `is_bot_paused=true` → يرجع بدون استدعاء LLM. سطرين فقط، ما يمس منطق الـ tools.

**Dashboard**
- في الـ thread: زر **"تولّى المحادثة"** (يوقف البوت)، حقل كتابة رد، زر **"رجّع للبوت"**.
- مؤشر بصري إذا المحادثة تحت تدخّل بشري.

---

## المرحلة 3 — إدارة الطلبات + خيارات الأصناف + التحليلات

**أ. إدارة الطلبات + إشعار الزبون**
- في `OrdersTab`: dropdown لتغيير حالة الطلب (pending → preparing → on_the_way → delivered → cancelled).
- Trigger في DB: عند تغيير `orders.status`، استدعاء edge function `notify-order-status` تدز رسالة للزبون على نفس قناته:
  - preparing: "طلبك قيد التحضير 👨‍🍳"
  - on_the_way: "طلبك بالطريق 🛵"
  - delivered: "تم التسليم. صحتين! 🙏"

**ب. خيارات الأصناف (variants/extras)**
- العمود `options jsonb` موجود في `menu_items`. هيكل مقترح:
  ```json
  [
    {"name":"الحجم","type":"single","required":true,"choices":[{"label":"عادي","price":0},{"label":"كبير","price":1000}]},
    {"name":"إضافات","type":"multi","choices":[{"label":"جبن","price":500},{"label":"بطاطا","price":750}]}
  ]
  ```
- في Dashboard: محرر options لكل صنف.
- في `agent-run`: tool جديدة `get_item_options(menu_item_id)` يستدعيها الوكيل لو الصنف الو options قبل ما يضيفه للسلة. ما أمس `add_to_cart` الموجودة، بس أضيف parameter اختياري `selected_options` يتخزن مع الـ cart item ويتحسب بالـ price.

**ج. تحليلات و KPIs**
- Edge function `analytics-summary` — رجع: عدد المحادثات/الطلبات اليوم/الأسبوع/الشهر، معدل التحويل (محادثات أنتجت طلبات)، AOV، top 5 أصناف مبيعاً، توزيع الطلبات بالساعات، توزيع القنوات.
- تبويب جديد **التحليلات** في Dashboard مع كروت أرقام + chart بسيط (recharts).

---

## المرحلة 4 — Landing + Onboarding + Paddle

**أ. صفحة هبوط (`/` index route)**
- استبدال الصفحة الحالية بـ landing عربي: hero، 3-4 features، أسعار، شهادات، CTA. SEO meta كاملة.
- لوحة التحكم تنتقل لـ `/dashboard` (الحالة الحالية).

**ب. Onboarding 3 خطوات** (`/onboarding`)
- خطوة 1: اسم المطعم + اللغة + العملة.
- خطوة 2: رفع منيو (CSV/Excel parse في الفرونت أو إدخال يدوي سريع).
- خطوة 3: ربط قناة (يختار Telegram/WhatsApp ويتبع التعليمات).
- بعد الإكمال → `/dashboard`.

**ج. Paddle**
- استخدام `enable_paddle_payments` (مش `enable_stripe` لأنه SaaS رقمي عالمي).
- جدول `subscriptions` + جدول `plans` (Free/Pro/Business مع limits).
- middleware في `agent-run`: تحقق من الحد الشهري قبل الرد. إذا تجاوز → الوكيل يعتذر للزبون ويرسل تنبيه للمالك.
- صفحة `/billing` للترقية وعرض الاستخدام.

**د. إشعارات المالك (bonus)**
- عند طلب جديد، Telegram message للمالك (يدخل chat_id الشخصي في الإعدادات).

---

## الترتيب المقترح للتنفيذ

أوصي نبدأ بـ **المرحلة 2** (Inbox تفاعلي) أولاً لأنها:
- أصغر تغيير
- ما تحتاج توكنات خارجية
- تنطي قيمة فورية (تتدخل لو البوت غلط)
- ما تمس الوكيل عملياً (سطرين فقط)

ثم المرحلة 1 (قنوات)، ثم 3، ثم 4.

```text
المرحلة 2  ──►  المرحلة 1  ──►  المرحلة 3  ──►  المرحلة 4
(يومين)        (3-4 أيام)     (3 أيام)        (4-5 أيام)
inbox          channels       ops+analytics   landing+billing
```

---

## شنو رأيك؟

- نمشي بالترتيب اللي اقترحته (2 → 1 → 3 → 4)؟
- أو تحب نبدأ بمرحلة معينة بالأول؟
- أو نضغط مرحلتين سوا بنفس الجلسة؟

