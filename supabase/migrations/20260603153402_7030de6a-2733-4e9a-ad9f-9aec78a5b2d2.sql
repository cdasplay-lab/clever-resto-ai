
CREATE OR REPLACE FUNCTION public.get_restaurant_readiness(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_r record;
  v_menu_total int;
  v_menu_available int;
  v_menu_with_image int;
  v_branches int;
  v_branches_with_chat int;
  v_zones int;
  v_open_hours_set boolean;
  v_menu_images int;
  v_has_bot boolean;
  v_score int := 0;
  v_checklist jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.restaurants WHERE id = _restaurant_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  IF v_owner <> auth.uid() AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_r FROM public.restaurants WHERE id = _restaurant_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_available = true),
    COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> '')
    INTO v_menu_total, v_menu_available, v_menu_with_image
  FROM public.menu_items WHERE restaurant_id = _restaurant_id;

  SELECT
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(*) FILTER (WHERE is_active = true AND telegram_chat_id IS NOT NULL AND telegram_chat_id <> '')
    INTO v_branches, v_branches_with_chat
  FROM public.branches WHERE restaurant_id = _restaurant_id;

  SELECT COUNT(*) INTO v_zones
  FROM public.delivery_zones WHERE restaurant_id = _restaurant_id AND is_active = true;

  v_open_hours_set := COALESCE(jsonb_typeof(v_r.open_hours) = 'object'
                               AND v_r.open_hours <> '{}'::jsonb, false);
  v_menu_images := COALESCE(array_length(v_r.menu_image_urls, 1), 0);
  v_has_bot := v_r.telegram_bot_username IS NOT NULL AND v_r.telegram_bot_username <> '';

  -- Scoring (weighted, total = 100)
  IF v_menu_available >= 10 THEN v_score := v_score + 25;
  ELSIF v_menu_available >= 3 THEN v_score := v_score + 15;
  ELSIF v_menu_available > 0 THEN v_score := v_score + 5; END IF;

  IF v_menu_with_image >= 5 THEN v_score := v_score + 10;
  ELSIF v_menu_with_image > 0 THEN v_score := v_score + 5; END IF;

  IF v_branches >= 1 THEN v_score := v_score + 15; END IF;
  IF v_branches_with_chat >= 1 THEN v_score := v_score + 10; END IF;
  IF v_zones >= 1 THEN v_score := v_score + 15; END IF;
  IF v_open_hours_set THEN v_score := v_score + 10; END IF;
  IF v_menu_images >= 1 THEN v_score := v_score + 10; END IF;
  IF v_has_bot THEN v_score := v_score + 5; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  v_checklist := jsonb_build_array(
    jsonb_build_object('key','menu_items','label','أصناف منيو متوفرة','ok', v_menu_available >= 3, 'value', v_menu_available),
    jsonb_build_object('key','menu_item_images','label','صور للأصناف','ok', v_menu_with_image >= 5, 'value', v_menu_with_image),
    jsonb_build_object('key','branches','label','فروع مفعّلة','ok', v_branches >= 1, 'value', v_branches),
    jsonb_build_object('key','branch_telegram','label','إشعارات تلغرام للفروع','ok', v_branches_with_chat >= 1, 'value', v_branches_with_chat),
    jsonb_build_object('key','delivery_zones','label','مناطق توصيل مع أجور','ok', v_zones >= 1, 'value', v_zones),
    jsonb_build_object('key','open_hours','label','ساعات عمل محددة','ok', v_open_hours_set, 'value', v_open_hours_set),
    jsonb_build_object('key','menu_images','label','صور منيو عامة','ok', v_menu_images >= 1, 'value', v_menu_images),
    jsonb_build_object('key','telegram_bot','label','بوت تلغرام مربوط','ok', v_has_bot, 'value', v_has_bot)
  );

  RETURN jsonb_build_object('score', v_score, 'checklist', v_checklist);
END $$;
