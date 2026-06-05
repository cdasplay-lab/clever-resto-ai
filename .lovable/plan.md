## الهدف
الوكيل يفهم الزبون حتى لو كتب الصنف بلهجة عراقية، بخطأ إملائي، باختصار، أو بكلمة شعبية.

## الطبقات الأربع

### 1) Normalizer نصي (edge function)
helper جديد `normalizeArabic(text)` بـ`agent-run/index.ts` يطبّع النص قبل أي بحث:
- يشيل التشكيل (الفتحة، الكسرة، الضمة، الشدة، السكون)
- يوحّد الألف: أ/إ/آ/ٱ → ا
- يوحّد الياء: ى → ي
- يوحّد التاء: ة → ه (للمطابقة فقط، لا يغيّر النص الأصلي)
- يشيل التطويل (ـ) وتكرار الحروف ("بيييتزا" → "بيتزا")
- يخلي الأرقام والمسافات نظيفة
- lowercase للإنكليزي ("Pizza" = "pizza")

يطبّق على: النص الوارد + أسماء الأصناف + الـaliases قبل المقارنة.

### 2) Migration: pg_trgm + search_aliases + جدول unmatched

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE menu_items 
  ADD COLUMN search_aliases text[] NOT NULL DEFAULT '{}';

-- index لتسريع fuzzy matching
CREATE INDEX menu_items_name_trgm_idx 
  ON menu_items USING gin (name gin_trgm_ops);

-- جدول للأسئلة اللي ما لكينا لها صنف
CREATE TABLE unmatched_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  conversation_id uuid,
  query_text text NOT NULL,
  normalized_text text NOT NULL,
  resolved_to_item_id uuid, -- لو حُل لاحقاً
  count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
-- + GRANTs + RLS owners + index على (restaurant_id, normalized_text)
```

دالة بحث جديدة `search_menu_fuzzy(restaurant_id, query_normalized, threshold)` ترجع أعلى التطابقات حسب `similarity()` على الاسم + الـaliases + الـdescription.

### 3) منطق بحث متدرّج في `agent-run`

داخل tool `search_menu` (واللي يستخدمه `add_to_cart` لما الزبون يذكر اسم):

```
1. normalize(query)
2. exact match على name normalized أو aliases normalized → رجّع
3. fuzzy: pg_trgm similarity ≥ 0.4 → رجّع أعلى 3
4. لو ما لكى شي → AI fallback:
   - مرّر للـAI: query + قائمة [{id, name, category}] للأصناف المتوفرة
   - استخدم google/gemini-3-flash-preview مع tool call
   - يرجع menu_item_id الأقرب دلالياً أو null
5. لو AI رجع null → سجّل بـunmatched_queries (upsert + count++)
   ورد على الزبون "ما لكيت — هل تقصد X أو Y؟" مع أقرب 2 من fuzzy
```

### 4) UI بسيط — Aliases + Unmatched

تبويب جديد بـدashboard أو إضافة على `menu` tab:

**أ. حقل aliases بكل صنف**: input للأسماء البديلة (chips). صاحب المطعم يكتب "تكه, تيكا, تكة" → يصير كلهم يلكطون نفس الصنف.

**ب. قسم "كلمات ما فهمناها"**: جدول من `unmatched_queries` مرتب بـcount تنازلي. كل صف عليه:
- النص اللي كتبه الزبون
- عدد المرات
- زر "اربط بصنف" → dropdown أصناف، يختار → يضيف للـaliases تلقائياً ويعلّم الـrow resolved

## ملفات تتغير

1. **migration** جديد: pg_trgm + search_aliases + unmatched_queries + search_menu_fuzzy()
2. **`supabase/functions/agent-run/index.ts`**:
   - helper `normalizeArabic()`
   - تعديل `search_menu` للمنطق المتدرّج
   - AI fallback call
   - تسجيل unmatched
3. **`src/components/menu-tab.tsx`** (أو الموجود): حقل aliases على كل صنف
4. **`src/components/menu-tab.tsx`** أو tab جديد `unmatched-tab.tsx`: قائمة الكلمات + ربط

## نقاط مهمة

- النصوص الأصلية تبقى كما هي بالـDB؛ التطبيع فقط للمقارنة (للـsearch_aliases نخزن المُطبّع مسبقاً للسرعة).
- threshold = 0.4 (متوازن: ما يلكط ضوضاء، ويلكط الأخطاء الشائعة).
- AI fallback محدود بـ20 صنف max بالـprompt (تكلفة + سرعة).
- نشر `agent-run` بعد التعديل.

## النتيجة
- "بيتزه مارغريتا" → يلكط "بيتزا مارغريتا" (fuzzy)
- "تكه" → يلكط "تكة دجاج" (alias)
- "اكلة شعبية" → AI يقترح "قوزي" (دلالي)
- "بييييتزا" → يلكط "بيتزا" (normalizer)
- اللي ما ينحل → يظهر لصاحب المطعم ليربطه بضغطة
