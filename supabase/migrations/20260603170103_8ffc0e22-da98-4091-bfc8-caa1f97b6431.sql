CREATE OR REPLACE FUNCTION public.try_mark_update(_channel text, _key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.processed_updates (channel, update_key)
  VALUES (_channel, _key)
  ON CONFLICT (channel, update_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Best-effort cleanup: keep only recent Telegram update markers.
  DELETE FROM public.processed_updates WHERE processed_at < now() - interval '24 hours';

  RETURN v_inserted;
END
$$;