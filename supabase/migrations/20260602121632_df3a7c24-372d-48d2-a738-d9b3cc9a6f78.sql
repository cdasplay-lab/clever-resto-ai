CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  title text NOT NULL,
  message_template text NOT NULL,
  channel text NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram','instagram','facebook','whatsapp')),
  segment text NOT NULL DEFAULT 'all' CHECK (segment IN ('all','vip','recent','inactive','custom_handles')),
  segment_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sending','sent','failed','cancelled')),
  scheduled_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_campaigns_restaurant_created ON public.marketing_campaigns (restaurant_id, created_at DESC);

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL,
  channel text NOT NULL,
  customer_handle text NOT NULL,
  customer_name text,
  external_chat_id text,
  rendered_message text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campaign_recipients_unique ON public.campaign_recipients (campaign_id, channel, customer_handle);
CREATE INDEX campaign_recipients_campaign ON public.campaign_recipients (campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
GRANT SELECT ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own marketing_campaigns"
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = marketing_campaigns.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = marketing_campaigns.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "owners read own campaign_recipients"
  ON public.campaign_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = campaign_recipients.restaurant_id AND r.owner_id = auth.uid()));

CREATE TRIGGER marketing_campaigns_touch
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.approve_campaign(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; v_status text;
BEGIN
  SELECT r.owner_id, c.status INTO v_owner, v_status
  FROM public.marketing_campaigns c
  JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE c.id = _campaign_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'only_draft_can_be_approved'; END IF;
  UPDATE public.marketing_campaigns
    SET status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now()
    WHERE id=_campaign_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_campaign(uuid) TO authenticated;