## مرحلة A — جاهزية Beta لمطاعم حقيقية

الهدف: مطعم جديد يقدر يسجل، يربط بوته، يستقبل طلب، البوت يكمل دورة كاملة بدون انهيار، وصاحب المطعم يشوف الطلب ويغير حالته. كل شي عبر Telegram فقط.

---

### A1 — إكمال ميزة الموقع (نكمل اللي بدأناه)
**الملفات**: `agent-run/index.ts`, `telegram-webhook/index.ts`, `dashboard-page.tsx` (تبويب الطلبات).

1. ربط `actions[]` بحلقة الـ agent: بعد كل tool call، نمشي على الـ actions ونفذها (مثل `sendLocation`) قبل ما نرد للزبون.
2. `telegram-webhook`: لو الرسالة فيها `location` → نخزن `delivery.customer_location = {lat,lng}` ونمرر للـ AI كنص واضح.
3. تبويب الطلبات: زر "📍 افتح موقع الزبون" يفتح `maps.google.com/?q=lat,lng` لو متوفر.
4. system prompt: قاعدتين واضحتين متى يستدعي `send_restaurant_location` و `request_customer_location`.

### A2 — Reliability والـ retry (شرط إطلاق)
**الملفات**: `agent-run/index.ts`, `telegram-webhook/index.ts`, `_shared/`, migration صغير.

1. **Idempotency لـ Telegram updates**: استخدام `processed_updates` بجدية — أي update يجي مرتين (Telegram يعيد عند فشل 200) ما يولّد رسالتين.
2. **Retry للـ Telegram API**: wrapper `tgFetch()` فيه exponential backoff (3 محاولات: 0.5s, 2s, 5s) للأخطاء العابرة (5xx, 429, network). 4xx ما نعيد.
3. **Retry للـ AI (Lovable AI)**: نفس wrapper مع احترام `Retry-After` على 429، و fallback من gemini-pro → gemini-flash لو الـ pro فشل مرتين.
4. **Tool call errors**: لو tool رمى exception، نرجع رسالة tool result فيها الخطأ بدل ما نطيح الحلقة كلها، والـ AI يقرر يعتذر أو يعيد محاولة.
5. **حد أقصى للحلقة**: 8 خطوات (موجود؟ نتأكد). لو تجاوز → رد افتراضي "خلي أحول للمشرف" + alert.
6. **Dead-letter logging**: أي فشل نهائي (بعد retries) يكتب صف بـ `agent_logs` بنوع `error_fatal` مع payload كامل، ويدز إشعار Telegram لمالك المطعم (لو فعّال).
7. **Timeout على tools خارجية**: 15 ثانية حد أقصى لكل fetch، ما يخلي function تعلق.
8. **Webhook 200 سريع**: نرد على Telegram 200 خلال ثانية، والمعالجة الفعلية بـ `EdgeRuntime.waitUntil()` — يمنع timeout على Telegram side ويوقف الإعادات.

### A3 — Onboarding للمطعم الجديد
**الملفات**: `routes/dashboard.tsx`, مكوّن جديد `onboarding-wizard.tsx`.

Wizard 4 خطوات تطلع لو `restaurants` للمستخدم فاضي أو ناقص حقول أساسية:
1. اسم المطعم + المدينة + النغمة + العملة.
2. رفع صور المنيو (تستدعي `menu-extract` الموجودة) — مع skip + "أضيف لاحقاً".
3. أول فرع: اسم + عنوان + رابط Google Maps + الهاتف + ساعات افتراضية.
4. ربط Telegram bot (A4) — مع skip.

بعد الإنهاء: redirect للوحة مع toast "أهلاً بيك".

### A4 — ربط Telegram bot الذاتي لكل مطعم
**الملفات**: تبويب جديد "القنوات" داخل الإعدادات، migration صغير، edge function جديدة `telegram-connect`.

1. Migration: `restaurants.telegram_bot_token` (text, encrypted فعلياً بـ pgsodium أو على الأقل غير مقروء بـ RLS — للمالك فقط).
2. UI: حقل "Bot Token" + زر "تثبيت الـ webhook". يلصق التوكن (من BotFather).
3. `telegram-connect` (edge):
   - يستلم token، يستدعي `getMe` للتحقق ويسحب username.
   - يستدعي `setWebhook` على عنوان `telegram-webhook` الحالي مع `secret_token` = hash مشتق من `restaurant_id`.
   - يخزن `telegram_bot_token` و `telegram_bot_username` بالمطعم.
4. `telegram-webhook`: يقرأ `X-Telegram-Bot-Api-Secret-Token`، يستخرج `restaurant_id` منه ويتأكد. الحالي يستخدم secret عمومي — نخليه per-restaurant.
5. زر "اختبر" يدز رسالة لـ `owner_telegram_chat_id` للتأكد إنه يشتغل.

### A5 — اختبار End-to-End مع سيناريو حقيقي
**ملف اختبار**: `supabase/functions/agent-run/e2e_test.ts` (Deno test).

سيناريو واحد كامل (mock للـ Telegram + Lovable AI):
1. زبون يقول "هاي" → بوت يرحب ويسأل شنو يحب.
2. يطلب "بيتزا" → بوت يستدعي `search_menu` ويرجع نتائج.
3. يختار → بوت يضيف للسلة ويعرض المجموع.
4. يطلب توصيل → بوت يستدعي `request_customer_location`.
5. يدز موقع → بوت يحدد الفرع، يحسب التوصيل، يأكد.
6. تأكيد → ينشئ order، يدز للمطبخ.

نشغله بـ `supabase--test_edge_functions` كل ما نغير شي بالـ agent.

### A6 — صفحة الطلبات أحسن للمالك
تحسينات صغيرة بس ضرورية:
1. صوت تنبيه + badge عدد طلبات `pending` (موجود؟ نتأكد).
2. أزرار سريعة: قبول → قيد التحضير → جاهز → بطريق التوصيل → مكتمل (مع إشعار تلقائي للزبون عبر `notify-order-status` الموجود).
3. زر "افتح موقع الزبون" من A1.
4. زر "إيقاف البوت" لهذه المحادثة (موجود `is_bot_paused`) — يبرز ويسهل الوصول.

### A7 — أدمن: تفعيل اشتراك يدوياً
**الملفات**: `routes/admin.tsx`.

1. جدول كل المطاعم + خطتها الحالية + تاريخ الانتهاء.
2. زر "تفعيل/تجديد اشتراك" يفتح dialog: يختار الخطة، المدة، طريقة الدفع (نص حر)، ملاحظات → يدخل بـ `restaurant_subscriptions`.
3. زر "إيقاف" يغير status لـ `suspended`.
4. عرض `usage_counters` بجنب كل مطعم (كم رسالة، كم طلب هذا الشهر).

### A8 — فحص نهائي قبل الإطلاق
checklist يدوي نمشي عليه قبل ما ندعي أول مطعم:
- [ ] RLS مفعّل على كل جدول وعنده policies (نشغّل `supabase--linter`).
- [ ] كل secret المطلوب موجود (`LOVABLE_API_KEY`, الخ).
- [ ] e2e test يمر.
- [ ] صفحة admin محمية بـ `is_platform_admin`.
- [ ] webhook URL مستقر (`project--{id}.lovable.app`) ومثبت.
- [ ] أول مطعم تجريبي (مطعمك أنت) ماشي ليوم كامل بدون أخطاء فادحة بالـ logs.

---

## الترتيب المقترح للتنفيذ
1. A1 + A2 معاً (نفس الملفات تقريباً) — أكبر دفعة.
2. A4 (ربط البوت) — بدون هذا ما نقدر نجرب على مطعم تاني.
3. A3 (onboarding).
4. A6 (تحسين الطلبات).
5. A7 (أدمن).
6. A5 (e2e test) — نكتبه بعد ما يستقر السلوك.
7. A8 — checklist.

## خارج النطاق (مرحلة B لاحقاً)
WhatsApp/Instagram/Facebook، landing، docs، Stripe/Paddle، i18n، تحليلات متقدمة، اختبارات شاملة.

---

**موافق نبدأ بـ A1 + A2 بأول build؟** أو تحب نبدأ بـ A4 (ربط البوت) لأنه يفتح طريق التجريب على مطعمك بأسرع وقت؟
