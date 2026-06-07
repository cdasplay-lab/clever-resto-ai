# تحسين الموبايل + الأداء

## التشخيص (من فحص الكود)

**سبب البطء الرئيسي:**
1. `dashboard-page.tsx` = **1726 سطر**، كل التبويبات الـ14 (Menu, Branches, Orders, Conversations, Channels, Analytics, Subscription, Health, Customers, Social, Marketing, Combos, Complaints, Settings) تتحمّل كلها مع أول render حتى لو الزبون فاتح تبويب واحد فقط.
2. **14 TabsTrigger بصف واحد** على الموبايل = يطلعون خارج الشاشة بدون تمرير أفقي → الزبون ما يقدر يوصل لنصفهم.
3. ما كو **lazy loading** للتبويبات → كل state + queries تشتغل مرة وحدة → re-renders كبيرة على كل تغيير.
4. الـ landing (`index.tsx` 447 سطر) ممكن يحتوي صور غير محسّنة + ما عنده preload للـ LCP.

---

## الخطة

### المرحلة 1 — أداء (يحل بطء الأزرار)

**1.1 Lazy-load كل تبويبات الداشبورد**
- تحويل كل `import { XTab } from ...` لـ `lazy(() => import(...))` مع `<Suspense>`.
- التبويب اللي مختار فقط يتحمّل JS مالته.
- النتيجة المتوقعة: bundle الأولي ينقص ~60-70%، الأزرار ترد فوراً.

**1.2 Bottom nav بدلاً من Tabs على الموبايل**
- على `md:` (شاشة < 768px): bottom navigation بـ 5 تبويبات رئيسية (الطلبات، المحادثات، المنيو، التحليلات، المزيد).
- زر "المزيد" يفتح Sheet/Drawer فيه باقي التبويبات.
- على الديسكتوب: نخلي الـ Tabs الحالية بس نضيف `overflow-x-auto` كـ fallback.

**1.3 React optimizations**
- `React.memo` على التبويبات الثقيلة (Analytics, Customers, Marketing).
- `useMemo` للـ filtered lists بدل recalculate كل render.
- استبدال `useEffect` + `fetch` بـ TanStack Query (الموجود أصلاً) عشان caching.

**1.4 Landing page (index.tsx)**
- صور WebP/AVIF + `loading="lazy"` لكل شي تحت الـ fold.
- `<link rel="preload">` للـ LCP image في `head()`.
- إزالة أي JS غير ضروري من الـ critical path.

---

### المرحلة 2 — UX موبايل

**2.1 Touch targets**
- كل الأزرار: `min-h-11 min-w-11` (44px iOS HIG).
- زيادة padding على inputs (`h-12` بدل `h-10` على الموبايل).
- spacing بين العناصر التفاعلية ≥ 8px.

**2.2 الجداول → Cards على الموبايل**
- جدول الطلبات، الزبائن، الشكاوى: على < md تتحوّل لـ stacked cards (الموبايل يكره الـ horizontal scroll).
- زر "تفاصيل" يفتح Sheet من الأسفل بدل dialog كامل.

**2.3 Forms**
- inputs بعرض كامل على الموبايل.
- زر الـ submit sticky في الأسفل (لا يضيع تحت الـ keyboard).
- `inputMode` صح لكل input (tel, email, numeric).

**2.4 Header موبايل**
- اسم المطعم + avatar فقط، الباقي يدخل drawer.
- ThemeToggle + LogOut بداخل القائمة.

---

### المرحلة 3 — تحسينات شاملة

- إضافة `viewport-fit=cover` + safe-area-insets للـ iOS notch.
- منع double-tap zoom على الأزرار: `touch-action: manipulation`.
- skeleton loaders بدل spinners (الإحساس بالسرعة أفضل).
- Service worker بسيط للـ caching (PWA-ready).

---

## ترتيب التنفيذ

1. **lazy-load + memoization** (المرحلة 1.1 + 1.3) — أكبر تأثير على البطء، 30 دقيقة.
2. **Bottom nav موبايل** (1.2) — يحل مشكلة الوصول للتبويبات.
3. **Touch targets + tables→cards** (2.1 + 2.2) — تحسين اللمس والقراءة.
4. **Forms + header موبايل** (2.3 + 2.4).
5. **Landing optimizations** (1.4).
6. **تحسينات نهائية** (المرحلة 3).

---

## الملفات اللي راح تتغيّر
- `src/components/dashboard-page.tsx` (أكبر تغيير — split + lazy)
- `src/components/*-tab.tsx` (memo + responsive cards)
- `src/routes/index.tsx` (landing perf)
- `src/styles.css` (utility classes للموبايل)
- ملف جديد: `src/components/mobile-bottom-nav.tsx`

**موافق نبدأ بالمرحلة 1 (الأداء) لأنها تحل البطء فوراً؟ أو تريد ترتيب مختلف؟**