# Beta Readiness Checklist — Phase A Complete

## ✅ مكتمل (Done)

### A1 — Location
- [x] `actions[]` في agent loop تنفذ قبل الرد
- [x] `customer_location` يتخزن في conversations.delivery
- [x] الموقع يتخزن أيضاً في `orders.meta.customer_location`
- [x] زر "موقع الزبون" في صفحة الطلبات
- [x] system prompt يعرف متى يستخدم send/request location

### A2 — Reliability
- [x] `retryFetch` مع exponential backoff للـ Telegram + AI Gateway
- [x] Idempotency عبر `processed_updates`
- [x] Fallback من gemini-pro → gemini-flash
- [x] `EdgeRuntime.waitUntil` للرد 200 سريع على Telegram

### A3 — Onboarding Wizard
- [x] 4 خطوات: معلومات → منيو → فرع → بوت

### A4 — Telegram Bot per Restaurant
- [x] `telegram_bot_token` على restaurants
- [x] `telegram-connect` edge function (connect/disconnect/test)
- [x] `telegram-webhook` يدعم routing per-restaurant
- [x] `TelegramConnectCard` بالداشبورد

### A6 — Orders UX
- [x] صوت تنبيه عند طلب جديد (مع toggle)
- [x] زر سريع للحالة التالية
- [x] فتح موقع/عنوان الزبون

### A7 — Admin Subscriptions
- [x] طريقة الدفع + ملاحظات تُسجل بالاشتراك

---

## 📋 Pre-Launch Checklist (قبل الإطلاق على مطعم حقيقي)

### Infrastructure
- [ ] التحقق إن `LOVABLE_API_KEY` صالح ومفعّل
- [ ] إذا فيه legacy Telegram connector: `TELEGRAM_API_KEY` موجود
- [ ] حالة الـ Edge Functions: agent-run, telegram-webhook, telegram-connect مشتغلة

### Per-Restaurant Setup
- [ ] إنشاء الباقة من /admin (Starter/Pro حسب الاتفاق)
- [ ] إدخال `owner_telegram_chat_id` بالداشبورد (للتنبيهات + زر test)
- [ ] رفع المنيو + التأكد من استخراج الأسعار
- [ ] إنشاء فرع واحد على الأقل + رابط Google Maps
- [ ] ربط بوت تيليجرام (BotFather → onboarding step 4)

### Smoke Test (5 دقائق)
- [ ] فتح البوت بتيليجرام → /start → رد ترحيب
- [ ] طلب طبق + إكمال (اسم، هاتف، عنوان)
- [ ] شارك موقع → يظهر بالطلب
- [ ] طلب موقع المطعم → يصل sendLocation
- [ ] تأكيد الطلب → يظهر بالداشبورد + يرن التنبيه
- [ ] ضغط "قبول" → الزبون يستلم إشعار

### Monitoring
- [ ] راجع `agent_logs` (kind=error_fatal) كل يوم بأول أسبوع
- [ ] راقب `usage_counters` — لا تتجاوز حد الباقة
- [ ] فعّل تنبيه manual إذا الحد قارب

---

## 🔜 Phase B (لاحقاً، بعد Beta ناجح)

- WhatsApp / Instagram / Facebook channels
- Landing page + docs عامة
- Stripe/Paddle integration للدفع التلقائي
- i18n (English UI)
- Analytics متقدمة + dashboards
- E2E tests شاملة (A5 المؤجل)
- متعدد اللغات للبوت
