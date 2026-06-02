# إصلاح: البوت يسأل عن اسم الزبون قبل تأكيد الطلب

## المشكلة
- أداة `set_delivery_info` تطلب فقط `address` و`phone` — لا تطلب الاسم.
- عند `submit_order` يُحفظ `customer_name: conv.customer_name` لكن هذا الحقل يبقى `null` لأن لا أحد يملأه أثناء المحادثة.
- برومبت النظام لا يُلزم البوت بسؤال الاسم قبل `preview_order`.

## التغييرات (ملف واحد: `supabase/functions/agent-run/index.ts`)

1. **schema الأداة `set_delivery_info`**: إضافة حقل `customer_name` (string, مطلوب).
2. **handler الأداة `set_delivery_info`**: حفظ الاسم في `conversations.customer_name` + تحديث `conv.customer_name` بالذاكرة.
3. **`preview_order`**: 
   - رفض المعاينة لو `conv.customer_name` فاضي → رسالة: "اطلب اسم الزبون أولاً عبر set_delivery_info".
   - إضافة سطر "👤 الاسم: …" إلى نص الملخّص.
4. **برومبت النظام (قاعدة #2)**: 
   - "قبل preview_order لازم تجمع: **الاسم** + العنوان + الهاتف (+الفرع لو متعدد)."
   - "إذا recall_customer رجّع اسم، أكّد عليه فقط ولا تعيد السؤال: 'نأكد الطلب باسم (فلان)؟'"

## ملاحظات تقنية
- لا حاجة لمايغريشن — العمود `conversations.customer_name` موجود.
- لا تغيير في الواجهة (frontend).
- بعد النشر، الطلبات الجديدة ستحتوي `customer_name` معبّأ، ويظهر في تذكرة الإرسال للفرع.
