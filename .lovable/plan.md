## الهدف
نضيف موقع المطعم (رابط Google Maps + إحداثيات) للمطعم الرئيسي ولكل فرع، ونخلي البوت يدزه للزبون عند الحاجة، ويطلب موقع الزبون عند التوصيل.

## 1. قاعدة البيانات (migration)
نضيف على جدول `restaurants` وجدول `branches`:
- `google_maps_url` (text) — الرابط اللي يلصقه صاحب المطعم
- `latitude` (numeric) — مستخرج تلقائياً من الرابط
- `longitude` (numeric) — مستخرج تلقائياً من الرابط

نضيف على جدول `conversations` (داخل `delivery` jsonb الموجود):
- نخزن `customer_location: { lat, lng, address }` لما الزبون يدز موقعه

ما نحتاج جداول جديدة.

## 2. لوحة التحكم (UI)

### تبويب "الإعدادات" (المطعم):
- خانة جديدة: **"موقع المطعم على الخريطة"**
- Input واحد يلصق فيه رابط Google Maps (مثل `https://maps.google.com/?q=33.31,44.36` أو `https://maps.app.goo.gl/...`)
- زر "تحقق" يستخرج الإحداثيات ويعرض preview صغير (نص "📍 33.31, 44.36")
- لو الرابط مختصر (`maps.app.goo.gl`) — نطلب من المستخدم يفتحه ويلصق الرابط الكامل، أو نوضح إنه يفتح الرابط بالمتصفح ويرجع ينسخه

### تبويب "الفروع":
- نفس الخانة لكل فرع بشكل منفصل (داخل dialog تعديل الفرع)

### استخراج الإحداثيات (frontend helper):
دالة `parseMapsUrl(url)` تتعامل مع:
- `?q=lat,lng` أو `?ll=lat,lng`
- `/@lat,lng,zoom`
- `/place/.../@lat,lng,...`
- إذا ما طلع شي → خطأ واضح: "ما كدرنا نستخرج الإحداثيات، افتح الرابط بـ Google Maps واختر Share → نسخ الرابط"

## 3. البوت (`agent-run/index.ts`)

### tool جديد: `send_restaurant_location`
- يجيب موقع الفرع (لو محدد) أو موقع المطعم الرئيسي
- يدز للزبون رسالة فيها:
  - رابط Google Maps
  - إحداثيات (للعرض)
  - عبر Telegram: يدز `sendLocation` API (latitude/longitude) — يطلع كخريطة حقيقية
  - عبر WhatsApp/Instagram/Facebook: يدز الرابط نصاً

### tool جديد: `request_customer_location`
- يطلب من الزبون موقعه
- Telegram: يدز ReplyKeyboard فيه زر "📍 شارك موقعك" (request_location: true)
- باقي القنوات: رسالة نصية "دزلنا موقعك على Google Maps أو اكتب الشارع والمنطقة"

### استقبال موقع الزبون (`telegram-webhook/index.ts`):
- لو الرسالة فيها `location` (Telegram يدزها كـ object فيها lat/lng):
  - نخزنها بـ `conversations.delivery.customer_location`
  - نمرر للـ AI كنص: "الزبون شارك موقعه: lat,lng → https://maps.google.com/?q=lat,lng"

### الـ system prompt:
نضيف توجيهات للـ AI:
- "إذا الزبون سأل وين المطعم/الفرع → استدعِ `send_restaurant_location`"
- "إذا طلب توصيل وما عندنا موقعه → استدعِ `request_customer_location`"
- "إذا الزبون كتب اسم شارع/منطقة فقط → خزنه بالطلب كـ delivery_address"

## 4. عرض موقع الزبون بالطلبات
بتبويب "الطلبات" → عند فتح الطلب: لو فيه `customer_location` نعرض زر "📍 افتح بالخريطة" يفتح `https://maps.google.com/?q=lat,lng`.

## التقنيات
- **لا نحتاج Google Maps connector** — نستعمل الروابط والإحداثيات فقط (الـ parsing نص بسيط، والـ Telegram sendLocation مجاني)
- كل التغييرات على ملفات موجودة + migration واحد
- لو لاحقاً تريد خريطة تفاعلية لاختيار الموقع، نضيف Google Maps connector بمرحلة ثانية

## الملفات اللي راح تتغير
- migration جديد (إضافة الأعمدة)
- `src/components/dashboard-page.tsx` (خانة موقع المطعم بالإعدادات)
- `src/components/branches-tab.tsx` (خانة موقع الفرع)
- `supabase/functions/agent-run/index.ts` (الـ tools الجديدة + system prompt)
- `supabase/functions/telegram-webhook/index.ts` (التقاط location من Telegram)
- `src/integrations/supabase/types.ts` (تلقائياً بعد الـ migration)
