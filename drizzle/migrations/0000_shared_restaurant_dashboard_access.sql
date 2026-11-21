CREATE POLICY "restaurant admins read shared restaurants" ON public.restaurants FOR SELECT TO authenticated USING (public.has_role(auth.uid(), id, 'admin'::public.app_role));
DO $migration$
DECLARE p record; q text; w text;
BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename <> 'restaurants' AND (qual LIKE '%r.owner_id = auth.uid()%' OR with_check LIKE '%r.owner_id = auth.uid()%') LOOP
 q := replace(p.qual, '(r.owner_id = auth.uid())', 'public.has_role(auth.uid(), r.id, ''admin''::public.app_role)');
 w := replace(p.with_check, '(r.owner_id = auth.uid())', 'public.has_role(auth.uid(), r.id, ''admin''::public.app_role)');
 EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s', 'shared admins ' || p.policyname, p.tablename, p.cmd, CASE WHEN q IS NULL THEN '' ELSE ' USING (' || q || ')' END, CASE WHEN w IS NULL THEN '' ELSE ' WITH CHECK (' || w || ')' END);
 END LOOP;
END $migration$;