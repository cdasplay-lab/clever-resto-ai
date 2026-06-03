## Sprint 4 — أهم الأشياء المتبقية لجودة "موظف حقيقي" + تشغيل آمن

ركّزت على البنود اللي بقت من خرائط Sprint 1-3 وعندها أعلى أثر على تجربة الزبون والمالك. كلها صغيرة ومركّزة — مو إعادة كتابة.

### 1) حقن ذاكرة الزبون في كل محادثة (Customer Memory Injection)
المشكلة: جدول `customer_memory` موجود ويُكتب فيه، بس الـ system prompt ما يستفيد منه. الزبون اللي طلب 10 مرات يحس البوت لقاه أول مرة.

- في بداية كل run داخل `agent-run/index.ts`، نسحب صف `customer_memory` المطابق لـ (restaurant_id, channel, customer_handle).
- نضيف كتلة قصيرة (≤6 أسطر) للـ system prompt: اسم، آخر عنوان/هاتف، عدد الطلبات، LTV، آخر تفضيلات (`auto_preferences` + `preferences` نص حر).
- قاعدة P11 جديدة: "استخدم العنوان/الهاتف المحفوظ افتراضياً بدون ما تسأل، لكن اعرضه للتأكيد بجملة واحدة قبل submit_order".
- نُحدّث `customer_memory` بعد submit_order ناجح (total_orders++، lifetime_value+=total، last_order_at، last_phone، last_address).

### 2) استئناف البوت بعد handoff (Resume UI + Auto-resume)
المشكلة: لما يصير handoff، `is_bot_paused=true` يبقى للأبد. المالك ما عنده زر يرجّع البوت.

- في `src/components/bot-health-tab.tsx` (أو tab المحادثات إذا أنسب): جدول محادثات `is_bot_paused=true` مع زر **"استئناف البوت"** يعمل UPDATE على `conversations`.
- Auto-resume اختياري: إذا مضى > 24 ساعة بدون رد من موظف، البوت يرجع تلقائياً (cron خفيف عبر `scheduled-dispatch`).
- رسالة ترحيب قصيرة للزبون عند الاستئناف: "رجعنا لخدمتك 👋".

### 3) تنبيه فوري للمالك على Telegram عند handoff/طلب جديد
المشكلة: Sprint 1 ذكر "تنبيه المالك" لكن حالياً الإشعار يروح لـ branch chat فقط. لو المالك مو بشات الفرع → ضايع.

- حقل جديد على `restaurants`: `owner_telegram_chat_id` (TEXT, nullable) + إدخاله في صفحة الإعدادات.
- في `agent-run`: عند `handoff_to_human` أو order ناجح، نرسل ملخص قصير لـ owner_telegram_chat_id (إذا موجود) بالإضافة لشات الفرع.
- صياغة مختلفة للمالك: "🚨 محادثة تحتاج تدخل" / "✅ طلب جديد #1234 — 18,500 IQD".

### 4) Bad-response flagging + تقرير أسبوعي
المشكلة: ما عنا حلقة تعلّم. ردود سيئة تضيع.

- جدول جديد `bad_responses` (restaurant_id, conversation_id, message_id, reason TEXT, created_at، الـ snapshot من آخر 6 رسائل في `context_json`).
- في `bot-health-tab`: عرض آخر 50 محادثة + زر 👎 على رد البوت يفتح dialog فيه أسباب (هلوسة/سعر غلط/لهجة/معلومة خاطئة/أخرى) + ملاحظة.
- View `weekly_bad_response_summary` يجمع top 10 أنماط للأسبوع الأخير.

### 5) 86-list سريع للأصناف (UI toggle)
المشكلة: المنطق موجود (`is_available` يُفحص في submit)، بس المالك يحتاج يدخل لصفحة المنيو ويعدّل كل صنف. تحت الضغط = إحراج.

- في `bot-health-tab` أو tab منفصل صغير: قائمة أصناف اليوم مع Switch سريع لكل صنف (`is_available`). تحديث فوري عبر Supabase realtime.
- اختصار "نفد كل شي تحت category=X" زر واحد.

### 6) Owner-facing readiness gate
المشكلة: Sprint 3 أضاف `get_restaurant_readiness` RPC، بس ما في UI يستخدمها ولا فيه gate.

- بانر في dashboard يعرض Score + checklist. لو < 60: تحذير "البوت قد يعطي ردود ضعيفة، أكمل الإعدادات".
- (لا نوقف البوت تلقائياً — قرار المالك.)

---

## الملفات المتأثرة

**Migrations:**
- إضافة `restaurants.owner_telegram_chat_id` (TEXT).
- جدول `bad_responses` (id, restaurant_id, conversation_id, message_id, reason, note, context_json, created_at) + RLS owners-only + GRANTs.
- View `weekly_bad_response_summary` (read-only للمالك).

**Edge functions:**
- `supabase/functions/agent-run/index.ts`: تحميل + حقن `customer_memory`، تحديثه بعد submit_order ناجح، إرسال إشعار للمالك في handoff + submit_order، قاعدة P11 في system prompt.
- `supabase/functions/scheduled-dispatch/index.ts`: فقرة auto-resume للمحادثات الميتة > 24h.

**Frontend:**
- `src/components/bot-health-tab.tsx`: قسم "محادثات متوقفة" + زر استئناف، قسم "ردود سيئة" مع dialog، قسم 86-list switches، بانر readiness.
- `src/routes/dashboard.tsx`: حقل `owner_telegram_chat_id` في الإعدادات.

**Tests (`supabase/functions/__tests__/regression.test.ts`) — إضافة 4 اختبارات:**
- 17: ذاكرة الزبون تُحقن بشكل صحيح (≤ 6 أسطر، تتجاهل الفارغ).
- 18: تحديث customer_memory بعد submit_order يجمع الإحصاء صحيح.
- 19: auto-resume يستهدف المحادثات > 24h فقط ولا يلمس النشطة.
- 20: bad_response context snapshot يأخذ آخر 6 رسائل بالضبط.

---

## ما هو خارج النطاق هنا (يبقى للاحقاً)

- Queue/Worker (يحتاج بنية تحتية إضافية — Sprint 5).
- Model tiering و circuit breaker (Sprint 5).
- Golden conversations + eval harness (Sprint 5).
- PII redaction في logs (Sprint 5، يحتاج policy decision).

---

أبدأ التنفيذ على هذا الترتيب: (1) → (3) → (5) → (2) → (4) → (6). كل بند معزول ويمكن مراجعته/التراجع عنه لحاله.