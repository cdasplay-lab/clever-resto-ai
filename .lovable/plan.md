# متابعة الطلب (Order Tracking) — المرحلة الأولى، النقطة الأولى فقط

## الهدف
لما الزبون يأكد طلبه، البوت يعطيه ETA واضح، ويخبره تلقائياً بكل تغيير حالة (تأكيد → تحضير → بالطريق → تم التسليم)، ويرد على سؤاله "وين طلبي؟" بمعلومة دقيقة بدون تدخل بشري.

## السلوك المطلوب

### 1. عند تأكيد الطلب (submit_order ناجح)
- البوت يحسب ETA = `branch.current_prep_minutes` + `delivery_zone.eta_minutes` (لو ما متوفر، يستخدم default 45 دقيقة).
- يرسل للزبون: "✅ تم استلام طلبك #1234. التوصيل خلال ~45 دقيقة. راح نخبرك بكل خطوة 🌹"
- يحفظ `eta_minutes` و `confirmed_at` بـ `orders.meta`.

### 2. عند تغيير الحالة من الداشبورد
الـ edge function `notify-order-status` موجود أصلاً ويبعث رسائل، بس ناقصه:
- ETA محدّث مع كل تغيير ("تحضير: جاهز خلال 20 دقيقة"، "بالطريق: يوصلك خلال 15 دقيقة").
- وقت التسليم الفعلي وقت `completed` ("تم التسليم 🙏 شكراً، نتمنى نشوفك مرة ثانية").
- معالجة `delayed` (حالة جديدة) — لما يتأخر، البوت يبعث اعتذار + ETA جديد.

### 3. لما الزبون يسأل "وين طلبي؟"
- short-circuit بـ `agent-run`: لو الرسالة تحتوي "وين طلبي"، "طلبي شصاير"، "تأخر"، "where is my order"...
- يجيب آخر طلب للزبون من نفس الـ conversation (آخر 6 ساعات).
- يرد بحسب الحالة الحالية:
  - `pending/confirmed`: "طلبك مستلم وراح يبدي التحضير قريب، ETA ~X دقيقة"
  - `preparing`: "طلبك بالتحضير 👨‍🍳، جاهز خلال ~X دقيقة"
  - `out_for_delivery`: "طلبك بالطريق إليك 🛵، يوصلك خلال ~X دقيقة"
  - `completed`: "طلبك تسلّم قبل شوية، لو في مشكلة كلّي بصراحة 🌹"
  - `cancelled`: "طلبك ملغي، تحب نسوي طلب جديد؟"
- لو الوقت تجاوز ETA بـ 10 دقائق ولسا ما `completed`: يضيف "إذا تأخر زيادة راح أراجع المطبخ وأرد عليك خلال دقائق" + يسجل تنبيه للمدير.

### 4. تنبيه التأخير التلقائي
- cron كل 5 دقائق (pg_cron → `/api/public/check-delays`):
  - يجيب الطلبات `status IN (confirmed, preparing, out_for_delivery)` اللي تجاوزت ETA + 15 دقيقة.
  - يبعث للزبون: "نعتذر، طلبك يحتاج وقت إضافي. راح يوصلك خلال ~X دقيقة 🙏"
  - يبعث للمدير على Telegram: "⚠️ طلب #1234 متأخر — مرّ عليه X دقيقة"
  - يحط `meta.delay_notified = true` حتى ما يتكرر.

## التغييرات التقنية

### قاعدة البيانات (migration)
- إضافة `meta jsonb DEFAULT '{}'` لجدول `orders` (لتخزين eta_minutes, confirmed_at, delay_notified, etc.).
- إضافة قيمة `'delayed'` للـ enum `order_status` (اختياري — أو نستخدم meta.is_delayed).

### Edge functions
- **`agent-run/index.ts`**: 
  - بعد `submit_order` ناجح (~سطر 739) → احسب ETA واحفظ بـ meta + أضف للرد رسالة الـ ETA.
  - short-circuits (~سطر 1308) → كشف "وين طلبي" والرد من DB.
- **`notify-order-status/index.ts`**: 
  - حدّث `STATUS_LABELS` لتشمل ETA ديناميكي.
- **جديد: `check-delays/index.ts`** (مع server route عام `/api/public/check-delays`):
  - يفحص الطلبات المتأخرة + يبعث تنبيهات للزبون والمدير.
- **cron job**: pg_cron يستدعي endpoint كل 5 دقائق.

### الملفات المتأثرة
- `supabase/functions/agent-run/index.ts` (نقطتين)
- `supabase/functions/notify-order-status/index.ts`
- `supabase/functions/check-delays/index.ts` (جديد) — أو نخليها server route بـ TanStack تحت `src/routes/api/public/check-delays.ts`
- migration لإضافة `orders.meta` و cron job

## أسئلة مهمة قبل التنفيذ

1. **default ETA**: لو الفرع ما عنده `current_prep_minutes` ولا منطقة التوصيل عندها `eta_minutes`، نستخدم كم دقيقة افتراضي؟ (اقتراحي: 45)
2. **حد التأخير قبل التنبيه التلقائي**: 10 دقائق بعد ETA؟ 15؟ 20؟
3. **تنبيه المدير عند التأخير**: على Telegram (`owner_telegram_chat_id`)؟ أو على branch chat (`branches.telegram_chat_id`)؟
4. **حالة "delayed"**: نضيفها للـ enum أو نكتفي بـ `meta.is_delayed`؟

تأكيد + جواب الأسئلة وأبدي بالتنفيذ.
