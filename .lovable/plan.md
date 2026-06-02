# المرحلة 7 — المخزون اللحظي + الكومبوهات + الـ Upsell الذكي

## الهدف
ثلاث قدرات تخلّي البوت يبيع أكثر ويمنع طلبات أصناف ناقصة:
1. **مخزون لحظي**: المالك يحدد كمية لكل صنف. لما تنفد، البوت يقولها للزبون ويقترح بديل.
2. **كومبوهات (Combos)**: وجبات مجمّعة بسعر خاص (برغر+بطاطا+مشروب = خصم).
3. **Upsell ذكي**: بعد ما الزبون يضيف وجبة، البوت يقترح إضافة (مشروب/حلى) بأسلوب لطيف غير مزعج.

---

## 1) قاعدة البيانات (Migration واحدة)

**`menu_items`** — حقول جديدة (اختيارية):
- `stock_qty` (integer, nullable) — `null` يعني لا محدود، `0` يعني نافد.
- `track_stock` (boolean, default false) — لما true البوت يحترم `stock_qty`.
- `upsell_category` (text, nullable) — مثلاً للبرغر يكون "مشروبات" → البوت يقترح من هذي الفئة.

**`combos`** — جدول جديد:
```
id, restaurant_id, name, description, items jsonb [{menu_item_id, qty}],
price numeric, is_active boolean, image_url, created_at, updated_at
```
RLS: المالك يدير كومبوهاته. GRANTs قياسية.

**دالة `decrement_stock(items jsonb)`** — security definer:
لما يتأكد الطلب، تنقص الكميات ذرّياً وترجع قائمة الأصناف اللي نفدت (لو صار سباق).

---

## 2) `supabase/functions/agent-run/index.ts`

### تعديلات على الأدوات الموجودة
- **`search_menu`**: يرجّع `stock_qty` و`track_stock` ضمن النتيجة. الأصناف اللي `track_stock=true && stock_qty<=0` تُعرض كـ "غير متوفر مؤقتاً" (مع تمييز ظاهر).
- **`add_to_cart`**: قبل الإضافة، لو `track_stock` يفحص: (qty المطلوب + qty الموجود في السلة) ≤ stock_qty. لو لا، يرجّع خطأ واضح.
- **`preview_order`**: يفحص ثاني المخزون ويُسقط الأصناف الناقصة من السلة مع تنبيه.
- **`submit_order`**: بعد الإدخال الناجح، يستدعي `decrement_stock` ذرّياً.

### أدوات جديدة (3)
1. **`show_combos`** — يعرض الكومبوهات النشطة كـ media items (صورة + اسم + سعر + وصف).
2. **`add_combo_to_cart`** — يضيف كل عناصر الكومبو دفعة واحدة بسعر الكومبو (الفرق يتوزّع بنسبة).
3. **`suggest_upsell`** — يستدعى تلقائياً بعد `add_to_cart` لصنف عنده `upsell_category`. يرجّع 2-3 اقتراحات قصيرة (الأرخص أو الأكثر مبيعاً).

### قواعد جديدة في برومبت النظام
- بعد كل `add_to_cart` ناجح لصنف رئيسي، استدعِ `suggest_upsell` واعرض اقتراح واحد لطيف بسطر: "تحب نضيفلك [اسم] بـ [سعر]؟" — مرة واحدة فقط بالمحادثة لكل فئة.
- لو الزبون قال "المنيو" أو "شنو الكومبوهات"، اعرض `show_combos` أولاً.
- لما `add_to_cart` يرجع خطأ مخزون، اعتذر باختصار واقترح أقرب بديل عبر `search_menu`.

---

## 3) الواجهة (Frontend)

**`src/components/menu-tab.tsx`** (الموجود):
- إضافة حقول جديدة لكل صنف: `track_stock` (switch) + `stock_qty` (number) + `upsell_category` (select من الفئات).

**`src/components/combos-tab.tsx`** (جديد):
- CRUD كامل للكومبوهات: اسم، وصف، صورة، اختيار أصناف بكمياتها، سعر الكومبو.
- معاينة للسعر الأصلي vs سعر الكومبو + نسبة الخصم.

**`src/routes/dashboard.tsx`**:
- إضافة tab جديد "كومبوهات" بأيقونة.

---

## 4) ملاحظات تقنية
- المخزون يُنقص فقط عند `submit_order` (مو عند add_to_cart) لتفادي قفل المخزون لزبائن ما أكدوا.
- `decrement_stock` تستخدم `UPDATE ... WHERE stock_qty >= needed` لمنع السلبية.
- الكومبو يُحفظ في `orders.items` كعناصر منفردة مع `combo_id` كميتاداتا، حتى التذكرة تكون واضحة للمطبخ.
- لا تعديل على telegram-webhook (الميديا تشتغل تلقائياً عبر آلية الـ media الموجودة).

---

## ملفات ستتعدّل/تُنشأ
- migration: مخزون + جدول combos + دالة decrement
- `supabase/functions/agent-run/index.ts` (تعديلات أدوات + 3 أدوات جديدة + قواعد)
- `src/components/menu-tab.tsx` (تعديل)
- `src/components/combos-tab.tsx` (جديد)
- `src/routes/dashboard.tsx` (إضافة tab)
