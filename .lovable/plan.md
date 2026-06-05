## آلية تصعيد الشكاوى

### الموجود حالياً
- جدول `complaints` موجود بالـDB لكن ما اكو شي يكتب فيه ولا يقراه.
- الوكيل عنده `handoff_to_human` بس يستخدمها فقط لما الزبون يطلب موظف صراحة أو تفشل أداة حرجة، وما تفتح سجل شكوى ولا ترسل تنبيه مفصّل.

### الفكرة
نخلّي أي شكوى توصل من الزبون: (1) تنفتح كسجل بجدول `complaints`، (2) توقف البوت تلقائياً، (3) ترسل تنبيه فوري للمدير والفرع، (4) ترد على الزبون رد قصير مطمئن، (5) إذا ضلّت مفتوحة 30 دقيقة يصير تذكير ثاني للمدير.

---

### 1) كشف الشكوى (طبقتين)

**أ. كلمات مفتاحية (deterministic) — تفحص قبل ما يشتغل الـLLM:**
- داخل `agent-run/index.ts` قبل استدعاء الموديل، نمرّر نص الزبون على regex بسيط:
  - عربي: `شكوى|أشتكي|تأخر|متأخر|بارد|ناقص|نسيتوا|غلط|خربان|سيء|قذر|عفن|منتهي|حشرة|ما وصل|ما جاني|راح أبلّغ|نصب|مسروق|مهين`
  - إنجليزي: `complaint|complain|late|cold|missing|wrong order|disgusting|spoiled|never arrived|refund|scam|rude`
- لو طابق، نضيف flag بالـcontext اسمه `auto_complaint_detected=true` ونوعها (late/cold/missing/wrong/quality/rude/other) حسب أول كلمة طابقت.

**ب. أداة `create_complaint` للوكيل:**
- يستدعيها الوكيل لما يحس إنها شكوى حقيقية ما طابقت الكلمات (مثلاً صياغة مهذبة).
- المعاملات: `type` (late|cold|missing|wrong|quality|rude|other)، `note` (تلخيص بكلمتين-ثلاث)، `order_id` (اختياري — آخر طلب من `conv.meta.last_order_id` تلقائياً لو ما مرّر).

كلا الطبقتين تستدعي نفس الـhandler الداخلي `escalateComplaint(...)`.

---

### 2) إجراءات التصعيد (داخل `escalateComplaint`)

1. **إنشاء سجل** بـ`complaints`: `restaurant_id`, `conversation_id`, `order_id`, `type`, `note`, `customer_name`, `customer_handle`, `channel`, `status='open'`.
2. **إيقاف البوت** على المحادثة: `conversations.is_bot_paused=true` و `state='handoff'` و `meta.handoff_reason='complaint:<type>'`.
3. **تنبيه تلغرام** لـ `restaurants.owner_telegram_chat_id` و `branches.telegram_chat_id` (الفرع المرتبط بآخر طلب إن وُجد، وإلا كل الفروع النشطة):
   ```
   🚨 شكوى جديدة — <restaurant_name>
   الزبون: <name> (<channel> @<handle>)
   النوع: <type_ar>
   الطلب: #<short_id> — <total> <currency>   (إن وُجد)
   النص: "<note>"
   افتح المحادثة: <dashboard_url>/dashboard?conv=<id>
   ```
4. **رد تلقائي للزبون** بنفس لغته:
   - ar: "آسفين هواي على اللي صار 🙏 وصلت شكوتك للمسؤول وراح يتواصل وياك خلال دقائق."
   - en: "We're really sorry about this. Your complaint was escalated and a team member will contact you shortly."
5. **سجل تذكير**: نخزن `complaints.updated_at` ونعتمد عليه بـcron.

---

### 3) تذكير بعد 30 دقيقة (pg_cron)

- نضيف route عامة جديدة: `src/routes/api/public/check-complaints.ts`.
- المنطق: تجيب كل `complaints.status='open'` اللي `updated_at < now() - 30 min` ولم يُرسل لها تذكير (`note` يحوي علامة، أو نضيف عمود `last_reminded_at` بـmeta… الأبسط: نستخدم `updated_at` ونحرّكه بعد كل تذكير).
- ترسل تنبيه ثاني لتلغرام المدير: `⏰ شكوى ما تردّيت لها لـ30 دقيقة — افتحها الآن`.
- تحدّث `updated_at=now()` عشان ما يتكرّر إلا بعد 30 دقيقة أخرى.
- pg_cron كل 5 دقائق يضرب الراوت.

---

### 4) لوحة التحكم

**أ. تبويب جديد "الشكاوى" بـ`dashboard.tsx`:**
- جدول/كروت: التاريخ، الزبون، القناة، النوع، النص، رقم الطلب (لينك)، الحالة (open/in_progress/resolved)، أزرار:
  - "افتح المحادثة" (يفتح تبويب المحادثات على conv_id).
  - "علّم قيد المعالجة" / "علّم محلولة" + حقل ملاحظة قصيرة.
- فلتر سريع: الكل / مفتوحة / اليوم.

**ب. شارة على المحادثات:**
- بقائمة المحادثات الحالية، أي محادثة لها شكوى `open` تظهر مع نقطة حمراء 🔴 ونص "شكوى: <type>".

---

### 5) قاعدة جديدة بالبرومبت

تنضاف للقاعدة 9 (التصعيد) بـ`agent-run/index.ts`:
> "إذا اشتكى الزبون من جودة/تأخير/نقص/خطأ بطلبه أو سوء معاملة → استدعِ `create_complaint` فوراً بدل ما تحاول تحلها لحالك. لا تعتذر طويلاً ولا تعد بتعويض. الأداة راح توقف البوت وتحوّل للمدير."

---

### الملفات اللي راح تتعدّل
- `supabase/functions/agent-run/index.ts` — كشف الكلمات، أداة `create_complaint`، `escalateComplaint`، قاعدة برومبت.
- `src/routes/api/public/check-complaints.ts` — جديد، يفحص الشكاوى المتأخرة.
- `src/routes/dashboard.tsx` — تبويب "الشكاوى" + شارة على المحادثات.
- migration: لا تغييرات على جدول `complaints` (الأعمدة كافية). نضيف فقط pg_cron job يستدعي الراوت كل 5 دقائق.

### النتيجة
- أي شكوى = تنبيه فوري + إيقاف بوت + رد مطمئن + متابعة مضمونة بعد 30 دقيقة.
- المدير عنده مكان واحد يشوف كل الشكاوى ويغيّر حالتها.
