## Upsell مبني على بيانات الطلبات السابقة (Frequently Bought Together)

### الفكرة
نتعلم من جدول `orders` شنو الزبائن يطلبونه مع بعض. لما الزبون يضيف صنف للسلة، نقترح الصنف الأكثر ارتباطاً به تاريخياً بدل اقتراح عام من الفئة.

### الترتيب بالأولوية داخل `suggest_upsell`
1. **Co-occurrence من orders** (الجديد) — لو طلع نتيجة قوية، نستخدمها.
2. **Manual `upsell_category`** (موجود حالياً).
3. **Inferred category** (سويناه بالخطوة السابقة) — fallback.

### المنطق

**أ. Materialized helper بالـedge function** — ما اكو جدول جديد، نحسب on-the-fly مع cache بسيط:

داخل `runTool` لـ`suggest_upsell`:
- نجيب آخر 200 طلب confirmed/delivered للمطعم خلال آخر 90 يوم.
- نبني خريطة: لكل صنف، شنو الأصناف اللي تكرّرت معاه بنفس الطلب وكم مرة.
- نحسب score: `count(co-occurrence) / count(orders that contain source_item)`.
- نأخذ أعلى 5 أصناف بـscore ≥ 0.2 (يعني 20%+ من طلبات هاي الصنف فيها هذا المقترح).
- نفلتر: مو بالسلة، متوفر، مو نفس الصنف.

**ب. Cache بسيط بالذاكرة** — Edge functions stateless لكن invocation واحد قد يخدم عدة tool calls بنفس الـconversation. نخزن النتيجة بـ`Map<restaurant_id, {data, expiresAt}>` بـmodule scope مع TTL 10 دقائق. لو ضاع cache بين invocations مو مشكلة، الحساب رخيص (200 طلب فقط).

**ج. Threshold للحماية**:
- لو عدد الطلبات < 10، نتجاوز الخطوة 1 ونروح للـ inferred (ما عندنا بيانات كافية).
- لو ما طلع شي بـscore ≥ 0.2، نروح للـ inferred.

### التغييرات في `agent-run/index.ts`

1. **Helper جديد** `getFrequentlyBoughtWith(db, restaurantId, sourceItemId)`:
   - يقرأ من cache أو يحسب من `orders` (`status in ('confirmed','preparing','delivering','delivered')`, `created_at > now - 90d`).
   - يرجع `Array<{ menu_item_id, score, count }>` مرتبة تنازلياً.

2. **داخل `suggest_upsell`** (السطر ~1572):
   - قبل ما نروح للـ `inferUpsellCategory`، نستدعي `getFrequentlyBoughtWith`.
   - لو رجع نتائج، نجيب تفاصيل الأصناف من `menu_items`، نفلتر (متوفر، مو بالسلة، stock OK)، ونرجع أعلى 3.
   - لو ما رجع شي، نكمل بالمنطق الموجود (manual ثم inferred).

3. **note للوكيل**: نضيف إشارة لو الاقتراح مبني على بيانات: 
   `"اقتراح شائع مع هذا الصنف — اعرضه بثقة، مثلاً: 'الناس عادة ياخذونه ويا [اسم]، تحب نضيفه؟'"`.

### بدون تغييرات DB
كل الحساب بالـedge function. ما اكو migration.

### النتيجة
- مطاعم عندها بيانات تاريخية → اقتراحاتها دقيقة جداً ومخصصة لكل صنف.
- مطاعم جديدة → ترجع تلقائياً للـ inferred categories (الموجود).
- نشر `agent-run` بعد التعديل.
