# نظام الباقات الشهرية للمطاعم (Hybrid Plans)

سأبني نظام باقات حقيقي يشتغل من كل النواحي: قاعدة بيانات، تتبّع استهلاك تلقائي، تنفيذ الحدود على البوت، لوحة أدمن للتفعيل اليدوي، وعرض الاستهلاك للمالك.

## 1) قاعدة البيانات (Migration)

**جدول `plans`** (تعريف الباقات — ثابتة):
- `id`, `code` (starter/growth/pro/enterprise), `name_ar`, `price_iqd`
- `max_branches` (int)، `max_ai_replies` (int)، `max_confirmed_orders` (int)
- `features` (jsonb): channels, languages, story_comments, staff_mgmt…
- `is_active`

**جدول `restaurant_subscriptions`** (اشتراك كل مطعم):
- `restaurant_id`, `plan_id`, `status` (active/expired/suspended)
- `period_start`, `period_end` (شهر كامل)
- `activated_by` (user_id أدمن)، `notes`

**جدول `usage_counters`** (عدّاد شهري لكل مطعم):
- `restaurant_id`, `period_start`
- `ai_replies_used`, `confirmed_orders_used`
- يُحدّث تلقائياً عبر triggers/RPC

**جدول `usage_events`** (سجل تفصيلي للتدقيق):
- `restaurant_id`, `kind` (ai_reply/confirmed_order), `created_at`, `ref_id`

**دور أدمن المنصة:**
- إضافة `'platform_admin'` لـ enum `app_role`
- دالة `is_platform_admin(uid)` SECURITY DEFINER
- RLS: المالك يقرأ اشتراكه واستهلاكه فقط؛ الأدمن يدير كل شيء

**Seed**: إدخال الباقات الأربع (Starter 35k, Growth 75k, Pro 150k, Enterprise مخصص).

## 2) منطق فرض الحدود (في البوت — `agent-run`)

قبل كل رد AI:
1. اجلب اشتراك المطعم النشط + استهلاك الشهر الحالي.
2. تحقق:
   - لا اشتراك نشط أو منتهي → **يوقف البوت كلياً** (ما يرد).
   - `ai_replies_used >= max_ai_replies` → يوقف.
   - عدد الفروع النشطة > `max_branches` → يوقف ويحذّر المالك.
3. لو سمح → نفّذ الرد ثم `increment ai_replies_used` + insert في `usage_events`.

عند تأكيد الطلب (`submit_order`):
- تحقق `confirmed_orders_used < max_confirmed_orders`، وإلا ارفض الطلب.
- بعد النجاح: `increment confirmed_orders_used`.

كل هذا عبر دالة Postgres `consume_quota(restaurant_id, kind)` تُرجع `allowed: bool` لتجنّب race conditions.

## 3) لوحة الأدمن (`/admin`)

صفحة محمية لـ `platform_admin` فقط:
- جدول كل المطاعم + باقتها الحالية + استهلاك الشهر + تاريخ انتهاء.
- زر **"تفعيل باقة"**: اختيار الباقة + المدة (شهر افتراضياً) → ينشئ اشتراك جديد ويعيد تصفير العدّاد.
- زر **"إيقاف"** / **"تمديد"**.
- بحث وفلترة.

## 4) واجهة المالك (تبويب جديد "الاشتراك" في `/dashboard`)

- بطاقة الباقة الحالية + تاريخ الانتهاء.
- 3 progress bars: ردود AI / طلبات مؤكدة / فروع — مع الأرقام المتبقية.
- شريط تحذير أحمر لو الباقة منتهية أو الحد وصل.
- جدول الباقات الأربع للعرض ("للترقية تواصل مع الإدارة" — لأن الدفع يدوي).

## 5) ملاحظات تصميمية

- "AI Reply" = أي رد يُرسله البوت للزبون (رسالة مباشرة، رد ستوري، رد تعليق لاحقاً).
- "Confirmed Order" = طلب وصل لحالة `confirmed`/`dispatched`.
- العدّاد يُعاد تلقائياً كل شهر بناءً على `period_start`.
- "شراء رصيد إضافي" — مذكور بالنص لكن سأتركه placeholder الآن (يدوي عبر الأدمن).

## ترتيب التنفيذ

1. Migration (جداول + RPC + RLS + seed + دور platform_admin).
2. تحديث `agent-run` لفرض الحدود وزيادة العدّاد.
3. تبويب "الاشتراك" بلوحة المالك.
4. صفحة `/admin` لإدارة الاشتراكات.
5. اختبار: تفعيل باقة Starter لمطعم → استهلاك يزيد → الوصول للحد → البوت يوقف.

---

**سؤال أخير قبل التنفيذ:** كيف أعرف أي مستخدم هو "أدمن المنصة"؟ هل تعطيني إيميلك وأعيّنه يدوياً في الـ migration، أم تريد جدول `platform_admins` تضيف فيه بنفسك من Lovable Cloud؟
