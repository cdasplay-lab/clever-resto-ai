
-- 1) Add platform_admin to enum (will be usable in next statement only via text cast)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

-- 2) Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  price_iqd numeric NOT NULL DEFAULT 0,
  max_branches integer NOT NULL DEFAULT 1,
  max_ai_replies integer NOT NULL DEFAULT 0,
  max_confirmed_orders integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_custom boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authed reads plans" ON public.plans FOR SELECT TO authenticated USING (true);

CREATE TABLE public.restaurant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active',
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL,
  activated_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_rest ON public.restaurant_subscriptions(restaurant_id, status, period_end);
GRANT SELECT ON public.restaurant_subscriptions TO authenticated;
GRANT ALL ON public.restaurant_subscriptions TO service_role;
ALTER TABLE public.restaurant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  ai_replies_used integer NOT NULL DEFAULT 0,
  confirmed_orders_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, period_start)
);
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  kind text NOT NULL,
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uev_rest ON public.usage_events(restaurant_id, created_at DESC);
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- is_platform_admin uses TEXT cast to avoid the "enum not committed yet" error
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'platform_admin'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

CREATE POLICY "owners read own subs" ON public.restaurant_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_subscriptions.restaurant_id AND r.owner_id = auth.uid())
         OR public.is_platform_admin(auth.uid()));
CREATE POLICY "admin manage subs" ON public.restaurant_subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "owners read own counters" ON public.usage_counters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = usage_counters.restaurant_id AND r.owner_id = auth.uid())
         OR public.is_platform_admin(auth.uid()));

CREATE POLICY "owners read own events" ON public.usage_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = usage_events.restaurant_id AND r.owner_id = auth.uid())
         OR public.is_platform_admin(auth.uid()));

CREATE POLICY "admin manage user_roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.activate_subscription(_restaurant_id uuid, _plan_code text, _months integer DEFAULT 1)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan_id uuid; v_sub_id uuid; v_start timestamptz := now(); v_end timestamptz;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id INTO v_plan_id FROM public.plans WHERE code = _plan_code AND is_active = true;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  v_end := v_start + (COALESCE(_months,1) || ' months')::interval;
  UPDATE public.restaurant_subscriptions SET status='expired', updated_at=now()
    WHERE restaurant_id=_restaurant_id AND status='active';
  INSERT INTO public.restaurant_subscriptions(restaurant_id, plan_id, status, period_start, period_end, activated_by)
    VALUES (_restaurant_id, v_plan_id, 'active', v_start, v_end, auth.uid())
    RETURNING id INTO v_sub_id;
  INSERT INTO public.usage_counters(restaurant_id, period_start) VALUES (_restaurant_id, v_start)
    ON CONFLICT (restaurant_id, period_start) DO NOTHING;
  RETURN v_sub_id;
END $$;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_subscription_status(_sub_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _status NOT IN ('active','suspended','expired','cancelled') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.restaurant_subscriptions SET status=_status, updated_at=now() WHERE id=_sub_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_subscription_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_quota(_restaurant_id uuid, _kind text, _ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub record; v_branch_count integer; v_limit integer; v_used integer;
BEGIN
  SELECT s.*, p.max_branches, p.max_ai_replies, p.max_confirmed_orders, p.code AS plan_code
    INTO v_sub FROM public.restaurant_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.restaurant_id=_restaurant_id AND s.status='active' AND s.period_end > now()
    ORDER BY s.period_start DESC LIMIT 1;
  IF v_sub.id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription'); END IF;

  SELECT COUNT(*) INTO v_branch_count FROM public.branches WHERE restaurant_id=_restaurant_id AND is_active=true;
  IF v_branch_count > v_sub.max_branches THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'branch_limit_exceeded', 'branches', v_branch_count, 'max_branches', v_sub.max_branches);
  END IF;

  INSERT INTO public.usage_counters(restaurant_id, period_start) VALUES (_restaurant_id, v_sub.period_start)
    ON CONFLICT (restaurant_id, period_start) DO NOTHING;

  IF _kind = 'ai_reply' THEN
    v_limit := v_sub.max_ai_replies;
    UPDATE public.usage_counters SET ai_replies_used=ai_replies_used+1, updated_at=now()
      WHERE restaurant_id=_restaurant_id AND period_start=v_sub.period_start RETURNING ai_replies_used INTO v_used;
    IF v_used > v_limit THEN
      UPDATE public.usage_counters SET ai_replies_used=ai_replies_used-1
        WHERE restaurant_id=_restaurant_id AND period_start=v_sub.period_start;
      RETURN jsonb_build_object('allowed', false, 'reason', 'ai_reply_limit', 'used', v_used-1, 'limit', v_limit);
    END IF;
  ELSIF _kind = 'confirmed_order' THEN
    v_limit := v_sub.max_confirmed_orders;
    UPDATE public.usage_counters SET confirmed_orders_used=confirmed_orders_used+1, updated_at=now()
      WHERE restaurant_id=_restaurant_id AND period_start=v_sub.period_start RETURNING confirmed_orders_used INTO v_used;
    IF v_used > v_limit THEN
      UPDATE public.usage_counters SET confirmed_orders_used=confirmed_orders_used-1
        WHERE restaurant_id=_restaurant_id AND period_start=v_sub.period_start;
      RETURN jsonb_build_object('allowed', false, 'reason', 'order_limit', 'used', v_used-1, 'limit', v_limit);
    END IF;
  ELSE
    RETURN jsonb_build_object('allowed', false, 'reason', 'unknown_kind');
  END IF;

  INSERT INTO public.usage_events(restaurant_id, kind, ref_id) VALUES (_restaurant_id, _kind, _ref);
  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
END $$;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_subscription(_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_sub record; v_counter record; v_branches integer;
BEGIN
  SELECT owner_id INTO v_owner FROM public.restaurants WHERE id=_restaurant_id;
  IF v_owner IS NULL OR (v_owner <> auth.uid() AND NOT public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT s.*, p.code AS plan_code, p.name_ar AS plan_name, p.price_iqd, p.max_branches, p.max_ai_replies, p.max_confirmed_orders, p.features
    INTO v_sub FROM public.restaurant_subscriptions s JOIN public.plans p ON p.id=s.plan_id
    WHERE s.restaurant_id=_restaurant_id ORDER BY s.period_start DESC LIMIT 1;
  IF v_sub.id IS NULL THEN RETURN jsonb_build_object('subscription', null); END IF;
  SELECT * INTO v_counter FROM public.usage_counters WHERE restaurant_id=_restaurant_id AND period_start=v_sub.period_start;
  SELECT COUNT(*) INTO v_branches FROM public.branches WHERE restaurant_id=_restaurant_id AND is_active=true;
  RETURN jsonb_build_object(
    'subscription', jsonb_build_object('id',v_sub.id,'status',v_sub.status,'period_start',v_sub.period_start,'period_end',v_sub.period_end,
      'plan_code',v_sub.plan_code,'plan_name',v_sub.plan_name,'price_iqd',v_sub.price_iqd,
      'max_branches',v_sub.max_branches,'max_ai_replies',v_sub.max_ai_replies,'max_confirmed_orders',v_sub.max_confirmed_orders,'features',v_sub.features),
    'usage', jsonb_build_object('ai_replies_used',COALESCE(v_counter.ai_replies_used,0),
      'confirmed_orders_used',COALESCE(v_counter.confirmed_orders_used,0),'branches_used',v_branches)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_my_subscription(uuid) TO authenticated;

INSERT INTO public.plans(code, name_ar, name_en, price_iqd, max_branches, max_ai_replies, max_confirmed_orders, features, sort_order, is_custom) VALUES
('starter','الباقة الأساسية','Starter',35000,1,1000,50,'{"channels":["telegram"],"languages":["ar"],"story_comments":false,"staff_mgmt":false,"reports":"basic","support":"standard"}'::jsonb,1,false),
('growth','باقة النمو','Growth',75000,3,5000,250,'{"channels":["telegram","whatsapp"],"languages":["ar"],"story_comments":true,"staff_mgmt":true,"reports":"basic","support":"fast"}'::jsonb,2,false),
('pro','الباقة الاحترافية','Pro',150000,10,20000,1000,'{"channels":["telegram","whatsapp","instagram","facebook"],"languages":["ar-iq","ar","en"],"story_comments":true,"staff_mgmt":true,"reports":"advanced","support":"priority","custom_training":true}'::jsonb,3,false),
('enterprise','باقة المؤسسات','Enterprise',0,999,999999,999999,'{"channels":["all"],"languages":["all"],"custom":true,"sla":true,"support":"dedicated"}'::jsonb,4,true)
ON CONFLICT (code) DO NOTHING;
