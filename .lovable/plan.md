# خطة: AI Agent مال المطاعم — يأخذ طلبات بدون "تخبيص"

## الفكرة الأساسية
نبني **Agent مستقل** (Headless) يشتغل على Lovable Cloud + Lovable AI Gateway، يتعامل مع محادثات الزباين ويحول كلامهم إلى **طلب رسمي منظم**. منصتك الحالية تتصل بيه عبر **REST API + Webhooks**. نبدأ بـ Telegram، ونفس الـ core نضيف عليه Meta وTikTok لاحقاً كـ adapters.

## ليش الإصدارات السابقة كانت "تتخبيص" — وشلون نمنعها
السبب الشائع: الـ AI يخمن (يهلوس) أصناف وأسعار، أو ينسى السياق، أو ما عنده أدوات حقيقية يستعملها. الحل:

1. **Tool-calling إجباري** — الـ Agent ما يكدر "يخترع" صنف؛ لازم يستدعي `search_menu` و`create_order` كأدوات بـ JSON Schema صارم.
2. **Grounding بالمنيو الحقيقي** — كل رد يعتمد على بيانات قاعدة البيانات (RAG على المنيو + embeddings).
3. **State machine للطلب** — مراحل واضحة: `greeting → collecting_items → address → confirm → submitted`. ما يكدر يقفز.
4. **Confirmation gate** — قبل ما يحفظ الطلب، يعرض ملخص ويطلب تأكيد صريح.
5. **Confidence threshold** — إذا غير متأكد → يسأل أو يحول للموظف (handoff).
6. **Idempotency + Memory** — كل محادثة لها `conversation_id`، والرسائل محفوظة كاملة وتنرسل للنموذج بكل طلب.
7. **Guardrails** — system prompt مقفل، ما يتكلم بمواضيع خارج المطعم، ما يخمن أسعار.

## المعمارية

```text
┌─────────────┐    webhook    ┌──────────────────────┐
│  Telegram   │ ────────────▶ │  Edge Function:      │
│  (لاحقاً     │               │  channel-webhook     │
│  Meta/TikTok)│              └──────────┬───────────┘
└─────────────┘                          │
                                         ▼
                              ┌──────────────────────┐
                              │  Agent Core          │
                              │  (Lovable AI Gateway)│
                              │  - tools             │
                              │  - state machine     │
                              │  - menu RAG          │
                              └──────────┬───────────┘
                                         │
                       ┌─────────────────┼─────────────────┐
                       ▼                 ▼                 ▼
                ┌───────────┐    ┌───────────┐     ┌──────────────┐
                │ Postgres  │    │ Orders    │     │ Your SaaS    │
                │ (menu,    │    │ webhook   │────▶│ Platform     │
                │ convos,   │    │ outbound  │     │ (REST API)   │
                │ orders)   │    └───────────┘     └──────────────┘
                └───────────┘
```

## قاعدة البيانات (Lovable Cloud)
- `restaurants` — كل مطعم وإعداداته (لهجة الرد، ساعات العمل، منطقة التوصيل، webhook_url لمنصتك).
- `menu_items` — أصناف + سعر + توفر + `embedding` للبحث الدلالي.
- `conversations` — `id, restaurant_id, channel, customer_handle, state, context_json`.
- `messages` — كل الرسائل (in/out) لكل محادثة.
- `orders` — الطلبات المُنشأة بصيغة منظمة + `status`.
- `agent_logs` — كل استدعاء أداة ونتيجته (للـ debugging).
- `api_keys` — مفاتيح لمنصتك تتصل بالـ Agent API.

## Edge Functions
1. `telegram-webhook` — يستقبل رسائل Telegram، يحفظها، ويشغل Agent.
2. `agent-run` — قلب الـ Agent: يبني الـ messages، يستدعي Gemini/GPT مع tools، ينفذ الأدوات بحلقة، يرجع الرد.
3. `menu-embed` — يولد embeddings للمنيو عند الإضافة/التعديل.
4. `orders-dispatch` — يرسل الطلب المؤكد إلى webhook منصتك (مع retry).
5. `platform-api` — REST endpoints لمنصتك: ضبط المنيو، جلب المحادثات، إعدادات المطعم.

## أدوات الـ Agent (Tool-calling)
- `search_menu(query)` — بحث دلالي بالمنيو.
- `check_availability(item_id)` — توفر الصنف الآن.
- `add_to_cart(item_id, qty, notes)` — يضيف للسلة الحالية.
- `get_cart_summary()` — ملخص + سعر إجمالي.
- `set_delivery_info(address, phone, time)` — مع فحص منطقة التوصيل.
- `submit_order()` — يحفظ الطلب نهائياً (يتطلب تأكيد العميل).
- `handoff_to_human(reason)` — يحول للموظف.

## اختيار النموذج
- **افتراضي**: `google/gemini-3-flash-preview` — سريع، رخيص، ممتاز بالعربي وبالـ tool-calling.
- **fallback للحالات المعقدة**: `openai/gpt-5.4` مع reasoning effort = medium.
- نقدر نضيف لاحقاً نموذج للصور (لو الزبون يرسل صورة منيو/منتج).

## API للربط مع منصتك
- `POST /platform-api/restaurants` — إنشاء/تحديث مطعم.
- `POST /platform-api/menu` — رفع منيو (bulk).
- `GET /platform-api/conversations` — قراءة المحادثات.
- `GET /platform-api/orders` — الطلبات الجديدة.
- `POST /platform-api/webhook-config` — تسجيل webhook منصتك لاستقبال الطلبات.
- مصادقة: API key بهيدر `X-API-Key`.

## خطة التسليم
1. تفعيل Lovable Cloud + Lovable AI + ربط Telegram connector.
2. إنشاء جداول قاعدة البيانات + RLS + grants.
3. Edge function لتوليد embeddings للمنيو.
4. Edge function `agent-run` بكل الأدوات + state machine.
5. `telegram-webhook` لاستقبال الرسائل.
6. `orders-dispatch` لإرسال الطلبات لمنصتك.
7. `platform-api` للربط مع منصتك الحالية.
8. لوحة تحكم بسيطة (اختياري لاحقاً) لمراقبة المحادثات والـ agent logs.
9. اختبار end-to-end من Telegram → طلب → webhook منصتك.

## ملاحظات تقنية
- كل رسالة وكل tool call تنحفظ بـ `agent_logs` — هذا أهم شي للديباغ.
- Webhook منصتك يستلم الطلب بصيغة JSON ثابتة (نوثقها).
- ما نخزن مفاتيح Telegram يدوياً — نستخدم Telegram connector.
- Meta وTikTok نضيفهم كـ adapters جدد على نفس `agent-run` بدون إعادة كتابة المنطق.

هل تمشي بهذي الخطة؟ بعد موافقتك أبدأ بالتنفيذ خطوة خطوة.
